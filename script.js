const THINGSPEAK_URL = 'https://api.thingspeak.com/channels/2936641/feeds.json?api_key=98ZPQ930QYNNI2A9&results=1';
let sensorData = { temp: [], timestamps: [], maxLength: 50 };
let lastReadings = null;
const THRESHOLDS = { temp: 32, hum: 80, realfeel: 42, gas: 3000, crowd: 30 };
function simulateWorkerDetails(uid) {
    const profiles = [
        { uid: "A1B2C3D4", name: "Alice", role: "Engineer", age: 35, workingLevel: "High" },
        { uid: "E5F6G7H8", name: "Bob", role: "Supervisor", age: 45, workingLevel: "Medium" },
        { uid: "I9J0K1L2", name: "Charlie", role: "Engineer", age: 28, workingLevel: "High" },
        { uid: "M3N4O5P6", name: "Diana", role: "Visitor", age: 55, workingLevel: "Low" },
        { uid: "Q7R8S9T0", name: "Eve", role: "Supervisor", age: 40, workingLevel: "Medium" }
    ];
    const profile = profiles.find(p => p.uid === uid);
    return profile ? { age: profile.age, workingLevel: profile.workingLevel } : { age: 30, workingLevel: "Medium" };
}
let ctx = document.getElementById('temp-chart').getContext('2d');
let tempChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Temperature (°C)',
            data: [],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.3
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { title: { display: true, text: 'Time' } },
            y: { title: { display: true, text: 'Temperature (°C)' }, beginAtZero: false }
        },
        plugins: { legend: { display: true, position: 'top' } }
    }
});
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
}
async function fetchData() {
    try {
        console.log('Fetching data...');
        let response = await fetch(THINGSPEAK_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let data = await response.json();
        console.log('ThingSpeak data:', data);
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
        let workerDetails = simulateWorkerDetails(readings.uid);
        readings.age = workerDetails.age;
        readings.workingLevel = workerDetails.workingLevel;
        lastReadings = readings;
        console.log('Parsed readings:', readings);
        updateUI(readings);
        updateChart(readings);
        showToast(`Data updated for ${readings.name}`);
    } catch (error) {
        console.error('Fetch error:', error.message);
        showToast(`Failed to fetch: ${error.message}`, true);
        let fallback = {
            temp: 25, hum: 70, gas: 1000, crowd: 50, realfeel: 25,
            uid: "N/A", name: "Unknown", role: "Unknown", age: "N/A", workingLevel: "N/A"
        };
        console.log('Using fallback:', fallback);
        updateUI(fallback);
        updateChart(fallback);
    }
}
function updateUI(readings) {
    console.log('Updating UI:', readings);
    document.getElementById('uid').textContent = readings.uid;
    document.getElementById('worker-name').textContent = readings.name;
    document.getElementById('role').textContent = readings.role;
    document.getElementById('age').textContent = readings.age;
    document.getElementById('working-level').textContent = readings.workingLevel;
    document.getElementById('temp').textContent = readings.temp.toFixed(1);
    document.getElementById('temp-status').textContent = readings.temp <= THRESHOLDS.temp - 5 ? 'Normal' : readings.temp <= THRESHOLDS.temp ? 'Warning' : 'Critical';
    document.getElementById('temp-status').className = `status-badge ${readings.temp <= THRESHOLDS.temp - 5 ? 'normal' : readings.temp <= THRESHOLDS.temp ? 'warning' : 'critical'}`;
    document.getElementById('hum').textContent = readings.hum.toFixed(1);
    document.getElementById('hum-status').textContent = readings.hum <= THRESHOLDS.hum ? 'Normal' : readings.hum <= THRESHOLDS.hum + 5 ? 'Warning' : 'Critical';
    document.getElementById('hum-status').className = `status-badge ${readings.hum <= THRESHOLDS.hum ? 'normal' : readings.hum <= THRESHOLDS.hum + 5 ? 'warning' : 'critical'}`;
    document.getElementById('realfeel').textContent = readings.realfeel.toFixed(1);
    document.getElementById('realfeel-status').textContent = readings.realfeel <= THRESHOLDS.realfeel - 5 ? 'Normal' : readings.realfeel <= THRESHOLDS.realfeel ? 'Warning' : 'Critical';
    document.getElementById('realfeel-status').className = `status-badge ${readings.realfeel <= THRESHOLDS.realfeel - 5 ? 'normal' : readings.realfeel <= THRESHOLDS.realfeel ? 'warning' : 'critical'}`;
    document.getElementById('gas').textContent = readings.gas;
    document.getElementById('gas-status').textContent = readings.gas <= THRESHOLDS.gas - 1000 ? 'Normal' : readings.gas <= THRESHOLDS.gas ? 'Warning' : 'Critical';
    document.getElementById('gas-status').className = `status-badge ${readings.gas <= THRESHOLDS.gas - 1000 ? 'normal' : readings.gas <= THRESHOLDS.gas ? 'warning' : 'critical'}`;
    document.getElementById('crowd').textContent = readings.crowd;
    document.getElementById('crowd-status').textContent = readings.crowd >= THRESHOLDS.crowd ? 'Normal' : readings.crowd >= THRESHOLDS.crowd - 15 ? 'Warning' : 'Critical';
    document.getElementById('crowd-status').className = `status-badge ${readings.crowd >= THRESHOLDS.crowd ? 'normal' : readings.crowd >= THRESHOLDS.crowd - 15 ? 'warning' : 'critical'}`;
}
function updateChart(readings) {
    console.log('Updating chart:', readings);
    sensorData.temp.push(readings.temp);
    sensorData.timestamps.push(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    if (sensorData.temp.length > sensorData.maxLength) {
        sensorData.temp.shift();
        sensorData.timestamps.shift();
    }
    tempChart.data.labels = sensorData.timestamps;
    tempChart.data.datasets[0].data = sensorData.temp;
    tempChart.update();
}
function showToast(message, isError = false) {
    console.log('Toast:', message, isError);
    let toast = document.getElementById('toast');
    let toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = message;
    toast.className = `fixed bottom-4 right-4 p-3 rounded-lg shadow-lg ${isError ? 'bg-red-600' : 'bg-blue-600'} text-white animate-pulse`;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}
setInterval(fetchData, 5000);
fetchData();