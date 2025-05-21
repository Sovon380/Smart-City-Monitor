// Replace YOUR_READ_API_KEY with your actual ThingSpeak Read API Key
const THINGSPEAK_URL = 'https://api.thingspeak.com/channels/2936641/feeds.json?api_key=
98ZPQ930QYNNI2A9&results=1';
const HEALTH_TIPS = [
    "Stay hydrated, drink water regularly.",
    "Wear light clothing in hot conditions.",
    "Take breaks in shaded areas.",
    "Monitor for signs of heat stress.",
    "Ensure proper ventilation in workspace."
];

let sensorData = {
    temp: [], hum: [], realfeel: [], gas: [], crowd: [],
    timestamps: [], maxLength: 50
};
let lastReadings = null;
let currentTipIndex = 0;
const DEFAULT_PROFILE = { tempThreshold: 35.0, gasThreshold: 3000, buzzer: true };

// Gauges
let gauges = {
    temp: new JustGage({
        id: "temp-gauge", value: 0, min: 0, max: 50, title: "Temperature",
        label: "°C", gaugeWidthScale: 0.6, levelColors: ["#4CAF50", "#FFC107", "#F44336"]
    }),
    hum: new JustGage({
        id: "hum-gauge", value: 70, min: 70, max: 85, title: "Humidity",
        label: "%", gaugeWidthScale: 0.6, levelColors: ["#4CAF50", "#FFC107", "#F44336"]
    }),
    realfeel: new JustGage({
        id: "realfeel-gauge", value: 0, min: 0, max: 60, title: "Real Feel",
        label: "°C", gaugeWidthScale: 0.6, levelColors: ["#4CAF50", "#FFC107", "#F44336"]
    }),
    gas: new JustGage({
        id: "gas-gauge", value: 0, min: 0, max: 4095, title: "Gas Level",
        label: "", gaugeWidthScale: 0.6, levelColors: ["#4CAF50", "#FFC107", "#F44336"]
    }),
    crowd: new JustGage({
        id: "crowd-gauge", value: 0, min: 0, max: 200, title: "Crowd Distance",
        label: "cm", gaugeWidthScale: 0.6, levelColors: ["#4CAF50", "#FFC107", "#F44336"]
    })
};

// Chart
let ctx = document.getElementById('sensor-chart').getContext('2d');
let sensorChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Temperature (°C)', data: [], borderColor: '#FF6384', fill: false },
            { label: 'Humidity (%)', data: [], borderColor: '#36A2EB', fill: false },
            { label: 'Real Feel (°C)', data: [], borderColor: '#FFCE56', fill: false },
            { label: 'Gas Level', data: [], borderColor: '#4BC0C0', fill: false },
            { label: 'Crowd Distance (cm)', data: [], borderColor: '#9966FF', fill: false }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { title: { display: true, text: 'Time' } } },
        plugins: { zoom: { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' } } }
    }
});

// Theme Toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

// Initialize Theme
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
}

// Fetch Data
async function fetchData() {
    try {
        let response = await fetch(THINGSPEAK_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let data = await response.json();
        if (!data.feeds || data.feeds.length === 0) throw new Error('No feeds available');
        
        let feed = data.feeds[0];
        let readings = {
            temp: parseFloat(feed.field1) || 0,
            hum: parseFloat(feed.field2) || 70,
            gas: parseInt(feed.field3) || 0,
            crowd: parseInt(feed.field4) || 0,
            uid: feed.field5 || "N/A",
            name: feed.field6 || "N/A",
            role: feed.field7 || "N/A",
            realfeel: parseFloat(feed.field8) || 0
        };

        lastReadings = readings;
        updateWorkerInfo(readings);
        updateSensorReadings(readings);
        updateSensorChart(readings);
        updateSuggestions(readings);
        showToast(`Updated data for ${readings.name}`);
    } catch (error) {
        console.error('Error fetching data:', error);
        showToast('Failed to fetch data, retrying...', true);
        if (lastReadings) {
            updateWorkerInfo(lastReadings);
            updateSensorReadings(lastReadings);
            updateSuggestions(lastReadings);
        }
    }
}

// Update Worker Info
function updateWorkerInfo(readings) {
    document.getElementById('uid').textContent = readings.uid;
    document.getElementById('worker-name').textContent = readings.name;
    document.getElementById('role').textContent = readings.role;
}

// Update Sensor Readings
function updateSensorReadings(readings) {
    let statuses = calculateStatuses(readings);
    
    gauges.temp.refresh(readings.temp, 500);
    document.getElementById('temp-value').textContent = readings.temp.toFixed(1);
    document.getElementById('temp-status').textContent = statuses.temp;
    document.getElementById('temp-status').className = `status-badge ${statuses.temp.toLowerCase()}`;

    gauges.hum.refresh(readings.hum, 500);
    document.getElementById('hum-value').textContent = readings.hum.toFixed(1);
    document.getElementById('hum-status').textContent = statuses.hum;
    document.getElementById('hum-status').className = `status-badge ${statuses.hum.toLowerCase()}`;

    gauges.realfeel.refresh(readings.realfeel, 500);
    document.getElementById('realfeel-value').textContent = readings.realfeel.toFixed(1);
    document.getElementById('realfeel-status').textContent = statuses.realfeel;
    document.getElementById('realfeel-status').className = `status-badge ${statuses.realfeel.toLowerCase()}`;

    gauges.gas.refresh(readings.gas, 500);
    document.getElementById('gas-value').textContent = readings.gas;
    document.getElementById('gas-status').textContent = statuses.gas;
    document.getElementById('gas-status').className = `status-badge ${statuses.gas.toLowerCase()}`;

    gauges.crowd.refresh(readings.crowd, 500);
    document.getElementById('crowd-value').textContent = readings.crowd;
    document.getElementById('crowd-status').textContent = statuses.crowd;
    document.getElementById('crowd-status').className = `status-badge ${statuses.crowd.toLowerCase()}`;
}

// Calculate Sensor Statuses
function calculateStatuses(readings) {
    let statuses = {};
    
    statuses.temp = readings.temp <= DEFAULT_PROFILE.tempThreshold - 5 ? "Normal" :
                    readings.temp <= DEFAULT_PROFILE.tempThreshold ? "Warning" : "Critical";
    
    statuses.hum = readings.hum <= 80 ? "Normal" :
                   readings.hum <= 85 ? "Warning" : "Critical";
    
    statuses.realfeel = readings.realfeel <= (DEFAULT_PROFILE.tempThreshold + 7) - 5 ? "Normal" :
                        readings.realfeel <= (DEFAULT_PROFILE.tempThreshold + 7) ? "Warning" : "Critical";
    
    statuses.gas = readings.gas <= DEFAULT_PROFILE.gasThreshold - 1000 ? "Normal" :
                   readings.gas <= DEFAULT_PROFILE.gasThreshold ? "Warning" : "Critical";
    
    statuses.crowd = readings.crowd >= 30 ? "Normal" :
                     readings.crowd >= 15 ? "Warning" : "Critical";
    
    return statuses;
}

// Update Sensor Chart
function updateSensorChart(readings) {
    sensorData.temp.push(readings.temp);
    sensorData.hum.push(readings.hum);
    sensorData.realfeel.push(readings.realfeel);
    sensorData.gas.push(readings.gas);
    sensorData.crowd.push(readings.crowd);
    sensorData.timestamps.push(new Date().toLocaleTimeString());
    
    if (sensorData.temp.length > sensorData.maxLength) {
        sensorData.temp.shift();
        sensorData.hum.shift();
        sensorData.realfeel.shift();
        sensorData.gas.shift();
        sensorData.crowd.shift();
        sensorData.timestamps.shift();
    }
    
    sensorChart.data.labels = sensorData.timestamps;
    sensorChart.data.datasets[0].data = sensorData.temp;
    sensorChart.data.datasets[1].data = sensorData.hum;
    sensorChart.data.datasets[2].data = sensorData.realfeel;
    sensorChart.data.datasets[3].data = sensorData.gas;
    sensorChart.data.datasets[4].data = sensorData.crowd;
    sensorChart.update();
}

// Update Suggestions (Warnings and Health Tips)
function updateSuggestions(readings) {
    let warnings = [];
    let statuses = calculateStatuses(readings);
    let riskLevel = calculateRiskLevel(statuses);
    let urgency = riskLevel === "High" ? "URGENT: " : riskLevel === "Moderate" ? "CAUTION: " : "";

    // Warnings (role-based, mirroring Arduino's safetyMonitor)
    if (statuses.temp === "Critical") {
        if (readings.role === "Engineer") warnings.push(`${urgency}High temp! Check cooling systems.`);
        else if (readings.role === "Supervisor") warnings.push(`${urgency}High temp! Ensure team cools down.`);
        else warnings.push(`${urgency}High temp! Move to shaded area.`);
    } else if (statuses.temp === "Warning") {
        warnings.push(`${urgency}Rising temp! Stay hydrated.`);
    }

    if (statuses.hum === "Critical") {
        if (readings.role === "Engineer") warnings.push(`${urgency}High humidity! Increase ventilation.`);
        else if (readings.role === "Supervisor") warnings.push(`${urgency}High humidity! Ensure vents are open.`);
        else warnings.push(`${urgency}High humidity! Avoid exertion.`);
    }

    if (statuses.realfeel === "Critical") {
        if (readings.role === "Engineer") warnings.push(`${urgency}Extreme heat index! Use cooling fans.`);
        else if (readings.role === "Supervisor") warnings.push(`${urgency}Extreme heat index! Limit team work.`);
        else warnings.push(`${urgency}Extreme heat index! Find shade.`);
    }

    if (statuses.gas === "Critical") {
        if (readings.role === "Engineer") warnings.push(`${urgency}Dangerous gas! Ventilate immediately.`);
        else if (readings.role === "Supervisor") warnings.push(`${urgency}Dangerous gas! Evacuate team.`);
        else warnings.push(`${urgency}Dangerous gas! Move to fresh air.`);
    }

    if (statuses.crowd === "Critical") {
        if (readings.role === "Engineer") warnings.push(`${urgency}Overcrowded! Clear work area.`);
        else if (readings.role === "Supervisor") warnings.push(`${urgency}Overcrowded! Disperse team.`);
        else warnings.push(`${urgency}Overcrowded! Maintain distance.`);
    }

    // Update warnings
    let warningsList = document.getElementById('warnings');
    warningsList.innerHTML = warnings.length > 0 ?
        warnings.map((w, i) => `<li class="${w.includes('URGENT') ? 'critical' : w.includes('CAUTION') ? 'warning' : ''}">${i + 1}. ${w}</li>`).join('') :
        '<li class="text-green-600">No warnings, environment stable.</li>';

    // Health Tip
    let tip = HEALTH_TIPS[currentTipIndex];
    if (riskLevel === "High") {
        if (readings.role === "Engineer") tip = "Stop work, check cooling systems.";
        else if (readings.role === "Supervisor") tip = "Evacuate team, ensure safety.";
        else tip = "Move to cooler area now.";
    } else if (riskLevel === "Moderate") {
        if (readings.role === "Engineer") tip = "Wear light clothing, check vents.";
        else if (readings.role === "Supervisor") tip = "Ensure team takes breaks.";
        else tip = "Stay alert, hydrate often.";
    }
    
    let tipElement = document.getElementById('health-tip');
    tipElement.style.opacity = 0;
    setTimeout(() => {
        tipElement.textContent = tip;
        tipElement.style.opacity = 1;
    }, 500);
    
    currentTipIndex = (currentTipIndex + 1) % HEALTH_TIPS.length;
}

// Calculate Risk Level
function calculateRiskLevel(statuses) {
    if (Object.values(statuses).includes("Critical")) return "High";
    if (Object.values(statuses).includes("Warning")) return "Moderate";
    return "Low";
}

// Show Toast
function showToast(message, isError = false) {
    let toast = document.getElementById('toast');
    let toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = message;
    toast.className = `fixed bottom-4 right-4 p-4 rounded-lg shadow-lg ${isError ? 'bg-red-600' : 'bg-blue-600'} text-white animate-pulse`;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

// Periodic Updates
setInterval(fetchData, 5000); // Poll every 5 seconds
setInterval(() => updateSuggestions(lastReadings || { role: "N/A" }), 5000); // Update tips every 5s
fetchData(); // Initial fetch