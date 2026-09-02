# 🚀 Global Rocket Launches 3D Visualization

An interactive 3D globe visualization showing rocket launches by country using Mapbox GL and Deck.gl.

## Features

- **3D Globe View**: Interactive rotating globe with satellite imagery
- **Extruded Countries**: Countries are raised based on the number of rocket launches
- **Color Coding**: Yellow to red gradient showing launch volume
- **Interactive Tooltips**: Hover over countries to see launch counts
- **Auto-rotation**: Globe spins automatically (pauses on user interaction)
- **Statistics Panel**: Shows total launches, country count, and top country

## How to Run

⚠️ **Important**: This app must be run from a web server (not by opening index.html directly) due to CORS restrictions.

### Option 1: Python (Recommended)

```bash
# Navigate to the project directory
cd "D:\Learn\GEOSPATIAL_30 day\Day_19_Rocket launch"

# Start a simple HTTP server
python -m http.server 8000

# Open in browser
# http://localhost:8000
```

### Option 2: Node.js

```bash
# Install http-server globally (one time only)
npm install -g http-server

# Navigate to the project directory
cd "D:\Learn\GEOSPATIAL_30 day\Day_19_Rocket launch"

# Start the server
http-server

# Open the URL shown in the terminal (usually http://localhost:8080)
```

### Option 3: VS Code Live Server

1. Install the "Live Server" extension in VS Code
2. Open the project folder in VS Code
3. Right-click on `index.html`
4. Select "Open with Live Server"

## Files

- `index.html` - Main HTML file with UI and layout
- `app.js` - JavaScript application logic
- `Cleaned_Data_-_Space_Corrected.csv` - Rocket launch data
- `countries.geojson` - Country boundary data

## Technologies Used

- **Mapbox GL JS** - 3D globe and base map
- **Deck.gl** - WebGL-powered data visualization
- **D3.js** - Data processing and parsing

## Usage

1. The globe will auto-rotate showing all countries with rocket launches
2. Click and drag to manually explore
3. Hover over extruded countries to see detailed launch information
4. Use scroll/pinch to zoom in and out
5. The height of each country represents the number of launches

## Data Source

Rocket launch data includes launches from 2020 with information about:
- Launch location
- Company name
- Rocket type
- Mission status

Enjoy exploring global space launch activities! 🌍🚀
