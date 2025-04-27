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

// -------------------- OBJECT INITS --------------------
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
bool buzzerOverride = false;
float lastGoodHumidity = 50;
unsigned long lastRFIDScanTime = 0;
unsigned long lastDisplayRefresh = 0;
bool showingWelcomeScreen = false;
unsigned long welcomeScreenStartTime = 0;
unsigned long lastGraphSwitch = 0;
bool showingGraphScreen = false;

void setup() {
  Serial.begin(115200);
  delay(1000);

  dht.begin();

  // OLED Init
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(timeStamp() + " [ERROR] OLED Display Initialization Failed!");
    while (true);
  }
  display.clearDisplay();
  display.display();

  // RFID Init
  SPI.begin();
  rfid.PCD_Init();
  Serial.println(timeStamp() + " [OK] RFID Reader Initialized.");

  // SD Card Init
  if (!SD.begin(SD_CS)) {
    Serial.println(timeStamp() + " [ERROR] SD Card Mount Failed!");
    while (true);
  }
  Serial.println(timeStamp() + " [OK] SD Card Initialized.");

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  loadWorkers();

  Serial.println(timeStamp() + " [SYSTEM READY]");
}

void loop() {
  unsigned long currentMillis = millis();

  // 1. Read Sensors
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int gasVal = analogRead(GAS_SENSOR_PIN);

  if (isnan(temp) || isnan(hum)) {
    Serial.println(timeStamp() + " [Warning] Failed to read from DHT sensor!");
    temp = 0;
    hum = lastGoodHumidity;
  } else {
    if (hum >= 20 && hum <= 90) {
      lastGoodHumidity = hum;
    }
  }

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  duration = pulseIn(ECHO_PIN, HIGH, 20000UL);
  distance = duration * 0.034 / 2;

  // 2. Display Updates (Every 2 Seconds)
  if (currentMillis - lastDisplayRefresh > 2000 && !showingWelcomeScreen) {
    if (!showingGraphScreen) {
      displayMainScreen(temp, hum, gasVal, distance);
    } else {
      displayGraphScreen(temp, hum, gasVal);
    }
    lastDisplayRefresh = currentMillis;
  }

  // 3. RFID Scanning
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

  // 4. Reinit RFID Reader
  if (currentMillis - lastRFIDScanTime > 60000) {
    Serial.println(timeStamp() + " [INFO] Refreshing RFID Reader...");
    rfid.PCD_Init();
    lastRFIDScanTime = currentMillis;
  }

  // 5. Timeout Welcome Screen
  if (showingWelcomeScreen && (currentMillis - welcomeScreenStartTime > 5000)) {
    showingWelcomeScreen = false;
    displayMainScreen(temp, hum, gasVal, distance);
  }

  // 6. Safety Monitoring
  bool danger = false;
  String dangerReason = "";

  if (temp > 35) {
    danger = true;
    dangerReason += "High Temp! ";
  }
  if (gasVal > 3000) {
    danger = true;
    dangerReason += "Gas Leak! ";
  }
  if (distance < 20) {
    danger = true;
    dangerReason += "Crowd Risk! ";
  }

  if (danger) {
    digitalWrite(BUZZER_PIN, HIGH);
    Serial.println(timeStamp() + " [ALERT] Danger Detected: " + dangerReason);
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }

  // 7. Switch between Main Screen and Graph every 10 seconds
  if (currentMillis - lastGraphSwitch > 10000) {
    showingGraphScreen = !showingGraphScreen;
    lastGraphSwitch = currentMillis;
  }
}

// -------------------- FUNCTIONS --------------------

// Timestamp Helper
String timeStamp() {
  return "[" + String(millis() / 1000) + "s]";
}

// Main Dashboard OLED
void displayMainScreen(float temp, float hum, int gasVal, int distance) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);

  display.printf("Temp: %.1fC  Hum: %.1f%%\n", temp, hum);
  display.printf("Gas: %d  Crowd: %dcm\n", gasVal, distance);

  if (temp > 35) {
    display.println("Warning: Overheat!");
  } else if (gasVal > 3000) {
    display.println("Warning: Gas Leak!");
  } else if (distance < 20) {
    display.println("Warning: Crowd Risk!");
  } else {
    display.println("Status: Safe ✅");
  }

  display.display();

  Serial.println(timeStamp() + " Temp: " + String(temp) + "°C, Humidity: " + String(hum) + "%");
  Serial.println(timeStamp() + " Gas Sensor: " + String(gasVal) + ", Distance: " + String(distance) + "cm");
}

// Graph Dashboard OLED
void displayGraphScreen(float temp, float hum, int gasVal) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);

  display.setCursor(0, 0);
  display.println("Real-time Levels:");

  int tempBar = map(temp, 0, 50, 0, 100);
  int humBar = map(hum, 0, 100, 0, 100);
  int gasBar = map(gasVal, 0, 4095, 0, 100);

  drawBar(0, 20, tempBar, "Temp");
  drawBar(0, 35, humBar, "Hum");
  drawBar(0, 50, gasBar, "Gas");

  display.display();
}

void drawBar(int x, int y, int width, String label) {
  display.setCursor(x, y - 10);
  display.print(label);
  display.fillRect(x + 40, y - 5, width / 2, 10, WHITE);
}

// Show Welcome Screen
void showWelcomeScreen(String name, String role) {
  showingWelcomeScreen = true;
  welcomeScreenStartTime = millis();

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(10, 10);
  display.println("** Welcome **");
  display.setCursor(10, 30);
  display.println(name);
  display.setCursor(10, 50);
  display.println(role);
  display.display();
}

// Load Workers from SD card
void loadWorkers() {
  File file = SD.open("/workers.txt");
  if (!file) {
    Serial.println(timeStamp() + " [INFO] No previous workers found.");
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
  Serial.println(timeStamp() + " [INFO] " + String(workerCount) + " workers loaded.");
}

// Save new worker to SD card
void saveWorkerToSD(String uid, String name, String role) {
  File file = SD.open("/workers.txt", FILE_APPEND);
  if (!file) {
    Serial.println(timeStamp() + " [ERROR] Failed to open workers file for writing!");
    return;
  }
  file.println(uid + "," + name + "," + role);
  file.close();
}

// Read input string with timeout
String timedReadString() {
  String input = "";
  unsigned long startTime = millis();
  while ((millis() - startTime) < 10000) { // 10 seconds timeout
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
