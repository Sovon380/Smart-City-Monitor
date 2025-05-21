const THINGSPEAK_URL = 'https://api.thingspeak.com/channels/2936641/feeds.json?results=1';
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
let currentTipIndex = 0;
let riskProfiles = [
    { uid: "A1B2C3D4", name: "Alice (Engineer)", tempThreshold: 32.0, gasThreshold: 3000, buzzer: true },
    { uid: "E5F6G7H8", name: "Bob (Supervisor)", tempThreshold: 35.0, gasThreshold: 2500, buzzer: true },
    { uid: "I9J0K1L2", name: "Charlie (Engineer)", tempThreshold: 33.0, gasThreshold: 2800, buzzer: true },
    { uid: "M3N4O5P6", name: "Diana (Visitor)", tempThreshold: 37.0, gasThreshold: 3500, buzzer: false },
    { uid: "Q7R8S9T0", name: "Eve (Supervisor)", tempThreshold: 35.0, gasThreshold: 2700, buzzer: true }
];
let currentProfile = { uid: "", name: "Default", tempThreshold: 35.0, gasThreshold: 3000, buzzer: true };
let workerInfo = { age: 0, workingLevel: "Low" };

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
        let data = await response.json();
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

        // Simulate Age and Working Level (not in ThingSpeak; assume from Arduino)
        workerInfo.age = readings.name !== "N/A" ? (readings.name.includes("Alice") ? 30 : readings.name.includes("Bob") ? 45 : 55) : 0;
        workerInfo.workingLevel = readings.name !== "N/A" ? (readings.name.includes("Alice") ? "High" : readings.name.includes("Bob") ? "Medium" : "Low") : "Low";

        updateWorkerInfo(readings);
        updateSensorReadings(readings);
        updateSensorChart(readings);
        updateWarnings(readings);
        updateHealthTips(readings);
        showToast(`Updated data for ${readings.name}`);
    } catch (error) {
        console.error('Error fetching data:', error);
        showToast('Failed to fetch data', true);
    }
}

// Update Worker Info
function updateWorkerInfo(readings) {
    document.getElementById('uid').textContent = readings.uid;
    document.getElementById('worker-name').textContent = readings.name;
    document.getElementById('role').textContent = readings.role;
    document.getElementById('age').textContent = workerInfo.age || "N/A";
    document.getElementById('working-level').textContent = workerInfo.workingLevel;
    
    currentProfile = riskProfiles.find(p => p.uid === readings.uid) || currentProfile;
    document.getElementById('risk-profile').textContent = `${currentProfile.name} (Temp: ${currentProfile.tempThreshold}°C, Gas: ${currentProfile.gasThreshold}, Buzzer: ${currentProfile.buzzer ? "On" : "Off"})`;
}

// Update Sensor Readings
function updateSensorReadings(readings) {
    let statuses = calculateStatuses(readings);
    
    gauges.temp.refresh(readings.temp);
    document.getElementById('temp-value').textContent = readings.temp.toFixed(1);
    document.getElementById('temp-status').textContent = statuses.temp;
    document.getElementById('temp-status').className = `status-badge ${statuses.temp.toLowerCase()}`;

    gauges.hum.refresh(readings.hum);
    document.getElementById('hum-value').textContent = readings.hum.toFixed(1);
    document.getElementById('hum-status').textContent = statuses.hum;
    document.getElementById('hum-status').className = `status-badge ${statuses.hum.toLowerCase()}`;

    gauges.realfeel.refresh(readings.realfeel);
    document.getElementById('realfeel-value').textContent = readings.realfeel.toFixed(1);
    document.getElementById('realfeel-status').textContent = statuses.realfeel;
    document.getElementById('realfeel-status').className = `status-badge ${statuses.realfeel.toLowerCase()}`;

    gauges.gas.refresh(readings.gas);
    document.getElementById('gas-value').textContent = readings.gas;
    document.getElementById('gas-status').textContent = statuses.gas;
    document.getElementById('gas-status').className = `status-badge ${statuses.gas.toLowerCase()}`;

    gauges.crowd.refresh(readings.crowd);
    document.getElementById('crowd-value').textContent = readings.crowd;
    document.getElementById('crowd-status').textContent = statuses.crowd;
    document.getElementById('crowd-status').className = `status-badge ${statuses.crowd.toLowerCase()}`;
}

// Calculate Sensor Statuses
function calculateStatuses(readings) {
    let statuses = {};
    
    statuses.temp = readings.temp <= currentProfile.tempThreshold - 5 ? "Normal" :
                    readings.temp <= currentProfile.tempThreshold ? "Warning" : "Critical";
    
    statuses.hum = readings.hum <= 80 ? "Normal" :
                   readings.hum <= 85 ? "Warning" : "Critical";
    
    statuses.realfeel = readings.realfeel <= (currentProfile.tempThreshold + 7) - 5 ? "Normal" :
                        readings.realfeel <= (currentProfile.tempThreshold + 7) ? "Warning" : "Critical";
    
    statuses.gas = readings.gas <= currentProfile.gasThreshold - 1000 ? "Normal" :
                   readings.gas <= currentProfile.gasThreshold ? "Warning" : "Critical";
    
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

// Update Warnings
function updateWarnings(readings) {
    let warnings = [];
    let statuses = calculateStatuses(readings);
    let riskLevel = calculateRiskLevel(statuses);
    let ageGroup = workerInfo.age > 50 ? "Older" : workerInfo.age > 30 ? "Middle" : "Young";
    let urgency = riskLevel === "High" ? "URGENT: " : riskLevel === "Moderate" ? "CAUTION: " : "";

    if (statuses.temp === "Critical") {
        if (ageGroup === "Older") warnings.push(`${urgency}High temp! Rest in cool area now.`);
        else if (readings.role === "Engineer") warnings.push(`${urgency}High temp! Check cooling systems.`);
        else if (readings.role === "Supervisor") warnings.push(`${urgency}High temp! Ensure team cools down.`);
        else warnings.push(`${urgency}High temp! Move to shaded area.`);
        if (workerInfo.workingLevel === "High") warnings.push(`${urgency}Critical temp! Evacuate if persists.`);
    } else if (statuses.temp === "Warning") {
        warnings.push(`${urgency}Rising temp! ${ageGroup === "Young" ? "Stay hydrated." : "Take frequent breaks."}`);
    }

    if (statuses.hum === "Critical") {
        if (ageGroup === "Older") warnings.push(`${urgency}High humidity! Seek dry area.`);
        else if (readings.role === "Engineer") warnings.push(`${urgency}High humidity! Increase ventilation.`);
        else if (readings.role === "Supervisor") warnings.push(`${urgency}High humidity! Ensure vents are open.`);
        else warnings.push(`${urgency}High humidity! Avoid exertion.`);
    }

    if (statuses.realfeel === "Critical") {
        if (ageGroup === "Older") warnings.push(`${urgency}Extreme heat index! Rest immediately.`);
        else if (readings.role === "Engineer") warnings.push(`${urgency}Extreme heat index! Use cooling fans.`);
        else if (readings.role === "Supervisor") warnings.push(`${urgency}Extreme heat index! Limit team work.`);
        else warnings.push(`${urgency}Extreme heat index! Find shade.`);
    }

    if (statuses.gas === "Critical") {
        if (ageGroup === "Older") warnings.push(`${urgency}Dangerous gas! Leave area now.`);
        else if (readings.role === "Engineer") warnings.push(`${urgency}Dangerous gas! Ventilate immediately.`);
        else if (readings.role === "Supervisor") warnings.push(`${urgency}Dangerous gas! Evacuate team.`);
        else warnings.push(`${urgency}Dangerous gas! Move to fresh air.`);
    }

    if (statuses.crowd === "Critical") {
        if (ageGroup === "Older") warnings.push(`${urgency}Overcrowded! Move to open space.`);
        else if (readings.role === "Engineer") warnings.push(`${urgency}Overcrowded! Clear work area.`);
        else if (readings.role === "Supervisor") warnings.push(`${urgency}Overcrowded! Disperse team.`);
        else warnings.push(`${urgency}Overcrowded! Maintain distance.`);
    }

    let warningsList = document.getElementById('warnings');
    warningsList.innerHTML = warnings.map((w, i) => `<li class="${w.includes('URGENT') ? 'critical' : w.includes('CAUTION') ? 'warning' : ''}">${i + 1}. ${w}</li>`).join('');
}

// Calculate Risk Level
function calculateRiskLevel(statuses) {
    if (Object.values(statuses).includes("Critical")) return "High";
    if (Object.values(statuses).includes("Warning")) return "Moderate";
    return "Low";
}

// Update Health Tips
function updateHealthTips(readings) {
    let riskLevel = calculateRiskLevel(calculateStatuses(readings));
    let tip = HEALTH_TIPS[currentTipIndex];
    if (riskLevel === "High") {
        if (workerInfo.age > 50) tip = "Seek shade, rest immediately.";
        else if (readings.role === "Engineer") tip = "Stop work, check cooling systems.";
        else if (readings.role === "Supervisor") tip = "Evacuate team, ensure safety.";
        else tip = "Move to cooler area now.";
    } else if (riskLevel === "Moderate") {
        if (workerInfo.age > 50) tip = "Monitor health, take frequent breaks.";
        else if (readings.role === "Engineer") tip = "Wear light clothing, check vents.";
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
setInterval(fetchData, 16000);
setInterval(updateHealthTips, 5000, { role: document.getElementById('role').textContent });
fetchData();