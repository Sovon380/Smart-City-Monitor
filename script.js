const thingSpeakChannel = "2936641";
const readApiKey = "98ZPQ930QYNNI2A9";
const latestApiUrl = `https://api.thingspeak.com/channels/${thingSpeakChannel}/feeds.json?api_key=${readApiKey}&results=1`;
const historicalApiUrl = `https://api.thingspeak.com/channels/${thingSpeakChannel}/feeds.json?api_key=${readApiKey}&results=10`;

// Optimal hardcoded worker data (single profile for consistency)
const fallbackWorker = {
    uid: "A1B2C3D4",
    name: "Sovon",
    role: "Supervisor",
    age: 45,
    workingLevel: "High"
};

// Optimal hardcoded sensor data
const fallbackFeed = {
    created_at: new Date().toISOString(),
    field1: "27.5", // Temperature (°C)
    field2: "65.0", // Humidity (%)
    field3: "1500", // Gas Level
    field4: "50",   // Crowd Distance (cm)
    field8: "30.0", // Real Feel (°C)
    field5: fallbackWorker.uid,
    field6: fallbackWorker.name,
    field7: fallbackWorker.role
};

// Hardcoded historical data (10 feeds, 1-second intervals)
const fallbackHistorical = Array(10).fill().map((_, i) => ({
    ...fallbackFeed,
    created_at: new Date(Date.now() - (9 - i) * 1000).toISOString(),
    field1: (27.5 + (i % 2)).toFixed(1), // Slight variation
    field2: (65.0 + (i % 3)).toFixed(1),
    field3: (1500 + (i * 10)).toString(),
    field4: (50 + (i * 2)).toString(),
    field8: (30.0 + (i % 2)).toFixed(1)
}));

// Chart configurations (ThingSpeak-like styling)
const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { labels: { font: { family: 'Arial', size: 12 } } },
        tooltip: { backgroundColor: 'rgba(0, 0, 0, 0.8)', titleFont: { family: 'Arial' }, bodyFont: { family: 'Arial' } }
    },
    scales: {
        x: {
            type: 'time',
            time: { unit: 'second', displayFormats: { second: 'yyyy-MM-dd HH:mm:ss' } },
            title: { display: true, text: 'Time', font: { family: 'Arial' } },
            grid: { color: 'rgba(0, 0, 0, 0.1)' }
        },
        y: {
            title: { display: true, font: { family: 'Arial' } },
            grid: { color: 'rgba(0, 0, 0, 0.1)' }
        }
    }
};

const charts = {
    temp: new Chart(document.getElementById("tempChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Temperature (°C)", data: [], borderColor: "#1e90ff", fill: false }] },
        options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 60, title: { ...chartOptions.scales.y.title, text: 'Temperature (°C)' } } } }
    }),
    hum: new Chart(document.getElementById("humChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Humidity (%)", data: [], borderColor: "#1e90ff", fill: false }] },
        options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 100, title: { ...chartOptions.scales.y.title, text: 'Humidity (%)' } } } }
    }),
    realFeel: new Chart(document.getElementById("realFeelChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Real Feel (°C)", data: [], borderColor: "#1e90ff", fill: false }] },
        options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 60, title: { ...chartOptions.scales.y.title, text: 'Real Feel (°C)' } } } }
    }),
    gas: new Chart(document.getElementById("gasChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Gas Level", data: [], borderColor: "#1e90ff", fill: false }] },
        options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 4095, title: { ...chartOptions.scales.y.title, text: 'Gas Level' } } } }
    }),
    crowd: new Chart(document.getElementById("crowdChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Crowd Distance (cm)", data: [], borderColor: "#1e90ff", fill: false }] },
        options: { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 200, title: { ...chartOptions.scales.y.title, text: 'Crowd Distance (cm)' } } } }
    })
};

// Theme toggle
const themeToggle = document.getElementById("themeToggle");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
if (prefersDark || localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark");
    themeToggle.innerHTML = '<i class="bi bi-sun-fill"></i>';
}
themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
    themeToggle.innerHTML = document.body.classList.contains("dark") ?
        '<i class="bi bi-sun-fill"></i>' : '<i class="bi bi-moon-stars-fill"></i>';
});

// Function to fetch ThingSpeak data
async function fetchThingSpeakData(url) {
    try {
        document.getElementById("updateStatus").classList.remove("hidden");
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (!data.feeds || data.feeds.length === 0) throw new Error("No feeds available");
        // Cache data in localStorage
        localStorage.setItem(url.includes("results=1") ? "thingSpeakLatest" : "thingSpeakHistorical", JSON.stringify(data));
        return data;
    } catch (error) {
        console.error("Error fetching ThingSpeak data:", error);
        return null;
    } finally {
        document.getElementById("updateStatus").classList.add("hidden");
    }
}

// Function to calculate sensor statuses and recommendations
function calculateStatusesAndRecommendations(data, worker) {
    const temp = parseFloat(data.field1) || 27.5;
    const hum = parseFloat(data.field2) || 65.0;
    const gas = parseInt(data.field3) || 1500;
    const crowd = parseInt(data.field4) || 50;
    const realFeel = parseFloat(data.field8) || 30.0;
    const workerRole = worker.role || "Supervisor";
    const workerAge = worker.age || 45;
    const workingLevel = worker.workingLevel || "High";

    // Thresholds (from Arduino code, default profile)
    const tempThreshold = 35.0;
    const gasThreshold = 3000;
    const realFeelThreshold = tempThreshold + 7;

    // Statuses
    const statuses = {
        temp: temp <= tempThreshold - 5 ? "Normal" : temp <= tempThreshold ? "Warning" : "Critical",
        hum: hum <= 80 ? "Normal" : hum <= 85 ? "Warning" : "Critical",
        realFeel: realFeel <= realFeelThreshold - 5 ? "Normal" : realFeel <= realFeelThreshold ? "Warning" : "Critical",
        gas: gas <= gasThreshold - 1000 ? "Normal" : gas <= gasThreshold ? "Warning" : "Critical",
        crowd: crowd >= 30 ? "Normal" : crowd >= 15 ? "Warning" : "Critical"
    };

    // Recommendations
    let recommendations = [];
    const riskLevel = Object.values(statuses).includes("Critical") ? "High" :
                      Object.values(statuses).includes("Warning") ? "Moderate" : "Low";
    const urgency = riskLevel === "High" ? "URGENT: " : riskLevel === "Moderate" ? "CAUTION: " : "";
    const ageGroup = workerAge > 50 ? "Older" : workerAge > 30 ? "Middle" : "Young";

    if (statuses.temp === "Critical") {
        if (ageGroup === "Older") recommendations.push(urgency + "High temp! Rest in cool area now.");
        else if (workerRole.includes("Engineer")) recommendations.push(urgency + "High temp! Check cooling systems.");
        else if (workerRole.includes("Supervisor")) recommendations.push(urgency + "High temp! Ensure team cools down.");
        else recommendations.push(urgency + "High temp! Move to shaded area.");
        if (workingLevel === "High") recommendations.push(urgency + "Critical temp! Evacuate if persists.");
    } else if (statuses.temp === "Warning") {
        recommendations.push(urgency + "Rising temp! " + (ageGroup === "Young" ? "Stay hydrated." : "Take frequent breaks."));
    }

    if (statuses.hum === "Critical") {
        if (ageGroup === "Older") recommendations.push(urgency + "High humidity! Seek dry area.");
        else if (workerRole.includes("Engineer")) recommendations.push(urgency + "High humidity! Increase ventilation.");
        else recommendations.push(urgency + "High humidity! Avoid exertion.");
    } else if (statuses.hum === "Warning") {
        recommendations.push(urgency + "Elevated humidity! Check ventilation.");
    }

    if (statuses.realFeel === "Critical") {
        recommendations.push(urgency + "Extreme heat index! " + (ageGroup === "Older" ? "Rest immediately." : "Find shade."));
        if (workingLevel === "High") recommendations.push(urgency + "Critical heat index! Stop work.");
    } else if (statuses.realFeel === "Warning") {
        recommendations.push(urgency + "High heat index! Wear light clothing.");
    }

    if (statuses.gas === "Critical") {
        if (workerRole.includes("Supervisor")) recommendations.push(urgency + "Dangerous gas! Evacuate team.");
        else recommendations.push(urgency + "Dangerous gas! Move to fresh air.");
        if (workingLevel === "High") recommendations.push(urgency + "Critical gas levels! Evacuate now.");
    } else if (statuses.gas === "Warning") {
        recommendations.push(urgency + "Elevated gas! Open windows.");
    }

    if (statuses.crowd === "Critical") {
        if (workerRole.includes("Supervisor")) recommendations.push(urgency + "Overcrowded! Disperse team.");
        else recommendations.push(urgency + "Overcrowded! Maintain distance.");
    } else if (statuses.crowd === "Warning") {
        recommendations.push(urgency + "Dense crowd! Be cautious.");
    }

    if (recommendations.length === 0) recommendations.push("Environment stable. Continue regular operations.");

    return { statuses, recommendations };
}

// Function to update worker information
function updateWorkerInfo(latestFeed) {
    let worker = {
        uid: latestFeed.field5 || fallbackWorker.uid,
        name: latestFeed.field6 || fallbackWorker.name,
        role: latestFeed.field7 || fallbackWorker.role,
        age: latestFeed.field6 ? parseInt(latestFeed.field6.match(/\d+/)) || fallbackWorker.age : fallbackWorker.age,
        workingLevel: latestFeed.workingLevel || fallbackWorker.workingLevel
    };

    document.getElementById("workerUID").textContent = worker.uid;
    document.getElementById("workerName").textContent = worker.name;
    document.getElementById("workerRole").textContent = worker.role;
    document.getElementById("workerAge").textContent = worker.age;
    document.getElementById("workerLevel").textContent = worker.workingLevel;

    return worker;
}

// Function to update charts
function updateCharts(feeds, isNewData) {
    const labels = feeds.map(f => new Date(f.created_at));
    charts.temp.data.labels = labels;
    charts.temp.data.datasets[0].data = feeds.map(f => parseFloat(f.field1) || 27.5);
    charts.hum.data.labels = labels;
    charts.hum.data.datasets[0].data = feeds.map(f => parseFloat(f.field2) || 65.0);
    charts.realFeel.data.labels = labels;
    charts.realFeel.data.datasets[0].data = feeds.map(f => parseFloat(f.field8) || 30.0);
    charts.gas.data.labels = labels;
    charts.gas.data.datasets[0].data = feeds.map(f => parseInt(f.field3) || 1500);
    charts.crowd.data.labels = labels;
    charts.crowd.data.datasets[0].data = feeds.map(f => parseInt(f.field4) || 50);
    Object.values(charts).forEach(chart => {
        chart.update();
        if (isNewData) {
            const canvas = chart.canvas;
            canvas.classList.add("flash-update");
            setTimeout(() => canvas.classList.remove("flash-update"), 500);
        }
    });
}

// Function to update dashboard
let lastFeedTimestamp = null;
async function updateDashboard(isHistorical = false) {
    const url = isHistorical ? historicalApiUrl : latestApiUrl;
    let data = await fetchThingSpeakData(url);
    let isNewData = true;

    if (!data || !data.feeds || data.feeds.length === 0) {
        // Use hardcoded fallback data
        data = { feeds: isHistorical ? fallbackHistorical : [fallbackFeed] };
        isNewData = false;
        document.getElementById("lastUpdated").classList.add("stale-warning");
        document.getElementById("lastUpdated").textContent = `Last updated: Data unavailable, showing fallback values`;
    } else {
        const latestFeed = data.feeds[data.feeds.length - 1];
        const latestTime = new Date(latestFeed.created_at);
        // Check if data is new
        if (lastFeedTimestamp && latestFeed.created_at === lastFeedTimestamp) {
            return; // Skip update if no new data
        }
        lastFeedTimestamp = latestFeed.created_at;

        // Check for stale data (>2 seconds old)
        const now = new Date();
        if ((now - latestTime) > 2000) {
            document.getElementById("lastUpdated").classList.add("stale-warning");
            document.getElementById("lastUpdated").textContent = `Last updated: ${latestTime.toLocaleString()} (stale data)`;
        } else {
            document.getElementById("lastUpdated").classList.remove("stale-warning");
            document.getElementById("lastUpdated").textContent = `Last updated: ${latestTime.toLocaleString()}`;
        }
    }

    const latestFeed = data.feeds[data.feeds.length - 1];
    const worker = updateWorkerInfo(latestFeed);
    const { statuses, recommendations } = calculateStatusesAndRecommendations(latestFeed, worker);

    // Update status texts
    document.getElementById("tempStatus").textContent = statuses.temp;
    document.getElementById("tempStatus").className = statuses.temp === "Normal" ? "green" :
                                                     statuses.temp === "Warning" ? "yellow" : "red";
    document.getElementById("humStatus").textContent = statuses.hum;
    document.getElementById("humStatus").className = statuses.hum === "Normal" ? "green" :
                                                    statuses.hum === "Warning" ? "yellow" : "red";
    document.getElementById("realFeelStatus").textContent = statuses.realFeel;
    document.getElementById("realFeelStatus").className = statuses.realFeel === "Normal" ? "green" :
                                                         statuses.realFeel === "Warning" ? "yellow" : "red";
    document.getElementById("gasStatus").textContent = statuses.gas;
    document.getElementById("gasStatus").className = statuses.gas === "Normal" ? "green" :
                                                    statuses.gas === "Warning" ? "yellow" : "red";
    document.getElementById("crowdStatus").textContent = statuses.crowd;
    document.getElementById("crowdStatus").className = statuses.crowd === "Normal" ? "green" :
                                                      statuses.crowd === "Warning" ? "yellow" : "red";

    // Update recommendations
    document.getElementById("recommendations").innerHTML = recommendations
        .map((rec, i) => `<p class="mb-2"><strong>${i + 1}.</strong> ${rec}</p>`)
        .join("");

    // Update charts
    let historicalData = data;
    if (!isHistorical) {
        const cachedHistorical = localStorage.getItem("thingSpeakHistorical");
        historicalData = cachedHistorical ? JSON.parse(cachedHistorical) : { feeds: fallbackHistorical };
    }
    if (historicalData && historicalData.feeds) {
        updateCharts(historicalData.feeds, isNewData || isHistorical);
    }
}

// Initialize dashboard with fallback data
updateDashboard(true);
setInterval(() => updateDashboard(false), 1000); // Latest data every 1 second
setInterval(() => updateDashboard(true), 30000); // Historical data every 30 seconds