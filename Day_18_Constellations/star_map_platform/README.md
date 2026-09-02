# Star Constellation Map Platform

An interactive web-based star mapping platform that overlays real-time constellation data on an interactive map using Python, Flask, Skyfield, and Leaflet.js.

## Features

- 🗺️ **Interactive Map**: Click anywhere on the world map to select your viewing location
- 🌟 **Real Star Data**: Uses Skyfield library with Hipparcos star catalog for accurate positions
- ⭐ **Constellation Highlighting**: Constellation stars are larger and more prominent than background stars
- 🔗 **Constellation Lines**: Visual lines connecting stars to form constellation patterns
- 📝 **Constellation Information**: Click on constellation names to learn about their history, mythology, and features
- 🌙 **Time-Based Viewing**: Set any date and time to see how the sky looked/will look
- 🎨 **Dynamic Theming**: Starts with color map, switches to dark mode when generating stars

## Project Structure

```
star_map_platform/
├── app.py                          # Main Flask application
├── requirements.txt                # Python dependencies
│
├── templates/
│   ├── index.html                  # Main HTML template
│   └── index_old.html              # Backup of old version
│
├── static/
│   ├── css/
│   │   └── style.css               # All styling and themes
│   │
│   ├── js/
│   │   └── app.js                  # Frontend JavaScript logic
│   │
│   └── data/
│       └── constellation_info.json # Constellation descriptions and history
│
├── data/
│   └── constellation_info.json     # Source constellation data
│
└── README.md                       # This file
```

## Dependencies

The platform uses the following external data files (located in parent directory):
- `de421.bsp` - JPL planetary ephemeris data
- `hip_main.dat` - Hipparcos star catalog
- `StarMapGenerator/constellationship.fab` - Constellation line patterns

## Installation

1. Ensure Python virtual environment is activated:
```bash
D:\Learn\GEOSPATIAL_30 day\30day\Scripts\activate
```

2. Install required packages:
```bash
pip install -r requirements.txt
```

Required packages:
- Flask>=3.0.0
- skyfield>=1.48
- pandas>=2.0.0
- numpy>=1.24.0

## Usage

1. Start the Flask server:
```bash
python app.py
```

2. Open your browser and navigate to:
```
http://127.0.0.1:5001
```

3. Using the platform:
   - Click anywhere on the map to select your viewing location
   - Enter the date and time you want to view the sky
   - Click "Generate Stars" button
   - The map will switch to dark mode and overlay:
     - **Constellation stars**: Large, bright, gold stars
     - **Background stars**: Smaller, subtle blue-white stars
     - **Constellation lines**: Blue lines connecting constellation stars
     - **Constellation labels**: Clickable names at constellation centers
   - Click on any star for detailed information
   - Click on constellation names for history and mythology

## Technical Details

### Backend (app.py)
- **Flask Framework**: Serves web application and API endpoints
- **Skyfield Library**: Calculates precise star positions based on observer location and time
- **Hipparcos Catalog**: Contains data for ~118,000 stars
- **Star Classification**: Automatically identifies which stars belong to constellations
- **Position Calculation**: Converts celestial coordinates (RA/Dec) to observer-relative coordinates (Alt/Az)

### Frontend (app.js)
- **Leaflet.js**: Interactive map rendering
- **Dynamic Layers**: Separate rendering for constellation vs. background stars
- **Visual Hierarchy**: 
  - Constellation stars: 5-18px radius (magnitude-based)
  - Background stars: 2-8px radius (magnitude-based)
- **Constellation Centers**: Calculated as average position of constellation stars
- **Responsive Popups**: Different styles for stars vs. constellations

### Styling (style.css)
- **Dark Mode Transition**: Smooth filter transition when generating stars
- **Glow Effects**: 
  - Strong gold glow for constellation stars
  - Subtle blue glow for background stars
- **Constellation Labels**: Prominent, clickable badges with hover effects
- **Responsive Design**: Adapts to different screen sizes

## Constellation Data

The platform includes detailed information for 12 major constellations:
- Orion (The Hunter)
- Ursa Major (The Great Bear)
- Cassiopeia (The Queen)
- Leo (The Lion)
- Cygnus (The Swan)
- Scorpius (The Scorpion)
- Taurus (The Bull)
- Gemini (The Twins)
- Virgo (The Maiden)
- Aquarius (The Water Bearer)
- Andromeda (The Chained Maiden)
- Perseus (The Hero)

Each constellation entry includes:
- Name and common name
- Description
- Mythology and history
- Best viewing season
- Notable features (stars, nebulae, clusters)

## Customization

### Adding More Constellations
Edit `data/constellation_info.json` to add new constellation data.

### Adjusting Star Visibility
In `app.py`, modify the magnitude filter (line ~60):
```python
bright_stars = self.stars_df[self.stars_df['magnitude'] <= 4.5].copy()
# Change 4.5 to higher value for more stars, lower for fewer
```

### Changing Star Sizes
In `static/js/app.js`, adjust the size calculations (lines ~200-240).

## Credits

- **Hipparcos Star Catalog**: ESA
- **Skyfield Library**: Brandon Rhodes
- **Leaflet.js**: Vladimir Agafonkin
- **Constellation Data**: Various astronomical sources

## License

Educational project - Part of 30-Day Geospatial Learning Journey
