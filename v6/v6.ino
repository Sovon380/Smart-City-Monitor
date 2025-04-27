#include <WiFi.h>
#include <SPI.h>
#include <SD.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <MFRC522.h>

// -------------------- PIN DEFINITIONS --------------------
#define DHTPIN 4
#define DHTTYPE DHT11
#define GAS_SENSOR_PIN 34
#define BUZZER_PIN 15
#define TRIG_PIN 12
#define ECHO_PIN 14
#define OLED_SDA 21
#define OLED_SCL 22
#define SD_CS 5
#define RST_PIN 27
#define SS_PIN 25

// -------------------- OBJECTS --------------------
DHT dht(DHTPIN, DHTTYPE);
Adafruit_SSD1306 display(128, 64, &Wire, -1);
MFRC522 rfid(SS_PIN, RST_PIN);

// -------------------- STRUCTURES --------------------
struct Worker {
  String uid;
  String name;
  String role;
};

Worker workers[50];
int workerCount = 0;

// -------------------- VARIABLES --------------------
long duration;
int distance;
float lastGoodHumidity = 50.0;
bool buzzerOverride = false;

bool showingWelcomeScreen = false;
bool showingGraphScreen = false;

unsigned long lastSensorReadTime = 0;
unsigned long lastDisplayRefresh = 0;
unsigned long lastRFIDScanTime = 0;
unsigned long welcomeScreenStartTime = 0;
unsigned long lastGraphSwitchTime = 0;

float temp = 0;
float hum = 50;
int gasVal = 0;

// -------------------- SETUP --------------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize DHT Sensor
  dht.begin();

  // Initialize OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(timeStamp() + " [ERROR] OLED Initialization Failed!");
    while (true);
  }
  display.clearDisplay();
  display.display();

  // Initialize RFID
  SPI.begin();
  rfid.PCD_Init();
  Serial.println(timeStamp() + " [OK] RFID Reader Ready.");

  // Initialize SD Card
  if (!SD.begin(SD_CS)) {
    Serial.println(timeStamp() + " [ERROR] SD Card Mount Failed!");
    while (true);
  }
  Serial.println(timeStamp() + " [OK] SD Card Initialized.");

  // Pin Modes
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Load Workers
  loadWorkers();

  Serial.println(timeStamp() + " [SYSTEM READY]");
}

void loop() {
  unsigned long currentMillis = millis();

  // 1. Read Sensors Every 2 seconds
  if (currentMillis - lastSensorReadTime > 2000) {
    readSensors();
    lastSensorReadTime = currentMillis;
  }

  // 2. Update OLED Display Every 2 seconds
  if (!showingWelcomeScreen && currentMillis - lastDisplayRefresh > 2000) {
    if (!showingGraphScreen) {
      displayMainScreen();
    } else {
      displayGraphScreen();
    }
    lastDisplayRefresh = currentMillis;
  }

  // 3. RFID Card Detection
  checkRFID(currentMillis);

  // 4. Refresh RFID Module Every 1 Minute
  if (currentMillis - lastRFIDScanTime > 60000) {
    Serial.println(timeStamp() + " [INFO] Refreshing RFID Reader...");
    rfid.PCD_Init();
    lastRFIDScanTime = currentMillis;
  }

  // 5. Timeout Welcome Screen
  if (showingWelcomeScreen && (currentMillis - welcomeScreenStartTime > 5000)) {
    showingWelcomeScreen = false;
  }

  // 6. Switch Between Main and Graph Screen Every 10 Seconds
  if (currentMillis - lastGraphSwitchTime > 10000) {
    showingGraphScreen = !showingGraphScreen;
    lastGraphSwitchTime = currentMillis;
  }

  // 7. Safety Monitoring and Alert
  safetyMonitor();
}

void readSensors() {
  temp = dht.readTemperature();
  hum = dht.readHumidity();
  gasVal = analogRead(GAS_SENSOR_PIN);

  if (isnan(temp) || isnan(hum)) {
    Serial.println(timeStamp() + " [Warning] Failed to read from DHT sensor!");
    temp = 0;
    hum = lastGoodHumidity;
  } else {
    if (hum >= 20 && hum <= 90) {
      lastGoodHumidity = hum;
    }
  }

  // Crowd Distance (Ultrasonic Sensor)
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  duration = pulseIn(ECHO_PIN, HIGH, 20000UL);
  distance = duration * 0.034 / 2;
}
void checkRFID(unsigned long currentMillis) {
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    lastRFIDScanTime = currentMillis;

    String uid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      uid += String(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
      uid += String(rfid.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    Serial.println(timeStamp() + " Scanned UID: " + uid);

    bool found = false;
    for (int i = 0; i < workerCount; i++) {
      if (workers[i].uid == uid) {
        Serial.println(timeStamp() + " [FOUND] " + workers[i].name + " (" + workers[i].role + ")");
        showWelcomeScreen(workers[i].name, workers[i].role);
        found = true;
        break;
      }
    }

    if (!found) {
      Serial.println(timeStamp() + " [NEW] Unknown card detected!");
      Serial.println("Please type new worker name:");
      String newName = timedReadString();
      newName.trim();

      Serial.println("Enter role (Engineer/Supervisor/Visitor):");
      String newRole = timedReadString();
      newRole.trim();

      workers[workerCount].uid = uid;
      workers[workerCount].name = newName;
      workers[workerCount].role = newRole;
      workerCount++;

      saveWorkerToSD(uid, newName, newRole);

      Serial.println(timeStamp() + " [REGISTERED] " + newName + " added successfully!");
      showWelcomeScreen(newName, newRole);
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }
}
void safetyMonitor() {
  bool danger = false;
  String recommendation = "";

  if (temp > 35) {
    danger = true;
    recommendation += "Turn on Cooling! ";
  }
  if (gasVal > 3000) {
    danger = true;
    recommendation += "Ventilate Room! ";
  }
  if (distance < 20) {
    danger = true;
    recommendation += "Reduce Crowd! ";
  }

  if (danger) {
    digitalWrite(BUZZER_PIN, HIGH);
    Serial.println(timeStamp() + " [ALERT] Safety Risk! Recommendations: " + recommendation);
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }
}
void displayMainScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);

  display.setCursor(0, 0);
  display.println("🏙️ Environment Status");

  display.setCursor(0, 15);
  display.printf("Temp: %.1fC", temp);

  display.setCursor(0, 25);
  display.printf("Humidity: %.1f%%", hum);

  display.setCursor(0, 35);
  display.printf("Gas Level: %d", gasVal);

  display.setCursor(0, 45);
  display.printf("Crowd Dist: %d cm", distance);

  // Recommendation Based on Danger
  if (temp > 35 || gasVal > 3000 || distance < 20) {
    display.setCursor(0, 55);
    display.setTextColor(WHITE, BLACK);
    display.print("⚠️ Danger Detected!");
  } else {
    display.setCursor(0, 55);
    display.setTextColor(WHITE, BLACK);
    display.print("✅ Safe Environment");
  }

  display.display();
}
void displayGraphScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);

  display.setCursor(0, 0);
  display.println("📊 Live Sensor Graphs");

  drawBarGraph(0, 20, map(temp, 0, 50, 0, 100), "Temp");
  drawBarGraph(0, 35, map(hum, 0, 100, 0, 100), "Humid");
  drawBarGraph(0, 50, map(gasVal, 0, 4095, 0, 100), "Gas");

  display.display();
}

void drawBarGraph(int x, int y, int widthPercent, String label) {
  display.setCursor(x, y - 8);
  display.print(label);
  display.drawRect(x + 40, y - 5, 50, 8, WHITE);
  display.fillRect(x + 40, y - 5, widthPercent / 2, 8, WHITE);
}
void showWelcomeScreen(String name, String role) {
  showingWelcomeScreen = true;
  welcomeScreenStartTime = millis();

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);

  display.setCursor(10, 5);
  display.println("👋 Welcome!");

  display.setCursor(10, 25);
  display.println(name);

  display.setCursor(10, 45);
  display.println("(" + role + ")");

  display.display();
}
void saveWorkerToSD(String uid, String name, String role) {
  File file = SD.open("/workers.txt", FILE_APPEND);
  if (!file) {
    Serial.println(timeStamp() + " [ERROR] Failed to open workers file!");
    return;
  }
  file.println(uid + "," + name + "," + role);
  file.close();
}
void loadWorkers() {
  File file = SD.open("/workers.txt");
  if (!file) {
    Serial.println(timeStamp() + " [INFO] No workers file found. Starting fresh.");
    return;
  }

  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    int firstComma = line.indexOf(',');
    int secondComma = line.indexOf(',', firstComma + 1);

    if (firstComma > 0 && secondComma > firstComma) {
      workers[workerCount].uid = line.substring(0, firstComma);
      workers[workerCount].name = line.substring(firstComma + 1, secondComma);
      workers[workerCount].role = line.substring(secondComma + 1);
      workerCount++;
    }
  }
  file.close();
}
String timedReadString() {
  String input = "";
  unsigned long startTime = millis();
  while ((millis() - startTime) < 10000) { // 10 sec timeout
    while (Serial.available()) {
      char c = Serial.read();
      if (c == '\n') {
        return input;
      }
      input += c;
    }
  }
  return input;
}
String timeStamp() {
  return "[" + String(millis() / 1000) + "s]";
}
