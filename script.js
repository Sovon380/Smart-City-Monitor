const THINGSPEAK_URL = 'https://api.thingspeak.com/channels/2936641/feeds.json?api_key=98ZPQ930QYNNI2A9&results=1';
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
function simulateWorkerDetails(uid, role) {
    const profiles = [
        { uid: "A1B2C3D4", name: "Alice", role: "Engineer", age: 30, workingLevel: "High" },
        { uid: "E5F6G7H8", name: "Bob", role: "Supervisor", age: 45, workingLevel: "Medium" },
        { uid: "I9J0K1L2", name: "Charlie", role: "Engineer", age: 28, workingLevel: "High" },
        { uid: "M3N4O5P6", name: "Diana", role: "Visitor", age: 55, workingLevel: "Low" },
        { uid: "Q7R8S9T0", name: "Eve", role: "Supervisor", age: 40, workingLevel: "Medium" }
    ];
    const profile = profiles.find(p => p.uid === uid) || {};
    return {
        age: profile.age || (role.toLowerCase() === 'engineer' ? 30 : role.toLowerCase() === 'supervisor' ? 45 : 55),
        workingLevel: profile.workingLevel || (role.toLowerCase() === 'engineer' ? 'High' : role.toLowerCase() === 'supervisor' ? 'Medium' : 'Low')
    };
}
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
let ctx = document.getElementById('sensor-chart').getContext('2d');
let sensorChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Temperature (°C)', data: [], borderColor: '#FF6384', fill: false, tension: 0.1 },
            { label: 'Humidity (%)', data: [], borderColor: '#36A2EB', fill: false, tension: 0.1 },
            { label: 'Real Feel (°C)', data: [], borderColor: '#FFCE56', fill: false, tension: 0.1 },
            { label: 'Gas Level', data: [], borderColor: '#4BC0C0', fill: false, tension: 0.1 },
            { label: 'Crowd Distance (cm)', data: [], borderColor: '#9966FF', fill: false, tension: 0.1 }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { title: { display: true, text: 'Time' } },
            y: { beginAtZero: false }
        },
        plugins: {
            legend: { position: 'top' }
        },
        animation: { duration: 1000, easing: 'easeOutQuart' }
    }
});
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
    updateGaugeColors();
});
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
}
function updateGaugeColors() {
    const isDark = document.body.classList.contains('dark');
    const textColor = isDark ? "#fff" : "#000";
    for (let gauge in gauges) {
        gauges[gauge].refresh(gauges[gauge].config.value, null, {
            valueFontColor: textColor,
            titleFontColor: textColor,
            labelFontColor: textColor
        });
    }
}
async function fetchData() {
    try {
        console.log('Fetching data from ThingSpeak...');
        let response = await fetch(THINGSPEAK_URL);
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        let data = await response.json();
        console.log('ThingSpeak response:', data);
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
        let workerDetails = simulateWorkerDetails(readings.uid, readings.role);
        readings.age = workerDetails.age;
        readings.workingLevel = workerDetails.workingLevel;
        lastReadings = readings;
        console.log('Parsed readings:', readings);
        updateWorkerInfo(readings);
        updateSensorReadings(readings);
        updateSensorChart(readings);
        updateSuggestions(readings);
        updateAnalytics(readings);
        showToast(`Updated data for ${readings.name}`);
    } catch (error) {
        console.error('Fetch error:', error.message);
        showToast(`Failed to fetch data: ${error.message}`, true);
        if (lastReadings) {
            console.log('Using last readings:', lastReadings);
            updateWorkerInfo(lastReadings);
            updateSensorReadings(lastReadings);
            updateSensorChart(lastReadings);
            updateSuggestions(lastReadings);
            updateAnalytics(lastReadings);
        } else {
            console.log('No last readings, using fallback');
            let fallback = {
                temp: 25, hum: 70, gas: 1000, crowd: 50, realfeel: 25,
                uid: "N/A", name: "Unknown", role: "Unknown", age: "N/A", workingLevel: "N/A"
            };
            updateWorkerInfo(fallback);
            updateSensorReadings(fallback);
            updateSensorChart(fallback);
            updateSuggestions(fallback);
            updateAnalytics(fallback);
        }
    }
}
function updateWorkerInfo(readings) {
    console.log('Updating worker info:', readings);
    document.getElementById('uid').textContent = readings.uid;
    document.getElementById('worker-name').textContent = readings.name;
    document.getElementById('role').textContent = readings.role;
    document.getElementById('age').textContent = readings.age;
    document.getElementById('working-level').textContent = readings.workingLevel;
}
function updateSensorReadings(readings) {
    console.log('Updating sensor readings:', readings);
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
    console.log('Calculated statuses:', statuses);
    return statuses;
}
function updateSensorChart(readings) {
    console.log('Updating chart with:', readings);
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
function updateSuggestions(readings) {
    console.log('Updating suggestions for:', readings);
    let warnings = [];
    let statuses = calculateStatuses(readings);
    let riskLevel = calculateRiskLevel(statuses);
    let urgency = riskLevel === "High" ? "URGENT: " : riskLevel === "Moderate" ? "CAUTION: " : "";
    let ageGroup = readings.age > 50 ? "Older" : readings.age > 30 ? "Middle" : "Young";
    if (statuses.temp === "Critical") {
        if (ageGroup === "Older") warnings.push(`${urgency}High temp! Rest in cool area now.`);
        else if (readings.role === "Engineer") warnings.push(`${urgency}High temp! Check cooling systems.`);
        else if (readings.role === "Supervisor") warnings.push(`${urgency}High temp! Ensure team cools down.`);
        else warnings.push(`${urgency}High temp! Move to shaded area.`);
        if (readings.workingLevel === "High") warnings.push(`${urgency}Critical temp! Evacuate if persists.`);
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
    warningsList.innerHTML = warnings.length > 0 ?
        warnings.map((w, i) => `<li class="${w.includes('URGENT') ? 'critical' : w.includes('CAUTION') ? 'warning' : ''}">${i + 1}. ${w}</li>`).join('') :
        '<li class="text-green-600">No warnings, environment stable.</li>';
    let tip = HEALTH_TIPS[currentTipIndex];
    if (riskLevel === "High") {
        if (ageGroup === "Older") tip = "Seek shade, rest immediately.";
        else if (readings.role === "Engineer") tip = "Stop work, check cooling systems.";
        else if (readings.role === "Supervisor") tip = "Evacuate team, ensure safety.";
        else tip = "Move to cooler area now.";
    } else if (riskLevel === "Moderate") {
        if (ageGroup === "Older") tip = "Monitor health, take frequent breaks.";
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
function calculateRiskLevel(statuses) {
    if (Object.values(statuses).includes("Critical")) return "High";
    if (Object.values(statuses).includes("Warning")) return "Moderate";
    return "Low";
}
function updateAnalytics(readings) {
    console.log('Updating analytics:', readings);
    let statuses = calculateStatuses(readings);
    let riskLevel = calculateRiskLevel(statuses);
    let criticalCount = sensorData.temp.slice(-10).filter((v, i) =>
        v > DEFAULT_PROFILE.tempThreshold ||
        sensorData.hum[i] > 85 ||
        sensorData.realfeel[i] > (DEFAULT_PROFILE.tempThreshold + 7) ||
        sensorData.gas[i] > DEFAULT_PROFILE.gasThreshold ||
        sensorData.crowd[i] < 15
    ).length;
    let exposure = "No critical conditions detected.";
    if (criticalCount > 5) {
        exposure = `High exposure detected for ${readings.name}. Multiple critical conditions in the last 10 readings.`;
    } else if (criticalCount > 2) {
        exposure = `Moderate exposure for ${readings.name}. Some critical conditions detected.`;
    }
    let recommendations = "Maintain current safety protocols.";
    if (riskLevel === "High") {
        recommendations = `Immediate action required: ${readings.role === "Supervisor" ? "Evacuate team to safer area." : readings.role === "Engineer" ? "Inspect and repair cooling/ventilation systems." : "Relocate to a cooler, less crowded area."}`;
    } else if (riskLevel === "Moderate") {
        recommendations = `Monitor closely: ${readings.role === "Supervisor" ? "Schedule team breaks and check ventilation." : readings.role === "Engineer" ? "Ensure cooling systems are operational." : "Stay hydrated and avoid exertion."}`;
    }
    document.getElementById('risk-level').textContent = riskLevel;
    document.getElementById('risk-level').className = riskLevel === "High" ? "text-red-600" : riskLevel === "Moderate" ? "text-yellow-600" : "text-green-600";
    document.getElementById('exposure').textContent = exposure;
    document.getElementById('recommendations').textContent = recommendations;
}
function showToast(message, isError = false) {
    console.log('Showing toast:', message, isError);
    let toast = document.getElementById('toast');
    let toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = message;
    toast.className = `fixed bottom-4 right-4 p-4 rounded-lg shadow-lg ${isError ? 'bg-red-600' : 'bg-blue-600'} text-white animate-pulse`;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 5000);
}
setInterval(fetchData, 5000);
fetchData();
updateGaugeColors();