const thingSpeakChannel = "2936641";
const readApiKey = "98ZPQ930QYNNI2A9";
const thingSpeakApiUrl = `https://api.thingspeak.com/channels/${thingSpeakChannel}/feeds.json?api_key=${readApiKey}&results=10`;

// Hardcoded worker data (fallback, cycled sequentially)
const fallbackWorkers = [
    { uid: "A1B2C3D4", name: "Sovon", role: "Supervisor", age: 45, workingLevel: "High" },
    { uid: "E5F6G7H8", name: "Sudipta", role: "Engineer", age: 32, workingLevel: "Medium" },
    { uid: "I9J0K1L2", name: "Shakhawat", role: "Engineer", age: 28, workingLevel: "Low" },
    { uid: "M3N4O5P6", name: "Tamijid", role: "Visitor", age: 25, workingLevel: "Low" },
    { uid: "Q7R8S9T0", name: "Merilyn", role: "Supervisor", age: 50, workingLevel: "High" }
];
let currentWorkerIndex = 0;

// Chart configurations
const charts = {
    temp: new Chart(document.getElementById("tempChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Temperature (°C)", data: [], borderColor: "#10b981", fill: false }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 60 } } }
    }),
    hum: new Chart(document.getElementById("humChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Humidity (%)", data: [], borderColor: "#3b82f6", fill: false }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } }
    }),
    realFeel: new Chart(document.getElementById("realFeelChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Real Feel (°C)", data: [], borderColor: "#f59e0b", fill: false }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 60 } } }
    }),
    gas: new Chart(document.getElementById("gasChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Gas Level", data: [], borderColor: "#ef4444", fill: false }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 4095 } } }
    }),
    crowd: new Chart(document.getElementById("crowdChart"), {
        type: "line",
        data: { labels: [], datasets: [{ label: "Crowd Distance (cm)", data: [], borderColor: "#8b5cf6", fill: false }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 200 } } }
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
async function fetchThingSpeakData() {
    try {
        const response = await fetch(thingSpeakApiUrl);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (!data.feeds || data.feeds.length === 0) throw new Error("No feeds available");
        // Cache data in localStorage
        localStorage.setItem("thingSpeakCache", JSON.stringify(data));
        return data;
    } catch (error) {
        console.error("Error fetching ThingSpeak data:", error);
        // Return cached data if available
        const cachedData = localStorage.getItem("thingSpeakCache");
        return cachedData ? JSON.parse(cachedData) : null;
    }
}

// Function to calculate sensor statuses and recommendations
function calculateStatusesAndRecommendations(data, worker) {
    const temp = parseFloat(data.field1) || 0;
    const hum = parseFloat(data.field2) || 70;
    const gas = parseInt(data.field3) || 0;
    const crowd = parseInt(data.field4) || 50;
    const realFeel = parseFloat(data.field8) || temp;
    const workerRole = worker.role || "Unknown";
    const workerAge = worker.age || 30;
    const workingLevel = worker.workingLevel || "Medium";

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
        uid: latestFeed.field5 || "",
        name: latestFeed.field6 || "",
        role: latestFeed.field7 || "",
        age: latestFeed.field6 ? parseInt(latestFeed.field6.match(/\d+/)) || 30 : 30,
        workingLevel: " joystick" // Default if not available
    };

    // Fallback to next hardcoded worker if data is missing
    if (!worker.uid || !worker.name || !worker.role) {
        worker = fallbackWorkers[currentWorkerIndex];
        currentWorkerIndex = (currentWorkerIndex + 1) % fallbackWorkers.length;
    }

    document.getElementById("workerUID").textContent = worker.uid || "N/A";
    document.getElementById("workerName").textContent = worker.name || "N/A";
    document.getElementById("workerRole").textContent = worker.role || "N/A";
    document.getElementById("workerAge").textContent = worker.age || "N/A";
    document.getElementById("workerLevel").textContent = worker.workingLevel || "N/A";

    return worker;
}

// Function to update charts
function updateCharts(feeds) {
    const labels = feeds.map(f => new Date(f.created_at).toLocaleTimeString());
    charts.temp.data.labels = labels;
    charts.temp.data.datasets[0].data = feeds.map(f => parseFloat(f.field1) || 0);
    charts.hum.data.labels = labels;
    charts.hum.data.datasets[0].data = feeds.map(f => parseFloat(f.field2) || 70);
    charts.realFeel.data.labels = labels;
    charts.realFeel.data.datasets[0].data = feeds.map(f => parseFloat(f.field8) || 0);
    charts.gas.data.labels = labels;
    charts.gas.data.datasets[0].data = feeds.map(f => parseInt(f.field3) || 0);
    charts.crowd.data.labels = labels;
    charts.crowd.data.datasets[0].data = feeds.map(f => parseInt(f.field4) || 50);
    Object.values(charts).forEach(chart => chart.update());
}

// Function to update dashboard
async function updateDashboard() {
    const data = await fetchThingSpeakData();
    if (!data || !data.feeds || data.feeds.length === 0) {
        // Use fallback worker and show error message
        const worker = fallbackWorkers[currentWorkerIndex];
        currentWorkerIndex = (currentWorkerIndex + 1) % fallbackWorkers.length;
        document.getElementById("workerUID").textContent = worker.uid;
        document.getElementById("workerName").textContent = worker.name;
        document.getElementById("workerRole").textContent = worker.role;
        document.getElementById("workerAge").textContent = worker.age;
        document.getElementById("workerLevel").textContent = worker.workingLevel;
        document.getElementById("recommendations").innerHTML = "<p class='mb-2'><strong>1.</strong> Environment data unavailable. Check sensor connection or API key.</p>";
        return;
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
    updateCharts(data.feeds);
}

// Debounce function to prevent overlapping updates
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Initialize dashboard and set debounced update interval
updateDashboard();
setInterval(debounce(updateDashboard, 15000), 15000); // Update every 15 seconds