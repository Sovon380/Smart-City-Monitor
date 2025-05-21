// ThingSpeak configuration
const channelID = '2936641';
const readAPIKey = '98ZPQ930QYNNI2A9'; // Replace with your ThingSpeak Read API Key
const latestFeedURL = `https://api.thingspeak.com/channels/${channelID}/feeds.json?api_key=${readAPIKey}&results=1`;
const trendFeedURL = `https://api.thingspeak.com/channels/${channelID}/feeds.json?api_key=${readAPIKey}&results=20`;
const rfidFeedURL = `https://api.thingspeak.com/channels/${channelID}/feeds.json?api_key=${readAPIKey}&results=5`;

// DOM elements
const statusElement = document.getElementById('status');
const tempValue = document.getElementById('temp-value');
const humidityValue = document.getElementById('humidity-value');
const gasValue = document.getElementById('gas-value');
const distanceValue = document.getElementById('distance-value');
const refreshBtn = document.getElementById('refresh-btn');
const trendsToggle = document.getElementById('trends-toggle');
const trendsContent = document.getElementById('trends-content');
const rfidToggle = document.getElementById('rfid-toggle');
const rfidContent = document.getElementById('rfid-content');
const rfidTimeline = document.getElementById('rfid-timeline');
const alertModal = document.getElementById('alert-modal');
const alertMessage = document.getElementById('alert-message');
const alertClose = document.getElementById('alert-close');
const themeToggle = document.getElementById('theme-toggle');

// Gauges
let tempGauge, humidityGauge, gasGauge, distanceGauge;
function initGauges() {
  tempGauge = new JustGage({
    id: 'temp-gauge',
    value: 0,
    min: 0,
    max: 50,
    title: '',
    label: '°C',
    gaugeWidthScale: 0.6,
    levelColors: ['#22c55e', '#f97316', '#ef4444'],
    decimals: 1
  });
  humidityGauge = new JustGage({
    id: 'humidity-gauge',
    value: 0,
    min: 0,
    max: 100,
    title: '',
    label: '%',
    gaugeWidthScale: 0.6,
    levelColors: ['#22c55e', '#f97316', '#ef4444'],
    decimals: 1
  });
  gasGauge = new JustGage({
    id: 'gas-gauge',
    value: 0,
    min: 0,
    max: 4095,
    title: '',
    label: '',
    gaugeWidthScale: 0.6,
    levelColors: ['#22c55e', '#f97316', '#ef4444']
  });
  distanceGauge = new JustGage({
    id: 'distance-gauge',
    value: 0,
    min: 0,
    max: 200,
    title: '',
    label: 'cm',
    gaugeWidthScale: 0.6,
    levelColors: ['#22c55e', '#f97316', '#ef4444']
  });
}

// Chart setup
const ctx = document.getElementById('sensorChart').getContext('2d');
const sensorChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'Temperature (°C)', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.3 },
      { label: 'Humidity (%)', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.3 },
      { label: 'Gas Level', data: [], borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', fill: true, tension: 0.3 },
      { label: 'Distance (cm)', data: [], borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.1)', fill: true, tension: 0.3 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { beginAtZero: true, title: { display: true, text: 'Value' } },
      x: { title: { display: true, text: 'Time' } }
    },
    plugins: {
      legend: { position: 'top', labels: { font: { size: 12, family: 'Inter' } } },
      tooltip: { backgroundColor: '#1f2937', titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' } }
    }
  }
});

// Theme toggle
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

// Load theme preference
if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.body.classList.add('dark');
}

// Toggle sections
trendsToggle.addEventListener('click', () => {
  trendsContent.classList.toggle('hidden');
  trendsToggle.querySelector('svg').classList.toggle('rotate-180');
});

rfidToggle.addEventListener('click', () => {
  rfidContent.classList.toggle('hidden');
  rfidToggle.querySelector('svg').classList.toggle('rotate-180');
});

// Alert modal
alertClose.addEventListener('click', () => {
  alertModal.classList.add('hidden');
});

// Fetch and cache data
async function fetchData(url, cacheKey) {
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < 30000) return data;
  }
  const response = await fetch(url);
  const data = await response.json();
  localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
  return data;
}

// Fetch latest data
async function fetchLatestData() {
  try {
    statusElement.textContent = 'Loading...';
    statusElement.className = 'font-bold text-gray-500';
    const data = await fetchData(latestFeedURL, 'latestData');
    const feed = data.feeds[0];
    if (!feed) return;

    // Update gauges and values
    const temp = parseFloat(feed.field1) || 0;
    const humidity = parseFloat(feed.field2) || 0;
    const gas = parseInt(feed.field3) || 0;
    const distance = parseInt(feed.field4) || 0;
    tempGauge.refresh(temp);
    humidityGauge.refresh(humidity);
    gasGauge.refresh(gas);
    distanceGauge.refresh(distance);
    tempValue.textContent = temp.toFixed(1);
    humidityValue.textContent = humidity.toFixed(1);
    gasValue.textContent = gas;
    distanceValue.textContent = distance;

    // Update status
    let status = '✅ All Safe';
    let statusColor = 'text-green-500';
    let alertMsg = '';
    if (temp > 35 || humidity < 20 || humidity > 80 || gas > 3000 || distance < 20) {
      status = '⚠️ Critical Alert!';
      statusColor = 'text-red-500';
      alertMsg = `Critical condition detected: ${temp > 35 ? 'High Temp! ' : ''}${humidity < 20 || humidity > 80 ? 'Extreme Humidity! ' : ''}${gas > 3000 ? 'High Gas! ' : ''}${distance < 20 ? 'Crowd Overload! ' : ''}`;
      alertModal.classList.remove('hidden');
      alertMessage.textContent = alertMsg;
    } else if (temp > 30 || humidity < 30 || humidity > 70 || gas > 2000 || distance < 50) {
      status = '⚠️ Warning!';
      statusColor = 'text-orange-500';
    }
    statusElement.textContent = status;
    statusElement.className = `font-bold ${statusColor} animate-fadeIn`;
  } catch (error) {
    console.error('Error fetching latest data:', error);
    statusElement.textContent = 'Error fetching data';
    statusElement.className = 'font-bold text-red-500';
  }
}

// Fetch trend data
async function fetchTrendData() {
  try {
    const data = await fetchData(trendFeedURL, 'trendData');
    const feeds = data.feeds;
    const labels = feeds.map(feed => new Date(feed.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const tempData = feeds.map(feed => parseFloat(feed.field1) || 0);
    const humidityData = feeds.map(feed => parseFloat(feed.field2) || 0);
    const gasData = feeds.map(feed => parseInt(feed.field3) || 0);
    const distanceData = feeds.map(feed => parseInt(feed.field4) || 0);

    sensorChart.data.labels = labels;
    sensorChart.data.datasets[0].data = tempData;
    sensorChart.data.datasets[1].data = humidityData;
    sensorChart.data.datasets[2].data = gasData;
    sensorChart.data.datasets[3].data = distanceData;
    sensorChart.update();
  } catch (error) {
    console.error('Error fetching trend data:', error);
  }
}

// Fetch RFID timeline
async function fetchRFIDTimeline() {
  try {
    const data = await fetchData(rfidFeedURL, 'rfidData');
    const feeds = data.feeds.reverse();
    rfidTimeline.innerHTML = '';
    feeds.forEach(feed => {
      if (feed.field5 || feed.field6 || feed.field7) {
        const item = document.createElement('div');
        item.className = 'timeline-item p-4 rounded dark:bg-gray-700 animate-fadeIn';
        item.innerHTML = `
          <p class="text-sm text-gray-500 dark:text-gray-400"><strong>Time:</strong> ${new Date(feed.created_at).toLocaleString()}</p>
          <p><strong>UID:</strong> ${feed.field5 || 'N/A'}</p>
          <p><strong>Name:</strong> ${feed.field6 || 'N/A'}</p>
          <p><strong>Role:</strong> ${feed.field7 || 'N/A'}</p>
        `;
        rfidTimeline.appendChild(item);
      }
    });
  } catch (error) {
    console.error('Error fetching RFID data:', error);
    rfidTimeline.innerHTML = '<p class="text-red-500">Error loading RFID data</p>';
  }
}

// Manual refresh
refreshBtn.addEventListener('click', () => {
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<svg class="w-5 h-5 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Refreshing...';
  Promise.all([fetchLatestData(), fetchTrendData(), fetchRFIDTimeline()]).then(() => {
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = '<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Refresh';
  });
});

// Initial setup
initGauges();
fetchLatestData();
fetchTrendData();
fetchRFIDTimeline();
setInterval(fetchLatestData, 30000);
setInterval(fetchTrendData, 60000);
setInterval(fetchRFIDTimeline, 60000);