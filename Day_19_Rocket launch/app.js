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
const MAPBOX_ACCESS_TOKEN = window.MAPBOX_TOKEN;

// Data URL
const CSV_URL = './Cleaned_Data_-_Space_Corrected.csv';

// Initialize Mapbox
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [20, 20],
    zoom: 1.8,
    pitch: 45,
    bearing: 0
});

const tooltip = document.getElementById('tooltip');
const loadingEl = document.getElementById('loading');

console.log('🌍 Map initialized');

// Extract country from location string
function extractCountry(location) {
    if (!location) return null;
    
    const parts = location.split(',');
    let country = parts[parts.length - 1].trim();
    
    // Map to ISO codes that Mapbox uses
    const countryMap = {
        'USA': 'US',
        'China': 'CN',
        'Russia': 'RU',
        'Kazakhstan': 'KZ',
        'French Guiana': 'FR',
        'France': 'FR',
        'New Zealand': 'NZ',
        'India': 'IN',
        'Japan': 'JP',
        'Israel': 'IL',
        'Iran': 'IR',
        'North Korea': 'KP',
        'South Korea': 'KR'
    };
    
    return countryMap[country] || null;
}

// Load CSV data
d3.csv(CSV_URL).then(launchData => {
    
    console.log('✅ CSV loaded:', launchData.length, 'launches');
    
    // Count launches by country ISO code
    const launchesByCountry = {};
    let totalLaunches = 0;
    
    launchData.forEach(row => {
        const countryCode = extractCountry(row.Location);
        if (countryCode) {
            launchesByCountry[countryCode] = (launchesByCountry[countryCode] || 0) + 1;
            totalLaunches++;
        }
    });
    
    console.log('📊 Launches by country:', launchesByCountry);
    
    // Find top country
    let topCountry = { code: 'N/A', name: 'N/A', count: 0 };
    Object.entries(launchesByCountry).forEach(([code, count]) => {
        if (count > topCountry.count) {
            const names = { 'US': 'USA', 'CN': 'China', 'RU': 'Russia', 'KZ': 'Kazakhstan', 
                          'FR': 'France', 'NZ': 'New Zealand', 'IN': 'India', 'JP': 'Japan',
                          'IL': 'Israel', 'IR': 'Iran', 'KP': 'North Korea', 'KR': 'South Korea' };
            topCountry = { code, name: names[code] || code, count };
        }
    });
    
    // Update stats
    document.getElementById('total-launches').textContent = totalLaunches;
    document.getElementById('country-count').textContent = Object.keys(launchesByCountry).length;
    document.getElementById('top-country').textContent = topCountry.name;
    
    // Wait for the style to be ready. The CSV request and the map load race each other:
    // if the style finished first, 'load' has already fired and a listener added now would
    // never run, leaving the loading spinner up forever.
    const whenStyleReady = fn => (map.isStyleLoaded() ? fn() : map.on('load', fn));

    whenStyleReady(() => {
        console.log('🗺️ Map loaded');
        
        // Use Mapbox's built-in country boundaries
        map.addSource('countries', {
            type: 'vector',
            url: 'mapbox://mapbox.country-boundaries-v1'
        });
        
        console.log('✅ Country boundaries source added');
        
        // Create match expression for colors based on ISO codes
        const fillColorExpression = ['match', ['get', 'iso_3166_1']];
        const fillOpacityExpression = ['match', ['get', 'iso_3166_1']];
        const extrusionHeightExpression = ['match', ['get', 'iso_3166_1']];
        const lineColorExpression = ['match', ['get', 'iso_3166_1']];
        const lineWidthExpression = ['match', ['get', 'iso_3166_1']];
        
        // Add each country with launches
        Object.entries(launchesByCountry).forEach(([countryCode, launchCount]) => {
            // Color based on launch count
            let color;
            if (launchCount <= 20) color = '#10b981';
            else if (launchCount <= 50) color = '#f59e0b';
            else if (launchCount <= 100) color = '#f97316';
            else if (launchCount <= 200) color = '#ef4444';
            else color = '#dc2626';
            
            fillColorExpression.push(countryCode, color);
            fillOpacityExpression.push(countryCode, 0.85);
            extrusionHeightExpression.push(countryCode, launchCount * 2500);
            lineColorExpression.push(countryCode, '#ffffff');
            lineWidthExpression.push(countryCode, 3);
        });
        
        // Default values for countries without launches
        fillColorExpression.push('rgba(50, 50, 50, 0.1)');
        fillOpacityExpression.push(0.05);
        extrusionHeightExpression.push(0);
        lineColorExpression.push('rgba(80, 80, 80, 0.3)');
        lineWidthExpression.push(0.5);
        
        // Add fill layer
        map.addLayer({
            'id': 'country-fills',
            'type': 'fill',
            'source': 'countries',
            'source-layer': 'country_boundaries',
            'paint': {
                'fill-color': fillColorExpression,
                'fill-opacity': fillOpacityExpression
            }
        });
        
        console.log('Fill layer added');
        
        // Add 3D extrusion layer
        map.addLayer({
            'id': 'country-extrusion',
            'type': 'fill-extrusion',
            'source': 'countries',
            'source-layer': 'country_boundaries',
            'paint': {
                'fill-extrusion-color': fillColorExpression,
                'fill-extrusion-height': extrusionHeightExpression,
                'fill-extrusion-base': 0,
                'fill-extrusion-opacity': 0.9
            }
        });
        
        console.log('Extrusion layer added');
        
        // Add borders
        map.addLayer({
            'id': 'country-borders',
            'type': 'line',
            'source': 'countries',
            'source-layer': 'country_boundaries',
            'paint': {
                'line-color': lineColorExpression,
                'line-width': lineWidthExpression,
                'line-opacity': 0.9
            }
        });
        
        console.log('Border layer added');
        
        // Add glow effect for countries with launches
        const glowFilterExpression = ['in', ['get', 'iso_3166_1'], ['literal', Object.keys(launchesByCountry)]];
        
        map.addLayer({
            'id': 'country-glow',
            'type': 'line',
            'source': 'countries',
            'source-layer': 'country_boundaries',
            'filter': glowFilterExpression,
            'paint': {
                'line-color': '#ffffff',
                'line-width': 6,
                'line-blur': 5,
                'line-opacity': 0.5
            }
        });
        
        console.log('Glow layer added');
        
        // Tooltip interaction
        map.on('mousemove', 'country-extrusion', (e) => {
            if (e.features.length > 0) {
                const feature = e.features[0];
                const isoCode = feature.properties.iso_3166_1;
                const launches = launchesByCountry[isoCode] || 0;
                
                if (launches > 0) {
                    map.getCanvas().style.cursor = 'pointer';
                    tooltip.style.display = 'block';
                    tooltip.style.left = e.point.x + 15 + 'px';
                    tooltip.style.top = e.point.y + 15 + 'px';
                    
                    const names = { 'US': 'USA', 'CN': 'China', 'RU': 'Russia', 'KZ': 'Kazakhstan', 
                                  'FR': 'France', 'NZ': 'New Zealand', 'IN': 'India', 'JP': 'Japan',
                                  'IL': 'Israel', 'IR': 'Iran', 'KP': 'North Korea', 'KR': 'South Korea' };
                    
                    tooltip.innerHTML = `
                        <div class="country-name">${names[isoCode] || feature.properties.name_en || isoCode}</div>
                        <div>🚀 ${launches} Launches</div>
                    `;
                }
            }
        });
        
        map.on('mouseleave', 'country-extrusion', () => {
            map.getCanvas().style.cursor = '';
            tooltip.style.display = 'none';
        });
        
        // Also for fill layer
        map.on('mousemove', 'country-fills', (e) => {
            if (e.features.length > 0) {
                const feature = e.features[0];
                const isoCode = feature.properties.iso_3166_1;
                const launches = launchesByCountry[isoCode] || 0;
                
                if (launches > 0) {
                    map.getCanvas().style.cursor = 'pointer';
                    tooltip.style.display = 'block';
                    tooltip.style.left = e.point.x + 15 + 'px';
                    tooltip.style.top = e.point.y + 15 + 'px';
                    
                    const names = { 'US': 'USA', 'CN': 'China', 'RU': 'Russia', 'KZ': 'Kazakhstan', 
                                  'FR': 'France', 'NZ': 'New Zealand', 'IN': 'India', 'JP': 'Japan',
                                  'IL': 'Israel', 'IR': 'Iran', 'KP': 'North Korea', 'KR': 'South Korea' };
                    
                    tooltip.innerHTML = `
                        <div class="country-name">${names[isoCode] || feature.properties.name_en || isoCode}</div>
                        <div>🚀 ${launches} Launches</div>
                    `;
                }
            }
        });
        
        map.on('mouseleave', 'country-fills', () => {
            map.getCanvas().style.cursor = '';
            tooltip.style.display = 'none';
        });
        
        // Hide loading
        loadingEl.classList.add('hidden');
        
        console.log('All layers rendered successfully!');
        
        // Auto-rotate
        let userInteracting = false;
        
        function rotateCamera() {
            if (!userInteracting) {
                map.setBearing((map.getBearing() + 0.2) % 360);
            }
            requestAnimationFrame(rotateCamera);
        }
        
        setTimeout(() => rotateCamera(), 1000);
        
        map.on('mousedown', () => { userInteracting = true; });
        map.on('mouseup', () => { setTimeout(() => userInteracting = false, 100); });
        map.on('dragend', () => { setTimeout(() => userInteracting = false, 100); });
        map.on('touchstart', () => { userInteracting = true; });
        map.on('touchend', () => { setTimeout(() => userInteracting = false, 100); });
    });
    
}).catch(error => {
    console.error('Error:', error);
    loadingEl.innerHTML = `
        <h2 style="color: #ef4444;">Error Loading Data</h2>
        <p style="color: #fff; margin-top: 10px;">${error.message}</p>
        <p style="color: #a0aec0; font-size: 12px; margin-top: 10px;">
            Make sure you're running from a web server (http://localhost:8000)
        </p>
    `;
});
