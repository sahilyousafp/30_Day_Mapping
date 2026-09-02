from flask import Flask, render_template, request, jsonify, send_from_directory
from datetime import datetime
from skyfield.api import load, Star, wgs84, Loader
from skyfield.data import hipparcos
import pandas as pd
import os
import json
import google.generativeai as genai

app = Flask(__name__)

# Configure Gemini API
GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY')
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)

class StarCalculator:
    def __init__(self):
        # Load ephemeris data from data directory
        data_path = os.path.join(os.path.dirname(__file__), 'data')
        
        loader = Loader(data_path)
        self.ts = loader.timescale()
        self.eph = loader('de421.bsp')
        
        hip_path = os.path.join(data_path, 'hip_main.dat')
        
        # Load Hipparcos star catalog
        with load.open(hip_path) as f:
            self.stars_df = hipparcos.load_dataframe(f)
        
        # Load constellation data
        self.load_constellation_data()
    
    def load_constellation_data(self):
        """Load constellation line data"""
        data_path = os.path.join(os.path.dirname(__file__), 'data')
        const_path = os.path.join(data_path, 'constellationship.fab')
        
        self.constellation_lines = {}
        
        try:
            with open(const_path, 'r') as f:
                for line in f:
                    if line.strip() and not line.startswith('#'):
                        parts = line.strip().split()
                        if len(parts) >= 3:
                            const_name = parts[0]
                            num_lines = int(parts[1])
                            hip_ids = [int(x) for x in parts[2:]]
                            
                            if const_name not in self.constellation_lines:
                                self.constellation_lines[const_name] = []
                            
                            # Store pairs of HIP IDs for constellation lines
                            for i in range(0, len(hip_ids), 2):
                                if i + 1 < len(hip_ids):
                                    self.constellation_lines[const_name].append((hip_ids[i], hip_ids[i+1]))
        except Exception as e:
            print(f"Error loading constellation data: {e}")
    
    def get_visible_stars(self, lat, lon, dt):
        """Get all visible stars for location and time using Skyfield"""
        # Create observer location
        location = wgs84.latlon(lat, lon)
        
        # Create time object
        t = self.ts.utc(dt.year, dt.month, dt.day, dt.hour, dt.minute)
        
        # Filter bright stars (magnitude < 4.5 for visibility)
        bright_stars = self.stars_df[self.stars_df['magnitude'] <= 4.5].copy()
        
        visible_stars = []
        constellation_data = {}
        constellation_star_ids = set()
        
        # First, identify which stars are part of constellations
        for const_name, lines in self.constellation_lines.items():
            for hip1, hip2 in lines:
                constellation_star_ids.add(hip1)
                constellation_star_ids.add(hip2)
        
        for hip_id, star_data in bright_stars.iterrows():
            # Create star object
            star = Star.from_dataframe(star_data)
            
            # Calculate position from observer
            astrometric = (self.eph['earth'] + location).at(t).observe(star)
            alt, az, _ = astrometric.apparent().altaz()
            
            # Only include stars above horizon
            if alt.degrees > 0:
                # Find constellation for this star
                const_name = self.find_constellation(hip_id)
                is_constellation_star = hip_id in constellation_star_ids
                
                star_info = {
                    'hip_id': int(hip_id),
                    'name': star_data.get('name', f'HIP {hip_id}'),
                    'constellation': const_name,
                    'altitude': float(alt.degrees),
                    'azimuth': float(az.degrees),
                    'magnitude': float(star_data['magnitude']),
                    'ra': float(star_data['ra_degrees']),
                    'dec': float(star_data['dec_degrees']),
                    'is_constellation_star': is_constellation_star
                }
                visible_stars.append(star_info)
                
                # Store star positions for constellation lines and centers
                if is_constellation_star:
                    if const_name not in constellation_data:
                        constellation_data[const_name] = {}
                    constellation_data[const_name][hip_id] = star_info
        
        # Add constellation line data
        constellation_lines_vis = []
        for const_name, lines in self.constellation_lines.items():
            if const_name in constellation_data:
                for hip1, hip2 in lines:
                    if hip1 in constellation_data[const_name] and hip2 in constellation_data[const_name]:
                        star1 = constellation_data[const_name][hip1]
                        star2 = constellation_data[const_name][hip2]
                        constellation_lines_vis.append({
                            'constellation': const_name,
                            'star1': {'alt': star1['altitude'], 'az': star1['azimuth']},
                            'star2': {'alt': star2['altitude'], 'az': star2['azimuth']}
                        })
        
        # Calculate constellation centers for labels
        constellation_centers = {}
        for const_name, stars in constellation_data.items():
            if stars:
                avg_alt = sum(s['altitude'] for s in stars.values()) / len(stars)
                avg_az = sum(s['azimuth'] for s in stars.values()) / len(stars)
                constellation_centers[const_name] = {
                    'alt': avg_alt,
                    'az': avg_az
                }
        
        return visible_stars, constellation_lines_vis, constellation_centers
    
    def find_constellation(self, hip_id):
        """Find which constellation a star belongs to"""
        for const_name, lines in self.constellation_lines.items():
            for hip1, hip2 in lines:
                if hip_id == hip1 or hip_id == hip2:
                    return const_name
        return 'Unknown'

calculator = StarCalculator()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate_stars', methods=['POST'])
def generate_stars():
    try:
        data = request.json
        lat = float(data['lat'])
        lon = float(data['lon'])
        date_str = data['date']
        time_str = data['time']
        
        # Parse datetime
        dt_str = f"{date_str} {time_str}"
        dt = datetime.strptime(dt_str, '%Y-%m-%d %H:%M')
        
        # Get visible stars, constellation lines, and centers
        stars, constellation_lines, constellation_centers = calculator.get_visible_stars(lat, lon, dt)
        
        return jsonify({
            'success': True,
            'stars': stars,
            'constellation_lines': constellation_lines,
            'constellation_centers': constellation_centers,
            'location': {'lat': lat, 'lon': lon},
            'datetime': dt_str
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

@app.route('/constellation_info/<constellation_name>')
def get_constellation_info(constellation_name):
    """Get constellation information using Gemini API"""
    try:
        if not GOOGLE_API_KEY:
            return jsonify({
                'success': False,
                'error': 'Gemini API key not configured'
            }), 500
        
        model = genai.GenerativeModel('gemini-flash-latest')
        
        prompt = f"""Provide detailed information about the constellation {constellation_name} in JSON format with these exact fields:
- name: Full constellation name
- common_name: Common or alternative name
- description: Brief description (2-3 sentences)
- history: Mythology and historical significance (2-3 sentences)
- best_viewing: When it's best viewed (season and hemisphere)
- notable_features: Key stars, deep-sky objects, and interesting features

Keep the response concise and informative. Return ONLY the JSON object, no other text."""

        response = model.generate_content(prompt)
        
        # Parse the JSON from response
        response_text = response.text.strip()
        # Remove markdown code blocks if present
        if response_text.startswith('```'):
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
            response_text = response_text.strip()
        
        constellation_data = json.loads(response_text)
        
        return jsonify({
            'success': True,
            'data': constellation_data
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'fallback': {
                'name': constellation_name,
                'common_name': constellation_name,
                'description': 'Constellation information temporarily unavailable.',
                'history': '',
                'best_viewing': '',
                'notable_features': ''
            }
        }), 200

@app.route('/static/data/<path:filename>')
def serve_data(filename):
    data_dir = os.path.join(os.path.dirname(__file__), 'data')
    return send_from_directory(data_dir, filename)

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5001)
