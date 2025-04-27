// -------------------- Libraries --------------------
#include <WiFi.h>

// -------------------- Blynk Credentials --------------------
#define BLYNK_TEMPLATE_ID "TMPL65To3Tkgl"
#define BLYNK_TEMPLATE_NAME "Smart City Monitor"
#define BLYNK_AUTH_TOKEN "eOvBi1kprAb3oBSSsJwtE3cTk1ry9lGd"

#include <BlynkSimpleEsp32.h>
#include <ThingSpeak.h>
#include <SPI.h>
#include <SD.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <MFRC522.h>

// -------------------- WiFi Credentials --------------------
char ssid[] = "Last";
char pass[] = "123456780";


char auth[] = BLYNK_AUTH_TOKEN;

// -------------------- ThingSpeak Credentials --------------------
WiFiClient client;
unsigned long myChannelNumber = 2936641;  // Numeric ID of your channel
const char * myWriteAPIKey = "K0JZSUIXY2J91NCL";

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
unsigned long lastThingSpeakUpdate = 0;

float temp = 0;
float hum = 50;
int gasVal = 0;

// Last scanned info (for Blynk + ThingSpeak)
String lastUID = "";
String lastWorkerName = "";
String lastWorkerRole = "";

// -------------------- SETUP --------------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  dht.begin();

  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(timeStamp() + " [ERROR] OLED Initialization Failed!");
    while (true);
  }
  display.clearDisplay();
  display.display();

  SPI.begin();
  rfid.PCD_Init();
  Serial.println(timeStamp() + " [OK] RFID Reader Ready.");

  if (!SD.begin(SD_CS)) {
    Serial.println(timeStamp() + " [ERROR] SD Card Mount Failed!");
    while (true);
  }
  Serial.println(timeStamp() + " [OK] SD Card Initialized.");

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  loadWorkers();

  WiFi.begin(ssid, pass);
  Blynk.begin(auth, ssid, pass);
  ThingSpeak.begin(client);

  Serial.println(timeStamp() + " [SYSTEM READY]");
}

// -------------------- LOOP --------------------
void loop() {
  unsigned long currentMillis = millis();
  Blynk.run();

  if (currentMillis - lastSensorReadTime > 2000) {
    readSensors();
    lastSensorReadTime = currentMillis;
  }

  if (!showingWelcomeScreen && currentMillis - lastDisplayRefresh > 2000) {
    if (!showingGraphScreen) {
      displayMainScreen();
    } else {
      displayGraphScreen();
    }
    lastDisplayRefresh = currentMillis;
  }

  checkRFID(currentMillis);

  if (currentMillis - lastRFIDScanTime > 60000) {
    Serial.println(timeStamp() + " [INFO] Refreshing RFID Reader...");
    rfid.PCD_Init();
    lastRFIDScanTime = currentMillis;
  }

  if (showingWelcomeScreen && (currentMillis - welcomeScreenStartTime > 5000)) {
    showingWelcomeScreen = false;
  }

  if (currentMillis - lastGraphSwitchTime > 10000) {
    showingGraphScreen = !showingGraphScreen;
    lastGraphSwitchTime = currentMillis;
  }

  safetyMonitor();

  if (currentMillis - lastThingSpeakUpdate > 16000) {
    updateThingSpeak();
    lastThingSpeakUpdate = currentMillis;
  }
}

// -------------------- FUNCTIONS --------------------
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

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  duration = pulseIn(ECHO_PIN, HIGH, 20000UL);
  distance = duration * 0.034 / 2;

  // Blynk virtual writes
  Blynk.virtualWrite(V0, temp);
  Blynk.virtualWrite(V1, hum);
  Blynk.virtualWrite(V2, gasVal);
  Blynk.virtualWrite(V3, distance);
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

  if (temp > 35 || gasVal > 3000 || distance < 20) {
    display.setCursor(0, 55);
    display.print("⚠️ Danger Detected!");
  } else {
    display.setCursor(0, 55);
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

void checkRFID(unsigned long currentMillis) {
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    lastRFIDScanTime = currentMillis;

    String uid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      uid += String(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
      uid += String(rfid.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    lastUID = uid;
    Serial.println(timeStamp() + " Scanned UID: " + uid);

    bool found = false;
    for (int i = 0; i < workerCount; i++) {
      if (workers[i].uid == uid) {
        lastWorkerName = workers[i].name;
        lastWorkerRole = workers[i].role;

        Serial.println(timeStamp() + " [FOUND] " + workers[i].name + " (" + workers[i].role + ")");
        showWelcomeScreen(lastWorkerName, lastWorkerRole);

        Blynk.virtualWrite(V4, lastUID);
        Blynk.virtualWrite(V5, lastWorkerName);
        Blynk.virtualWrite(V6, lastWorkerRole);

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

      lastWorkerName = newName;
      lastWorkerRole = newRole;

      Serial.println(timeStamp() + " [REGISTERED] " + newName + " added successfully!");
      showWelcomeScreen(lastWorkerName, lastWorkerRole);

      Blynk.virtualWrite(V4, lastUID);
      Blynk.virtualWrite(V5, lastWorkerName);
      Blynk.virtualWrite(V6, lastWorkerRole);
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
    Serial.println(timeStamp() + " [ALERT] Risk! " + recommendation);
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }
}

void updateThingSpeak() {
  ThingSpeak.setField(1, temp);
  ThingSpeak.setField(2, hum);
  ThingSpeak.setField(3, gasVal);
  ThingSpeak.setField(4, distance);
  ThingSpeak.setField(5, lastUID);
  ThingSpeak.setField(6, lastWorkerName);
  ThingSpeak.setField(7, lastWorkerRole);

  int x = ThingSpeak.writeFields(myChannelNumber, myWriteAPIKey);
  if (x == 200) {
    Serial.println(timeStamp() + " [ThingSpeak] Update successful.");
  } else {
    Serial.println(timeStamp() + " [ThingSpeak] Error code: " + String(x));
  }
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
    Serial.println(timeStamp() + " [ERROR] Saving worker failed!");
    return;
  }
  file.println(uid + "," + name + "," + role);
  file.close();
}

void loadWorkers() {
  File file = SD.open("/workers.txt");
  if (!file) {
    Serial.println(timeStamp() + " [INFO] No existing worker database.");
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
  while ((millis() - startTime) < 10000) {
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
