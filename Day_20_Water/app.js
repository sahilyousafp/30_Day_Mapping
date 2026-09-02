// Mapbox access token, loaded from config.js (gitignored - see config.example.js)
if (!window.MAPBOX_TOKEN || window.MAPBOX_TOKEN === 'YOUR_MAPBOX_TOKEN_HERE') {
    const codeStyle = 'background:#1b2230;border-radius:4px;padding:.15em .4em;' +
        'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em';
    document.body.insertAdjacentHTML('afterbegin', `
        <div style="position:fixed;inset:0;z-index:9999;box-sizing:border-box;display:flex;
                    align-items:center;justify-content:center;padding:2rem;background:#0b0f14">
          <div style="max-width:34rem;text-align:center;color:#e6edf3;
                      font:400 16px/1.7 system-ui,-apple-system,'Segoe UI',sans-serif">
            <div style="font-size:1.25rem;font-weight:600;margin-bottom:.75rem">Missing Mapbox token</div>
            <div>Copy <code style="${codeStyle}">config.example.js</code> to <code style="${codeStyle}">config.js</code> and set your token.</div>
            <div style="margin-top:1rem;opacity:.6;font-size:.9em">Get a free token at account.mapbox.com/access-tokens</div>
          </div>
        </div>`);
    throw new Error('Missing Mapbox token: copy config.example.js to config.js and set window.MAPBOX_TOKEN.');
}
mapboxgl.accessToken = window.MAPBOX_TOKEN;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11', // Dark style as base
    projection: 'globe',
    zoom: 1.5,
    center: [0, 20],
    antialias: true // Create smoother lines
});

// UI Elements
const btnParticles = document.getElementById('btn-particles');
const btnHeatmap = document.getElementById('btn-heatmap');
const loadingIndicator = document.getElementById('loading-indicator');
// The indicator holds a spinner plus a label; only ever write to the label.
const loadingLabel = loadingIndicator.querySelector('span');

let currentMode = 'particles'; // 'particles' or 'heatmap'
let oceanData = null;

// Sampling grid, in degrees. Open-Meteo's free tier allows roughly 600 locations per
// minute; a 10 degree grid over -80..80 is 16 x 36 = 576 points, so the whole globe fits
// inside one minute's budget. A 5 degree grid needs 2304 points and gets cut off by HTTP
// 429 about a third of the way through, which silently left only the southern ocean
// populated. GRID_STEP is shared with getVector so lookups land on sampled coordinates.
const GRID_STEP = 10;

// Global Event Listeners
btnParticles.addEventListener('click', () => {
    console.log("Switched to Particles mode");
    currentMode = 'particles';
    btnParticles.classList.add('active');
    btnHeatmap.classList.remove('active');

    if (map.getLayer('currents-heatmap')) map.setLayoutProperty('currents-heatmap', 'visibility', 'none');
    if (map.getLayer('hotspot-circles')) map.setLayoutProperty('hotspot-circles', 'visibility', 'none');
    if (map.getLayer('hotspot-labels')) map.setLayoutProperty('hotspot-labels', 'visibility', 'none');
});

btnHeatmap.addEventListener('click', () => {
    console.log("Switched to Heatmap mode");
    currentMode = 'heatmap';
    btnHeatmap.classList.add('active');
    btnParticles.classList.remove('active');

    if (map.getLayer('currents-heatmap')) map.setLayoutProperty('currents-heatmap', 'visibility', 'visible');
    if (map.getLayer('hotspot-circles')) map.setLayoutProperty('hotspot-circles', 'visibility', 'visible');
    if (map.getLayer('hotspot-labels')) map.setLayoutProperty('hotspot-labels', 'visibility', 'visible');
});

map.on('style.load', () => {
    map.setFog({
        'color': 'rgb(10, 25, 47)', // Lower atmosphere
        'high-color': 'rgb(4, 12, 28)', // Upper atmosphere
        'horizon-blend': 0.02, // Atmosphere thickness (default 0.2 at low zooms)
        'space-color': 'rgb(4, 12, 28)', // Background color
        'star-intensity': 0.6 // Background star brightness (default 0.35 at low zooms )
    });
});

map.on('load', async () => {
    // Add solid earth style layers if needed, or rely on mapbox dark style
    // We will add a custom water layer color to make it look deep

    if (map.getLayer('water')) {
        map.setPaintProperty('water', 'fill-color', '#0a192f');
    }

    await fetchOceanData();
});

async function fetchOceanData() {
    loadingIndicator.classList.remove('hidden');
    console.log("Fetching ocean data...");

    // Build the full sample grid, then send it in batches the API will accept.
    const locations = [];
    for (let lat = -80; lat < 80; lat += GRID_STEP) {
        for (let lon = -180; lon < 180; lon += GRID_STEP) {
            locations.push({ lat, lon });
        }
    }

    const BATCH_SIZE = 144;
    const batches = [];
    for (let i = 0; i < locations.length; i += BATCH_SIZE) {
        batches.push(locations.slice(i, i + BATCH_SIZE));
    }

    const delay = ms => new Promise(res => setTimeout(res, ms));

    // One batch, retrying when the API says we have exceeded its per-minute limit.
    async function fetchBatch(batch, attempt = 0) {
        const latStr = batch.map(l => l.lat).join(',');
        const lonStr = batch.map(l => l.lon).join(',');
        const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${latStr}` +
                    `&longitude=${lonStr}&current=ocean_current_velocity,ocean_current_direction` +
                    `&timezone=auto`;

        const response = await fetch(url);

        if (response.status === 429 && attempt < 2) {
            // Retry-After is in seconds when present; the limit is per minute otherwise.
            const retryAfter = Number(response.headers.get('Retry-After')) || 60;
            console.warn(`Rate limited, waiting ${retryAfter}s before retrying batch...`);
            loadingLabel.textContent = `Rate limited - retrying in ${retryAfter}s...`;
            await delay(retryAfter * 1000);
            return fetchBatch(batch, attempt + 1);
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return processChunk(await response.json(), batch);
    }

    let allFeatures = [];
    let failed = 0;

    for (let i = 0; i < batches.length; i++) {
        loadingLabel.textContent = `Loading ocean currents (${i + 1}/${batches.length})...`;
        try {
            await delay(100);
            allFeatures = allFeatures.concat(await fetchBatch(batches[i]));
        } catch (error) {
            failed++;
            console.warn(`Batch ${i + 1}/${batches.length} failed, skipping:`, error);
        }
    }

    console.log(`Total features fetched: ${allFeatures.length} of ${locations.length} sampled points`);
    if (failed > 0) {
        console.warn(`${failed} of ${batches.length} batches failed - coverage is incomplete.`);
    }

    if (allFeatures.length > 0) {
        oceanData = {
            type: 'FeatureCollection',
            features: allFeatures
        };
        initVisualization();
    } else {
        console.error("Failed to fetch any ocean data.");
        loadingLabel.textContent = 'Could not load ocean data - check the console.';
        loadingIndicator.querySelector('.spinner')?.remove();
        return;
    }

    loadingIndicator.classList.add('hidden');
}

function processChunk(apiData, locations) {
    let features = [];
    if (Array.isArray(apiData)) {

        features = apiData.map((locData, index) => {
            if (!locData.current) return null;

            // Land and no-data points come back with null values; NaN vectors from these
            // propagate into particle positions and make them disappear.
            if (locData.current.ocean_current_velocity == null ||
                locData.current.ocean_current_direction == null) return null;

            const lat = locations[index].lat;
            const lon = locations[index].lon;
            const velocity = locData.current.ocean_current_velocity;
            const direction = locData.current.ocean_current_direction;

            const rad = (direction - 90) * (Math.PI / 180);
            const u = velocity * Math.cos(rad);
            const v = velocity * Math.sin(rad);

            return {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [lon, lat]
                },
                properties: {
                    u: u,
                    v: v,
                    mag: velocity,
                    dir: direction
                }
            };
        }).filter(f => f !== null);
    }
    return features;
}

// Major Ocean Currents Data with History
const majorCurrents = [
    {
        name: "Gulf Stream",
        coords: [-45, 40],
        info: "First mapped by Benjamin Franklin in 1769, this warm Atlantic current originates in the Gulf of Mexico and warms Western Europe. It was crucial for colonial trade routes."
    },
    {
        name: "Kuroshio Current",
        coords: [145, 35],
        info: "Known as the 'Black Tide' for its deep blue color, this Pacific current is the counterpart to the Gulf Stream. It has supported Japanese fishing and culture for millennia."
    },
    {
        name: "Agulhas Current",
        coords: [32, -32],
        info: "The strongest western boundary current in the Southern Hemisphere. Portuguese explorers dubbed this region the 'Cape of Storms' due to the treacherous waves created where this current meets the Antarctic waters."
    },
    {
        name: "Humboldt Current",
        coords: [-78, -20],
        info: "Also known as the Peru Current, this cold, low-salinity flow supports one of the world's most productive marine ecosystems. Named after Prussian naturalist Alexander von Humboldt."
    },
    {
        name: "East Australian Current",
        coords: [155, -30],
        info: "Made famous by 'Finding Nemo', this warm current moves tropical water south down the Australian coast, influencing the climate of Sydney and Melbourne."
    },
    {
        name: "Antarctic Circumpolar",
        coords: [0, -55],
        info: "The world's strongest current and the only one that flows completely around the globe. It isolates Antarctica, keeping it frozen."
    }
];

function initVisualization() {
    if (!oceanData) return;

    // Grid for interpolation
    const grid = {};
    oceanData.features.forEach(f => {
        const lon = f.geometry.coordinates[0];
        const lat = f.geometry.coordinates[1];
        const key = `${Math.round(lat)},${Math.round(lon)}`;
        grid[key] = f.properties;
    });

    function getVector(lon, lat) {
        const step = GRID_STEP;
        const rLat = Math.round(lat / step) * step;
        const rLon = Math.round(lon / step) * step;
        const key = `${rLat},${rLon}`;
        return grid[key] || null;
    }

    // 1. Heatmap Layer (Blue base, Red hotspots)
    if (!map.getSource('ocean-currents')) {
        map.addSource('ocean-currents', {
            type: 'geojson',
            data: oceanData
        });

        map.addLayer({
            id: 'currents-heatmap',
            type: 'heatmap',
            source: 'ocean-currents',
            layout: { 'visibility': 'none' },
            paint: {
                'heatmap-weight': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 1.5, 1],
                'heatmap-intensity': 3,
                'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0, 'rgba(0,0,0,0)',
                    0.2, 'rgba(0, 119, 190, 0.5)', // Ocean Blue
                    0.5, 'rgba(0, 119, 190, 0.8)', // Blue
                    0.8, 'rgb(100, 100, 255)',    // Lighter Blue
                    0.95, 'rgb(255, 50, 50)',     // Red (Hotspots only)
                    1, 'rgb(255, 0, 0)'           // Deep Red
                ],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 5, 9, 30],
                'heatmap-opacity': 0.7
            }
        });
    } else {
        map.getSource('ocean-currents').setData(oceanData);
    }

    // 2. Named Hotspots Markers (Historical Info)
    if (!map.getSource('named-hotspots')) {
        const hotspotFeatures = majorCurrents.map(c => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: c.coords },
            properties: { title: c.name, description: c.info }
        }));

        map.addSource('named-hotspots', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: hotspotFeatures }
        });

        // Red Circles for Hotspots
        map.addLayer({
            id: 'hotspot-circles',
            type: 'circle',
            source: 'named-hotspots',
            layout: { 'visibility': 'none' },
            paint: {
                'circle-radius': 8,
                'circle-color': '#ff0000',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
                'circle-blur': 0.2
            }
        });

        // Text Labels
        map.addLayer({
            id: 'hotspot-labels',
            type: 'symbol',
            source: 'named-hotspots',
            layout: {
                'visibility': 'none',
                'text-field': ['get', 'title'],
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-offset': [0, 1.5],
                'text-anchor': 'top',
                'text-size': 12
            },
            paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#000000',
                'text-halo-width': 2
            }
        });

        // Popup Interaction
        map.on('click', 'hotspot-circles', (e) => {
            const coordinates = e.features[0].geometry.coordinates.slice();
            const description = e.features[0].properties.description;
            const title = e.features[0].properties.title;

            new mapboxgl.Popup()
                .setLngLat(coordinates)
                .setHTML(`<strong>${title}</strong><p>${description}</p>`)
                .addTo(map);
        });

        map.on('mouseenter', 'hotspot-circles', () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'hotspot-circles', () => {
            map.getCanvas().style.cursor = '';
        });
    }

    // 3. Animated Particle Layer (Blue mostly)
    if (map.getLayer('currents-particles')) {
        map.removeLayer('currents-particles');
    }

    const particleLayer = {
        id: 'currents-particles',
        type: 'custom',
        renderingMode: '2d',
        onAdd: function (map, gl) {
            this.map = map;
            this.canvas = document.createElement('canvas');
            this.context = this.canvas.getContext('2d');
            this.map.getCanvasContainer().appendChild(this.canvas);
            this.canvas.style.position = 'absolute';
            this.canvas.style.top = 0;
            this.canvas.style.left = 0;
            this.canvas.style.pointerEvents = 'none';
            this.canvas.style.zIndex = 2;
            this.resize();

            this.particles = [];
            for (let i = 0; i < 4000; i++) {
                this.particles.push(this.createParticle());
            }

            this.animate = this.animate.bind(this);
            requestAnimationFrame(this.animate);
        },

        createParticle: function () {
            return {
                lon: (Math.random() * 360) - 180,
                lat: (Math.random() * 160) - 80,
                age: Math.random() * 100,
                life: 50 + Math.random() * 100
            };
        },

        // map.project() returns CSS pixels, so the backing store is sized in device pixels
        // and then scaled. Sizing it from map.getCanvas().width (device pixels) without a
        // matching CSS size drew the particles offset and scaled on any display where
        // devicePixelRatio is not exactly 1.
        resize: function () {
            const mapCanvas = this.map.getCanvas();
            const dpr = window.devicePixelRatio || 1;
            this.cssWidth = mapCanvas.clientWidth;
            this.cssHeight = mapCanvas.clientHeight;
            this.canvas.width = Math.round(this.cssWidth * dpr);
            this.canvas.height = Math.round(this.cssHeight * dpr);
            this.canvas.style.width = this.cssWidth + 'px';
            this.canvas.style.height = this.cssHeight + 'px';
            this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
        },

        // On the globe, project() happily returns screen coordinates for points on the far
        // side, which drew those particles over the near hemisphere and piled them up along
        // the limb. Round-tripping through unproject gives back the point actually facing
        // the camera, so a mismatch means this one is hidden behind the globe.
        isFacingCamera: function (lon, lat) {
            const back = this.map.unproject(this.map.project([lon, lat]));
            const dLon = Math.abs(((back.lng - lon + 540) % 360) - 180);
            return dLon < 1 && Math.abs(back.lat - lat) < 1;
        },

        render: function (gl, matrix) {
            const mapCanvas = this.map.getCanvas();
            if (this.cssWidth !== mapCanvas.clientWidth || this.cssHeight !== mapCanvas.clientHeight) {
                this.resize();
            }
            this.map.triggerRepaint();
        },

        animate: function () {
            const ctx = this.context;
            const width = this.cssWidth;
            const height = this.cssHeight;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'source-over';

            if (currentMode !== 'particles') {
                requestAnimationFrame(this.animate);
                return;
            }

            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';

            for (let i = 0; i < this.particles.length; i++) {
                let p = this.particles[i];
                const vec = getVector(p.lon, p.lat);

                if (!vec) {
                    this.particles[i] = this.createParticle();
                    continue;
                }

                const speedScale = 0.15;
                p.lon += vec.u * speedScale;
                p.lat += vec.v * speedScale;
                p.age++;

                if (p.lon > 180) p.lon -= 360;
                if (p.lon < -180) p.lon += 360;

                if (p.age > p.life) {
                    this.particles[i] = this.createParticle();
                    continue;
                }

                if (!this.isFacingCamera(p.lon, p.lat)) continue;

                const screenP = this.map.project([p.lon, p.lat]);
                if (screenP.x < -10 || screenP.x > width + 10 || screenP.y < -10 || screenP.y > height + 10) {
                    continue;
                }

                const mag = vec.mag;
                // Blue for all, Red for hotspots
                let color = '#0077be'; // Standard Ocean Blue
                if (mag > 1.0) color = '#ff0000'; // Red for very fast currents (Hotspots)
                else if (mag > 0.5) color = '#00ccff'; // Lighter blue for medium

                ctx.strokeStyle = color;
                ctx.beginPath();
                const tailLon = p.lon - (vec.u * speedScale * 2);
                const tailLat = p.lat - (vec.v * speedScale * 2);
                const screenTail = this.map.project([tailLon, tailLat]);
                ctx.moveTo(screenTail.x, screenTail.y);
                ctx.lineTo(screenP.x, screenP.y);
                ctx.stroke();
            }
            requestAnimationFrame(this.animate);
        }
    };

    map.addLayer(particleLayer);
}
