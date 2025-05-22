# Smart City Monitoring Dashboard

A professional web app for monitoring environmental conditions and worker safety in a smart city. Built with HTML, Tailwind CSS, and Chart.js, hosted on GitHub Pages, and powered by ThingSpeak (Channel 2936641) with secure Read API Key access.

## Features
- **Real-Time Graphs**: ThingSpeak-style line charts for temperature, humidity, real feel, gas level, and crowd distance (last 10 readings).
- **Worker Information**: Displays UID, name, role, age, and working level; falls back to hardcoded profiles (Sovon, Sudipta, etc.) if unavailable.
- **Safety Recommendations**: Tailored advice based on sensor data, worker role, age, and working level, always populated.
- **Precautions Section**: Guidelines for Older Workers, Engineers, Supervisors, Visitors, and High working level, plus system limitations.
- **Light/Dark Theme**: Toggleable theme with user preference persistence.
- **CSV Download**: Button to download ThingSpeak data as CSV.
- **Realistic Fallback**: Shows realistic values (e.g., 25–30°C, 60–80% humidity) if API fails, ensuring no blank fields.
- **Fast Updates**: Polls latest data every 5 seconds, historical data every 30 seconds, with stale data warnings.
- **Responsive UI**: Optimized for mobile and desktop with animations, hover effects, and update indicators.
- **Secure Data Access**: Uses ThingSpeak Read API Key `98ZPQ930QYNNI2A9`.

## Setup
1. Ensure ThingSpeak Channel 2936641 is updated by the ESP32 and accessible with Read API Key `98ZPQ930QYNNI2A9`.
2. Clone this repository:
   ```bash
   git clone https://github.com/your-username/smart-city-monitoring.git
   ```
3. Host on GitHub Pages:
   - Push files to the `main` branch.
   - Enable GitHub Pages in **Settings** > **Pages** (branch: `main`, folder: `/`).
4. Access at `https://your-username.github.io/smart-city-monitoring`.

## Files
- `index.html`: Main dashboard with logo, menu, graphs, CSV button, timestamp, and sections.
- `styles.css`: Animations, ThingSpeak-like chart styles, and stale data warning.
- `script.js`: Fetches ThingSpeak data, renders charts, handles theme toggle, and ensures no blank fields.

## Deployment Notes
- Minify CSS and JS for production using [Terser](https://terser.org) or [cssnano](https://cssnano.co).
- Replace placeholder logo (`https://via.placeholder.com/40?text=SC`) with your own in `index.html`.
- ESP32 must update ThingSpeak every ~5 seconds for true real-time data (requires paid plan or code tweak).

## URL
[https://your-username.github.io/smart-city-monitoring](https://your-username.github.io/smart-city-monitoring)

## Support
Contact: [support@smartcity.example.com](mailto:support@smartcity.example.com)