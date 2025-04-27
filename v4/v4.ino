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
  String role; // New field: Role of worker (Engineer, Supervisor, Visitor, etc.)
};

Worker workers[50];
int workerCount = 0;

// -------------------- VARIABLES --------------------
long duration;
int distance;
bool buzzerOverride = false;
float lastGoodHumidity = 50; // Default good humidity
unsigned long lastRFIDScanTime = 0;
unsigned long lastDisplayRefresh = 0;
bool showingWelcomeScreen = false;
unsigned long welcomeScreenStartTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  dht.begin();

  // OLED Init
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[ERROR] OLED Display Initialization Failed!");
    while (true);
  }
  display.clearDisplay();
  display.display();

  // RFID Init
  SPI.begin();
  rfid.PCD_Init();
  Serial.println("[OK] RFID Reader Initialized.");

  // SD Card Init
  if (!SD.begin(SD_CS)) {
    Serial.println("[ERROR] SD Card Mount Failed!");
    while (true);
  }
  Serial.println("[OK] SD Card Initialized.");

  // Pins Init
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Load workers from SD
  loadWorkers();

  Serial.println("[SYSTEM READY]");
}

void loop() {
  unsigned long currentMillis = millis();

  // 1. Read Sensors
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int gasVal = analogRead(GAS_SENSOR_PIN);

  if (isnan(temp) || isnan(hum)) {
    Serial.println("[Warning] Failed to read from DHT sensor!");
    temp = 0;
    hum = lastGoodHumidity;
  } else {
    if (hum >= 20 && hum <= 90) {
      lastGoodHumidity = hum;
    }
  }

  // Ultrasonic distance
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  duration = pulseIn(ECHO_PIN, HIGH, 20000UL); // 20ms timeout
  distance = duration * 0.034 / 2;

  // 2. Update Display every 2 seconds
  if (currentMillis - lastDisplayRefresh > 2000 && !showingWelcomeScreen) {
    displayMainScreen(temp, hum, gasVal, distance);
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
    Serial.println("Scanned UID: " + uid);

    bool found = false;
    for (int i = 0; i < workerCount; i++) {
      if (workers[i].uid == uid) {
        Serial.println("[FOUND] " + workers[i].name + " (" + workers[i].role + ")");
        showWelcomeScreen(workers[i].name, workers[i].role);
        found = true;
        break;
      }
    }

    if (!found) {
      Serial.println("[NEW] Unknown card detected!");
      Serial.println("Please type new worker name:");
      while (!Serial.available());
      String newName = Serial.readStringUntil('\n');
      newName.trim();

      Serial.println("Enter role (Engineer/Supervisor/Visitor):");
      while (!Serial.available());
      String newRole = Serial.readStringUntil('\n');
      newRole.trim();

      workers[workerCount].uid = uid;
      workers[workerCount].name = newName;
      workers[workerCount].role = newRole;
      workerCount++;

      saveWorkerToSD(uid, newName, newRole);

      Serial.println("[REGISTERED] " + newName + " added successfully!");
      showWelcomeScreen(newName, newRole);
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }

  // 4. RFID Reader Reinit if No Scans for Long Time
  if (currentMillis - lastRFIDScanTime > 60000) {
    Serial.println("[INFO] Refreshing RFID Reader...");
    rfid.PCD_Init();
    lastRFIDScanTime = currentMillis;
  }

  // 5. Timeout Welcome screen after 5 seconds
  if (showingWelcomeScreen && (currentMillis - welcomeScreenStartTime > 5000)) {
    showingWelcomeScreen = false;
    displayMainScreen(temp, hum, gasVal, distance);
  }

  // 6. Safety Monitoring + Personalized Alerts
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
    Serial.println("[ALERT] Danger Detected: " + dangerReason);
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }
}

// -------------------- FUNCTIONS --------------------

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

  Serial.println("Temp: " + String(temp) + "°C, Humidity: " + String(hum) + "%");
  Serial.println("Gas Sensor: " + String(gasVal) + ", Distance: " + String(distance) + "cm");
}

// Show Welcome Screen for Scanned User
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

// Load Workers from SD
void loadWorkers() {
  File file = SD.open("/workers.txt");
  if (!file) {
    Serial.println("[INFO] No previous workers found.");
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
  Serial.println("[INFO] " + String(workerCount) + " workers loaded.");
}

// Save Worker to SD
void saveWorkerToSD(String uid, String name, String role) {
  File file = SD.open("/workers.txt", FILE_APPEND);
  if (file) {
    file.println(uid + "," + name + "," + role);
    file.close();
    Serial.println("[OK] Worker saved to SD Card.");
  } else {
    Serial.println("[ERROR] Could not open file to save worker!");
  }
}
