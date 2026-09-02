let map;
let selectedLocation = null;
let starMarkers = [];
let locationMarker = null;
let constellationInfoCache = {};

// Initialize map
function initMap() {
    map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        zoomControl: true
    });
    
    // Regular color map tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);

    // Add click event to map
    map.on('click', function(e) {
        // Check if click was on a constellation label marker
        if (e.originalEvent && e.originalEvent.target) {
            const target = e.originalEvent.target;
            // Allow constellation label clicks to pass through for popups
            if (target.closest('.constellation-label')) {
                return; // Don't select location if clicking constellation label
            }
        }
        selectLocation(e.latlng.lat, e.latlng.lng);
    });
}

// Fetch constellation information from Gemini API
async function getConstellationInfo(constellationName) {
    // Check cache first
    if (constellationInfoCache[constellationName]) {
        return constellationInfoCache[constellationName];
    }
    
    try {
        const response = await fetch(`/constellation_info/${encodeURIComponent(constellationName)}`);
        const result = await response.json();
        
        if (result.success && result.data) {
            constellationInfoCache[constellationName] = result.data;
            return result.data;
        } else if (result.fallback) {
            return result.fallback;
        }
        return null;
    } catch (error) {
        console.error('Error fetching constellation info:', error);
        return null;
    }
}

function selectLocation(lat, lng) {
    selectedLocation = { lat: lat, lon: lng };
    
    // Remove old marker
    if (locationMarker) {
        map.removeLayer(locationMarker);
    }

    // Add new marker
    locationMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'location-marker',
            html: '📍',
            iconSize: [30, 30]
        })
    }).addTo(map);

    // Update UI
    document.getElementById('selectedLat').textContent = `Latitude: ${lat.toFixed(6)}`;
    document.getElementById('selectedLon').textContent = `Longitude: ${lng.toFixed(6)}`;
    document.getElementById('generateBtn').disabled = false;

    // Clear previous stars
    clearStars();
}

function clearStars() {
    starMarkers.forEach(marker => map.removeLayer(marker));
    starMarkers = [];
    document.getElementById('starCount').innerHTML = '';
    
    // Remove dark mode when clearing
    document.getElementById('map').classList.remove('dark-mode');
}

async function generateStars() {
    if (!selectedLocation) {
        showStatus('Please select a location on the map first!', 'error');
        return;
    }

    const dateInput = document.getElementById('dateInput').value;
    const timeInput = document.getElementById('timeInput').value;

    if (!dateInput || !timeInput) {
        showStatus('Please enter date and time!', 'error');
        return;
    }

    showStatus('Generating star positions...', 'success');
    clearStars();
    
    // Switch to dark mode
    document.getElementById('map').classList.add('dark-mode');

    try {
        const response = await fetch('/generate_stars', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                lat: selectedLocation.lat,
                lon: selectedLocation.lon,
                date: dateInput,
                time: timeInput
            })
        });

        const data = await response.json();

        if (data.success) {
            displayStars(data.stars, data.constellation_lines, data.constellation_centers);
            showStatus(`Found ${data.stars.length} visible stars!`, 'success');
        } else {
            showStatus('Error: ' + data.error, 'error');
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
}

function displayStars(stars, constellationLines, constellationCenters) {
    if (stars.length === 0) {
        document.getElementById('starCount').innerHTML = 'No visible stars at this time';
        return;
    }

    // Separate constellation stars from regular stars
    const constellationStars = stars.filter(s => s.is_constellation_star);
    const regularStars = stars.filter(s => !s.is_constellation_star);

    // Group by constellation for counting
    const constellations = {};
    constellationStars.forEach(star => {
        if (!constellations[star.constellation]) {
            constellations[star.constellation] = 0;
        }
        constellations[star.constellation]++;
    });

    // Update count display
    const constCount = Object.keys(constellations).length;
    const constList = Object.entries(constellations).map(([name, count]) => `${name} (${count})`).join(', ');
    document.getElementById('starCount').innerHTML = `
        <strong>${constellationStars.length}</strong> constellation stars | 
        <strong>${regularStars.length}</strong> other stars<br>
        <small style="font-size:11px; color:#888;">${constList}</small>
    `;

    // Display constellation lines first (behind stars)
    if (constellationLines && constellationLines.length > 0) {
        constellationLines.forEach(line => {
            const distance1 = (line.star1.alt / 90) * 15;
            const lat1 = selectedLocation.lat + distance1 * Math.cos(line.star1.az * Math.PI / 180);
            const lon1 = selectedLocation.lon + distance1 * Math.sin(line.star1.az * Math.PI / 180);
            
            const distance2 = (line.star2.alt / 90) * 15;
            const lat2 = selectedLocation.lat + distance2 * Math.cos(line.star2.az * Math.PI / 180);
            const lon2 = selectedLocation.lon + distance2 * Math.sin(line.star2.az * Math.PI / 180);
            
            const polyline = L.polyline([[lat1, lon1], [lat2, lon2]], {
                color: '#4a90e2',
                weight: 2,
                opacity: 0.7
            }).addTo(map);
            
            starMarkers.push(polyline);
        });
    }

    // Display regular stars first (smaller, behind constellation stars)
    regularStars.forEach(star => {
        const distance = (star.altitude / 90) * 15;
        const starLat = selectedLocation.lat + distance * Math.cos(star.azimuth * Math.PI / 180);
        const starLon = selectedLocation.lon + distance * Math.sin(star.azimuth * Math.PI / 180);

        // Smaller size for regular stars
        const starSize = Math.max(2, 8 - star.magnitude * 1.5);
        
        // Create subtle star marker
        const marker = L.circleMarker([starLat, starLon], {
            radius: starSize,
            fillColor: '#ddddff',
            color: '#8888ff',
            weight: 1,
            opacity: 0.6,
            fillOpacity: 0.5,
            className: 'regular-star-glow'
        }).addTo(map);

        // Add subtle glow
        const glow = L.circleMarker([starLat, starLon], {
            radius: starSize * 1.5,
            fillColor: '#8888ff',
            color: 'transparent',
            weight: 0,
            opacity: 0.2,
            fillOpacity: 0.15
        }).addTo(map);

        marker.bindPopup(`
            <div style="text-align:center;">
                <strong style="font-size:14px; color:#ddddff;">⭐ ${star.name}</strong><br>
                <div style="text-align:left; font-size:11px; margin-top:5px;">
                Altitude: ${star.altitude.toFixed(1)}°<br>
                Azimuth: ${star.azimuth.toFixed(1)}°<br>
                Magnitude: ${star.magnitude.toFixed(2)}
                </div>
            </div>
        `);

        starMarkers.push(marker);
        starMarkers.push(glow);
    });

    // Display constellation stars (larger, brighter, on top)
    constellationStars.forEach(star => {
        const distance = (star.altitude / 90) * 15;
        const starLat = selectedLocation.lat + distance * Math.cos(star.azimuth * Math.PI / 180);
        const starLon = selectedLocation.lon + distance * Math.sin(star.azimuth * Math.PI / 180);

        // Larger size for constellation stars
        const starSize = Math.max(5, 18 - star.magnitude * 2.5);
        
        // Create prominent star marker
        const marker = L.circleMarker([starLat, starLon], {
            radius: starSize,
            fillColor: '#ffffff',
            color: '#ffd700',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.9,
            className: 'constellation-star-glow'
        }).addTo(map);

        // Add strong glow effect
        const glow = L.circleMarker([starLat, starLon], {
            radius: starSize * 2.5,
            fillColor: '#ffd700',
            color: 'transparent',
            weight: 0,
            opacity: 0.4,
            fillOpacity: 0.3
        }).addTo(map);

        marker.bindPopup(`
            <div style="text-align:center;">
                <strong style="font-size:16px; color:#ffd700;">✨ ${star.name}</strong><br>
                <em style="color:#53a8ff;">${star.constellation}</em><br><br>
                <div style="text-align:left; font-size:12px;">
                Altitude: ${star.altitude.toFixed(1)}°<br>
                Azimuth: ${star.azimuth.toFixed(1)}°<br>
                Magnitude: ${star.magnitude.toFixed(2)}
                </div>
            </div>
        `);

        starMarkers.push(marker);
        starMarkers.push(glow);
    });

    // Display constellation name labels
    if (constellationCenters && Object.keys(constellationCenters).length > 0) {
        console.log('Constellation centers received:', Object.keys(constellationCenters));
        
        for (const [constAbbr, center] of Object.entries(constellationCenters)) {
            const distance = (center.alt / 90) * 15;
            const labelLat = selectedLocation.lat + distance * Math.cos(center.az * Math.PI / 180);
            const labelLon = selectedLocation.lon + distance * Math.sin(center.az * Math.PI / 180);
            
            const displayName = constAbbr;
            
            const label = L.marker([labelLat, labelLon], {
                icon: L.divIcon({
                    className: 'constellation-label',
                    html: `<span>${displayName}</span>`,
                    iconSize: [null, null]
                }),
                interactive: true,
                zIndexOffset: 1000
            }).addTo(map);

            // Bind click event to fetch and display constellation info
            label.on('click', async function() {
                // Show loading popup
                label.bindPopup(`
                    <div class="constellation-popup">
                        <h3>✨ ${displayName}</h3>
                        <p>Loading information...</p>
                    </div>
                `, {
                    maxWidth: 350,
                    className: 'constellation-info-popup'
                }).openPopup();
                
                // Fetch from Gemini API
                const constInfo = await getConstellationInfo(constAbbr);
                
                if (constInfo && constInfo.name) {
                    label.bindPopup(`
                        <div class="constellation-popup">
                            <h3>✨ ${constInfo.name}</h3>
                            <h4>${constInfo.common_name}</h4>
                            
                            <h4>Description</h4>
                            <p>${constInfo.description}</p>
                            
                            <h4>Mythology & History</h4>
                            <p>${constInfo.history}</p>
                            
                            <h4>Best Viewing</h4>
                            <p>${constInfo.best_viewing}</p>
                            
                            <h4>Notable Features</h4>
                            <p class="feature">${constInfo.notable_features}</p>
                        </div>
                    `, {
                        maxWidth: 350,
                        className: 'constellation-info-popup',
                        autoClose: false,
                        closeOnClick: false
                    }).openPopup();
                } else {
                    label.bindPopup(`
                        <div class="constellation-popup">
                            <h3>✨ ${displayName}</h3>
                            <p>Constellation information not available.</p>
                        </div>
                    `, {
                        maxWidth: 350,
                        className: 'constellation-info-popup'
                    }).openPopup();
                }
            });

            starMarkers.push(label);
        }
        
        // Prevent map location selection when clicking constellation labels
        // but allow popup to open
        setTimeout(() => {
            const labels = document.querySelectorAll('.constellation-label');
            labels.forEach(labelEl => {
                // Remove the click handler that was blocking popups
                labelEl.style.cursor = 'pointer';
            });
        }, 100);
    }

    // Zoom to show all stars
    if (stars.length > 0) {
        const starPositions = stars.map(star => {
            const distance = (star.altitude / 90) * 15;
            const lat = selectedLocation.lat + distance * Math.cos(star.azimuth * Math.PI / 180);
            const lon = selectedLocation.lon + distance * Math.sin(star.azimuth * Math.PI / 180);
            return L.latLng(lat, lon);
        });
        const bounds = L.latLngBounds(starPositions);
        map.fitBounds(bounds, { padding: [100, 100], maxZoom: 8 });
    }
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMsg');
    statusDiv.className = `status ${type}`;
    statusDiv.textContent = message;
    
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = '';
        }, 3000);
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Set default date to today
    document.getElementById('dateInput').valueAsDate = new Date();
    
    // Initialize map
    initMap();
});
