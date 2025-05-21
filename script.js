// ThingSpeak configuration
const channelID = '2936641';
const readAPIKey = '98ZPQ930QYNNI2A9'; 
const latestFeedURL = `https://api.thingspeak.com/channels/${channelID}/feeds.json?api_key=${readAPIKey}&results=1`;
const trendFeedURL = `https://api.thingspeak.com/channels/${channelID}/feeds.json?api_key=${readAPIKey}&results=10`;

// DOM elements
const tempElement = document.getElementById('temp');
const humidityElement = document.getElementById('humidity');
const gasElement = document.getElementById('gas');
const distanceElement = document.getElementById('distance');
const uidElement = document.getElementById('uid');
const nameElement = document.getElementById('name');
const roleElement = document.getElementById('role');
const statusElement = document.getElementById('status');

// Chart setup
const ctx = document.getElementById('sensorChart').getContext('2d');
const sensorChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'Temperature (°C)', data: [], borderColor: '#e74c3c', fill: false },
      { label: 'Humidity (%)', data: [], borderColor: '#3498db', fill: false },
      { label: 'Gas Level', data: [], borderColor: '#2ecc71', fill: false },
      { label: 'Distance (cm)', data: [], borderColor: '#f1c40f', fill: false }
    ]
  },
  options: {
    responsive: true,
    scales: {
      y: { beginAtZero: true },
      x: { title: { display: true, text: 'Time' } }
    }
  }
});

// Fetch latest data
function fetchLatestData() {
  fetch(latestFeedURL)
    .then(response => response.json())
    .then(data => {
      const feed = data.feeds[0];
      if (feed) {
        // Update sensor data
        const temp = parseFloat(feed.field1) || 0;
        const humidity = parseFloat(feed.field2) || 0;
        const gas = parseInt(feed.field3) || 0;
        const distance = parseInt(feed.field4) || 0;
        tempElement.textContent = temp.toFixed(1);
        humidityElement.textContent = humidity.toFixed(1);
        gasElement.textContent = gas;
        distanceElement.textContent = distance;

        // Update RFID data
        uidElement.textContent = feed.field5 || 'N/A';
        nameElement.textContent = feed.field6 || 'N/A';
        roleElement.textContent = feed.field7 || 'N/A';

        // Update status
        let status = '✅ All Safe';
        let statusColor = 'green';
        if (temp > 35 || humidity < 20 || humidity > 80 || gas > 3000 || distance < 20) {
          status = '⚠️ Critical Alert!';
          statusColor = 'red';
        } else if (temp > 30 || humidity < 30 || humidity > 70 || gas > 2000 || distance < 50) {
          status = '⚠️ Warning!';
          statusColor = 'orange';
        }
        statusElement.textContent = status;
        statusElement.style.color = statusColor;
      }
    })
    .catch(error => {
      console.error('Error fetching data:', error);
      statusElement.textContent = 'Error fetching data';
      statusElement.style.color = 'red';
    });
}

// Fetch trend data for charts
function fetchTrendData() {
  fetch(trendFeedURL)
    .then(response => response.json())
    .then(data => {
      const feeds = data.feeds;
      const labels = feeds.map(feed => new Date(feed.created_at).toLocaleTimeString());
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
    })
    .catch(error => console.error('Error fetching trend data:', error));
}

// Initial fetch and periodic updates
fetchLatestData();
fetchTrendData();
setInterval(fetchLatestData, 30000); // Update every 30 seconds
setInterval(fetchTrendData, 60000); // Update chart every 60 seconds