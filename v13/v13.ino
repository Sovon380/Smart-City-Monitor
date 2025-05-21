// -------------------- Blynk Credentials (Commented for Future Use) --------------------
// #define BLYNK_TEMPLATE_ID "TMPL65To3Tkgl"
// #define BLYNK_TEMPLATE_NAME "Smart City Monitor"
// #define BLYNK_AUTH_TOKEN "eOvBi1kprAb3oBSSsJwtE3cTk1ry9lGd"

// -------------------- Libraries --------------------
#include <WiFi.h>
// #include <BlynkSimpleEsp32.h> // Commented out
#include <ThingSpeak.h>
#include <SPI.h>
#include <SD.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <MFRC522.h>

// -------------------- WiFi Credentials --------------------
char ssid[] = "R8202GHZ";
char pass[] = "%A4f%t^ejAGiMP";
// char auth[] = BLYNK_AUTH_TOKEN; // Commented out

// -------------------- ThingSpeak Credentials --------------------
WiFiClient client;
unsigned long myChannelNumber = 2936641;
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

// -------------------- ENUMS --------------------
enum SensorStatus { NORMAL, WARNING, CRITICAL };
enum RiskLevel { RISK_LOW, RISK_MODERATE, RISK_HIGH };
enum WorkingLevel { WL_LOW, WL_MEDIUM, WL_HIGH };
enum DisplayScreen { SCREEN_1, SCREEN_2, GRAPH, HEALTH_TIPS };

// -------------------- STRUCTURES --------------------
struct Worker {
  String uid;
  String name;
  String role;
  int age;
  WorkingLevel workingLevel;
};

struct WorkerRiskProfile {
  String uid;
  String name;
  float tempThreshold; // Critical temp threshold (°C)
  int gasThreshold;   // Critical gas threshold
  bool buzzerEnabled; // Allow buzzer for this worker
};

Worker workers[50];
int workerCount = 0;
WorkerRiskProfile riskProfiles[5];
int profileCount = 0;
WorkerRiskProfile currentRiskProfile;

// -------------------- VARIABLES --------------------
long duration;
int distance;
float lastGoodHumidity = 70.0;
bool showingWelcomeScreen = false;
bool buzzerOverride = false;

unsigned long lastSensorReadTime = 0;
unsigned long lastDisplayRefresh = 0;
unsigned long lastRFIDScanTime = 0;
unsigned long welcomeScreenStartTime = 0;
unsigned long lastScreenSwitchTime = 0;
unsigned long lastThingSpeakUpdate = 0;
unsigned long lastCriticalAlertTime = 0;

float temp = 0;
float hum = 70.0;
float realFeel = 0;
int gasVal = 0;

String lastUID = "";
String lastWorkerName = "";
String lastWorkerRole = "";
int lastWorkerAge = 0;
WorkingLevel lastWorkerWorkingLevel = WL_LOW;

// Humidity calibration buffer
float humidityBuffer[3] = {0, 0, 0};
int bufferIndex = 0;

// Sensor statuses
SensorStatus tempStatus = NORMAL;
SensorStatus humStatus = NORMAL;
SensorStatus realFeelStatus = NORMAL;
SensorStatus gasStatus = NORMAL;
SensorStatus crowdStatus = NORMAL;

// Display cycle
DisplayScreen currentScreen = SCREEN_1;

// Health tips
String healthTips[] = {
  "Stay hydrated, drink water regularly.",
  "Wear light clothing in hot conditions.",
  "Take breaks in shaded areas.",
  "Monitor for signs of heat stress.",
  "Ensure proper ventilation in workspace."
};
int currentTipIndex = 0;

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

  // Default risk profile
  currentRiskProfile = {"", "Default", 35.0, 3000, true};

  // Hardcode risk profiles
  riskProfiles[0] = {"A1B2C3D4", "Alice (Engineer)", 32.0, 3000, true}; // Temp-sensitive
  riskProfiles[1] = {"E5F6G7H8", "Bob (Supervisor)", 35.0, 2500, true};   // Gas-sensitive
  riskProfiles[2] = {"I9J0K1L2", "Charlie (Engineer)", 33.0, 2800, true}; // Temp-sensitive
  riskProfiles[3] = {"M3N4O5P6", "Diana (Visitor)", 37.0, 3500, false};  // Relaxed, no buzzer
  riskProfiles[4] = {"Q7R8S9T0", "Eve (Supervisor)", 35.0, 2700, true};  // Gas-sensitive
  profileCount = 5;

  loadWorkers();

  WiFi.begin(ssid, pass);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println(timeStamp() + " Connecting to WiFi...");
  }
  Serial.println(timeStamp() + " [OK] WiFi Connected.");
  // Blynk.begin(auth, ssid, pass); // Commented out
  ThingSpeak.begin(client);

  Serial.println(timeStamp() + " [SYSTEM READY]");
  Serial.println(timeStamp() + " Type 'ENROLL' to register a new card.");
}

// -------------------- LOOP --------------------
void loop() {
  unsigned long currentMillis = millis();
  // Blynk.run(); // Commented out

  if (currentMillis - lastSensorReadTime > 2000) {
    readSensors();
    lastSensorReadTime = currentMillis;
  }

  if (currentMillis - lastDisplayRefresh > 2000) {
    if (showingWelcomeScreen) {
      if (currentMillis - welcomeScreenStartTime > 5000) {
        showingWelcomeScreen = false;
      }
    } else {
      if (currentMillis - lastScreenSwitchTime > 5000) {
        currentScreen = (DisplayScreen)((currentScreen + 1) % 4); // Cycle: SCREEN_1 -> SCREEN_2 -> GRAPH -> HEALTH_TIPS
        if (currentScreen == HEALTH_TIPS) {
          currentTipIndex = (currentTipIndex + 1) % 5; // Rotate tips
        }
        lastScreenSwitchTime = currentMillis;
      }
      switch (currentScreen) {
        case SCREEN_1: displayScreen1(); break;
        case SCREEN_2: displayScreen2(); break;
        case GRAPH: displayGraphScreen(); break;
        case HEALTH_TIPS: displayHealthTips(); break;
      }
    }
    lastDisplayRefresh = currentMillis;
  }

  checkRFID(currentMillis);
  checkSerialEnrollment();

  if (currentMillis - lastRFIDScanTime > 60000) {
    Serial.println(timeStamp() + " [INFO] Refreshing RFID Reader...");
    rfid.PCD_Init();
    currentRiskProfile = {"", "Default", 35.0, 3000, true}; // Reset profile
    lastRFIDScanTime = currentMillis;
  }

  if (currentMillis - lastThingSpeakUpdate > 16000) {
    updateThingSpeak();
    lastThingSpeakUpdate = currentMillis;
  }

  safetyMonitor();
}

// -------------------- FUNCTIONS --------------------
float calibrateHumidity(float rawHumidity) {
  if (rawHumidity < 0 || rawHumidity > 100 || isnan(rawHumidity)) {
    return lastGoodHumidity;
  }
  humidityBuffer[bufferIndex] = rawHumidity;
  bufferIndex = (bufferIndex + 1) % 3;
  float movingAvg = 0;
  for (int i = 0; i < 3; i++) {
    movingAvg += humidityBuffer[i];
  }
  movingAvg /= 3.0;
  return 70.0 + (movingAvg / 100.0) * (85.0 - 70.0);
}

float calculateRealFeel(float temp, float humidity) {
  if (temp < 20 || humidity < 40) return temp;
  float hi = -8.78469475556 + 1.61139411 * temp + 2.33854883889 * humidity
             - 0.14611605 * temp * humidity - 0.012308094 * temp * temp
             - 0.0164248277778 * humidity * humidity + 0.002211732 * temp * temp * humidity
             + 0.00072546 * temp * humidity * humidity - 0.000003582 * temp * temp * humidity * humidity;
  return hi < temp ? temp : hi;
}

void readSensors() {
  temp = dht.readTemperature();
  float rawHumidity = dht.readHumidity();
  hum = calibrateHumidity(rawHumidity);
  realFeel = calculateRealFeel(temp, hum);
  gasVal = analogRead(GAS_SENSOR_PIN);

  if (isnan(temp) || isnan(rawHumidity)) {
    Serial.println(timeStamp() + " [WARNING] Failed to read from DHT sensor!");
    temp = 0;
    hum = lastGoodHumidity;
    realFeel = temp;
  } else {
    lastGoodHumidity = hum;
  }

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  duration = pulseIn(ECHO_PIN, HIGH, 20000UL);
  distance = duration * 0.034 / 2;

  updateSensorStatuses();
}

void updateSensorStatuses() {
  float tempCrit = currentRiskProfile.tempThreshold;
  if (temp <= tempCrit - 5) tempStatus = NORMAL;
  else if (temp <= tempCrit) tempStatus = WARNING;
  else tempStatus = CRITICAL;

  if (hum <= 80) humStatus = NORMAL;
  else if (hum <= 85) humStatus = WARNING;
  else humStatus = CRITICAL;

  float realFeelCrit = tempCrit + 7;
  if (realFeel <= realFeelCrit - 5) realFeelStatus = NORMAL;
  else if (realFeel <= realFeelCrit) realFeelStatus = WARNING;
  else realFeelStatus = CRITICAL;

  int gasCrit = currentRiskProfile.gasThreshold;
  if (gasVal <= gasCrit - 1000) gasStatus = NORMAL;
  else if (gasVal <= gasCrit) gasStatus = WARNING;
  else gasStatus = CRITICAL;

  if (distance >= 30) crowdStatus = NORMAL; // ~<10 people
  else if (distance >= 15) crowdStatus = WARNING; // ~10-20 people
  else crowdStatus = CRITICAL; // ~>20 people

  logSensorStatus();
}

void logSensorStatus() {
  Serial.println(timeStamp() + " [SENSOR STATUS]");
  Serial.printf("Profile: %s\n", currentRiskProfile.name.c_str());
  Serial.printf("Temperature: %.1f°C (%s)\n", temp, statusToString(tempStatus));
  Serial.printf("Humidity: %.1f%% (%s)\n", hum, statusToString(humStatus));
  Serial.printf("Real Feel: %.1f°C (%s)\n", realFeel, statusToString(realFeelStatus));
  Serial.printf("Gas Level: %d (%s)\n", gasVal, statusToString(gasStatus));
  Serial.printf("Crowd Distance: %d cm (%s)\n", distance, statusToString(crowdStatus));
  Serial.printf("Risk Level: %s\n", riskLevelToString(calculateRiskLevel()));
}

String statusToString(SensorStatus status) {
  switch (status) {
    case NORMAL: return "Normal";
    case WARNING: return "Warning";
    case CRITICAL: return "Critical";
    default: return "Unknown";
  }
}

String workingLevelToString(WorkingLevel wl) {
  switch (wl) {
    case WL_LOW: return "Low";
    case WL_MEDIUM: return "Medium";
    case WL_HIGH: return "High";
    default: return "Unknown";
  }
}

RiskLevel calculateRiskLevel() {
  if (tempStatus == CRITICAL || humStatus == CRITICAL || realFeelStatus == CRITICAL ||
      gasStatus == CRITICAL || crowdStatus == CRITICAL) {
    return RISK_HIGH;
  } else if (tempStatus == WARNING || humStatus == WARNING || realFeelStatus == WARNING ||
             gasStatus == WARNING || crowdStatus == WARNING) {
    return RISK_MODERATE;
  }
  return RISK_LOW;
}

String riskLevelToString(RiskLevel level) {
  switch (level) {
    case RISK_LOW: return "Low";
    case RISK_MODERATE: return "Moderate";
    case RISK_HIGH: return "High";
    default: return "Unknown";
  }
}

void displayScreen1() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);

  display.setCursor(0, 0);
  display.println(" Env Status");

  display.setCursor(0, 12);
  display.printf("Temp: %.1fC %s", temp, statusToString(tempStatus).c_str());

  display.setCursor(0, 24);
  display.printf("Hum: %.1f%% %s", hum, statusToString(humStatus).c_str());

  display.setCursor(0, 36);
  display.printf("RealFeel: %.1fC", realFeel);

  display.setCursor(0, 48);
  display.printf("Risk: %s", riskLevelToString(calculateRiskLevel()).c_str());

  display.display();
}

void displayScreen2() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);

  display.setCursor(0, 0);
  display.println(" Env Status");

  display.setCursor(0, 12);
  display.printf("Gas: %d %s", gasVal, statusToString(gasStatus).c_str());

  display.setCursor(0, 24);
  display.printf("Crowd: %dcm %s", distance, statusToString(crowdStatus).c_str());

  display.setCursor(0, 36);
  display.printf("Risk: %s", riskLevelToString(calculateRiskLevel()).c_str());

  display.display();
}

void displayGraphScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);

  display.setCursor(0, 0);
  display.println(" Graphs");

  drawBarGraph(0, 15, map(temp, 0, 50, 0, 80), "T");
  drawBarGraph(0, 25, map(hum, 70, 85, 0, 80), "H");
  drawBarGraph(0, 35, map(realFeel, 0, 60, 0, 80), "R");
  drawBarGraph(0, 45, map(gasVal, 0, 4095, 0, 80), "G");
  drawBarGraph(0, 55, map(distance, 0, 200, 0, 80), "D");

  display.display();
}

void displayHealthTips() {
  String tip = healthTips[currentTipIndex];
  // Personalize tip based on Risk Level and worker profile
  RiskLevel riskLevel = calculateRiskLevel();
  if (riskLevel == RISK_HIGH) {
    if (lastWorkerAge > 50) {
      tip = "Seek shade, rest immediately.";
    } else if (lastWorkerRole.equalsIgnoreCase("Engineer")) {
      tip = "Stop work, check cooling systems.";
    } else if (lastWorkerRole.equalsIgnoreCase("Supervisor")) {
      tip = "Evacuate team, ensure safety.";
    } else {
      tip = "Move to cooler area now.";
    }
  } else if (riskLevel == RISK_MODERATE) {
    if (lastWorkerAge > 50) {
      tip = "Monitor health, take frequent breaks.";
    } else if (lastWorkerRole.equalsIgnoreCase("Engineer")) {
      tip = "Wear light clothing, check vents.";
    } else if (lastWorkerRole.equalsIgnoreCase("Supervisor")) {
      tip = "Ensure team takes breaks.";
    } else {
      tip = "Stay alert, hydrate often.";
    }
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  display.println("💡 Health Tip");
  display.setCursor(0, 12);
  // Wrap text manually for 128x64 OLED
  int maxCharsPerLine = 21; // Approx 21 chars at textSize 1
  String line = "";
  for (int i = 0; i < tip.length(); i++) {
    line += tip[i];
    if (line.length() >= maxCharsPerLine || i == tip.length() - 1) {
      display.println(line);
      line = "";
    }
  }
  display.display();
}

void drawBarGraph(int x, int y, int widthPercent, String label) {
  display.setCursor(x, y - 8);
  display.print(label);
  display.drawRect(x + 20, y - 5, 80, 8, WHITE);
  display.fillRect(x + 20, y - 5, widthPercent, 8, WHITE);
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

    // Check risk profile
    bool profileFound = false;
    for (int i = 0; i < profileCount; i++) {
      if (riskProfiles[i].uid == uid) {
        currentRiskProfile = riskProfiles[i];
        profileFound = true;
        Serial.println(timeStamp() + " [PROFILE] Applied: " + currentRiskProfile.name);
        break;
      }
    }
    if (!profileFound) {
      currentRiskProfile = {"", "Default", 35.0, 3000, true};
    }

    bool found = false;
    for (int i = 0; i < workerCount; i++) {
      if (workers[i].uid == uid) {
        lastWorkerName = workers[i].name;
        lastWorkerRole = workers[i].role;
        lastWorkerAge = workers[i].age;
        lastWorkerWorkingLevel = workers[i].workingLevel;

        Serial.println(timeStamp() + " [FOUND] " + workers[i].name + " (" + workers[i].role + ")");
        Serial.printf("Age: %d, Working Level: %s\n", lastWorkerAge, workingLevelToString(lastWorkerWorkingLevel).c_str());
        showWelcomeScreen(lastWorkerName, lastWorkerRole, lastWorkerAge, lastWorkerWorkingLevel);

        found = true;
        break;
      }
    }

    if (!found) {
      enrollNewCard(uid);
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }
}

void checkSerialEnrollment() {
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    if (command.equalsIgnoreCase("ENROLL")) {
      Serial.println(timeStamp() + " [ENROLL] Waiting for RFID card scan...");
      unsigned long startTime = millis();
      while (millis() - startTime < 30000) {
        if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
          String uid = "";
          for (byte i = 0; i < rfid.uid.size; i++) {
            uid += String(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
            uid += String(rfid.uid.uidByte[i], HEX);
          }
          uid.toUpperCase();
          enrollNewCard(uid);
          rfid.PICC_HaltA();
          rfid.PCD_StopCrypto1();
          break;
        }
      }
    }
  }
}

void enrollNewCard(String uid) {
  for (int i = 0; i < workerCount; i++) {
    if (workers[i].uid == uid) {
      Serial.println(timeStamp() + " [ERROR] Card already registered!");
      return;
    }
  }

  Serial.println(timeStamp() + " [ENROLL] Enter worker name:");
  String newName = timedReadString();
  newName.trim();
  if (newName.length() == 0) {
    Serial.println(timeStamp() + " [ERROR] Invalid name!");
    return;
  }

  Serial.println(timeStamp() + " [ENROLL] Enter role (Engineer/Supervisor/Visitor):");
  String newRole = timedReadString();
  newRole.trim();
  if (!(newRole.equalsIgnoreCase("Engineer") || newRole.equalsIgnoreCase("Supervisor") || newRole.equalsIgnoreCase("Visitor"))) {
    Serial.println(timeStamp() + " [ERROR] Invalid role! Must be Engineer, Supervisor, or Visitor.");
    return;
  }

  Serial.println(timeStamp() + " [ENROLL] Enter age (18-65):");
  String ageStr = timedReadString();
  ageStr.trim();
  int newAge = ageStr.toInt();
  if (newAge < 18 || newAge > 65 || ageStr.length() == 0) {
    Serial.println(timeStamp() + " [ERROR] Invalid age! Must be 18-65.");
    return;
  }

  Serial.println(timeStamp() + " [ENROLL] Enter working level (Low/Medium/High):");
  String wlStr = timedReadString();
  wlStr.trim();
  WorkingLevel newWorkingLevel;
  if (wlStr.equalsIgnoreCase("Low")) {
    newWorkingLevel = WL_LOW;
  } else if (wlStr.equalsIgnoreCase("Medium")) {
    newWorkingLevel = WL_MEDIUM;
  } else if (wlStr.equalsIgnoreCase("High")) {
    newWorkingLevel = WL_HIGH;
  } else {
    Serial.println(timeStamp() + " [ERROR] Invalid working level! Must be Low, Medium, or High.");
    return;
  }

  workers[workerCount].uid = uid;
  workers[workerCount].name = newName;
  workers[workerCount].role = newRole;
  workers[workerCount].age = newAge;
  workers[workerCount].workingLevel = newWorkingLevel;
  workerCount++;

  saveWorkerToSD(uid, newName, newRole, newAge, newWorkingLevel);

  lastUID = uid;
  lastWorkerName = newName;
  lastWorkerRole = newRole;
  lastWorkerAge = newAge;
  lastWorkerWorkingLevel = newWorkingLevel;

  Serial.println(timeStamp() + " [REGISTERED] " + newName + " (" + newRole + ", Age: " + String(newAge) + ", Working Level: " + workingLevelToString(newWorkingLevel) + ") added successfully!");
  showWelcomeScreen(lastWorkerName, lastWorkerRole, lastWorkerAge, lastWorkerWorkingLevel);
}

void safetyMonitor() {
  String recommendations[5] = {"", "", "", "", ""};
  int recCount = 0;
  RiskLevel riskLevel = calculateRiskLevel();
  bool critical = (riskLevel == RISK_HIGH);
  bool warning = (riskLevel == RISK_MODERATE);
  String urgency = critical ? "URGENT: " : warning ? "CAUTION: " : "";
  String ageGroup = lastWorkerAge > 50 ? "Older" : lastWorkerAge > 30 ? "Middle" : "Young";

  // Personalized warnings based on Age, Role, Working Level
  if (tempStatus == CRITICAL) {
    if (ageGroup == "Older") {
      recommendations[recCount++] = urgency + "High temp! Rest in cool area now.";
    } else if (lastWorkerRole.equalsIgnoreCase("Engineer")) {
      recommendations[recCount++] = urgency + "High temp! Check cooling systems.";
    } else if (lastWorkerRole.equalsIgnoreCase("Supervisor")) {
      recommendations[recCount++] = urgency + "High temp! Ensure team cools down.";
    } else {
      recommendations[recCount++] = urgency + "High temp! Move to shaded area.";
    }
    if (lastWorkerWorkingLevel == WL_HIGH) {
      recommendations[recCount++] = urgency + "Critical temp! Evacuate if persists.";
    }
  } else if (tempStatus == WARNING) {
    if (ageGroup == "Young") {
      recommendations[recCount++] = urgency + "Rising temp! Stay hydrated.";
    } else if (lastWorkerRole.equalsIgnoreCase("Engineer")) {
      recommendations[recCount++] = urgency + "Rising temp! Monitor equipment.";
    } else {
      recommendations[recCount++] = urgency + "Rising temp! Take frequent breaks.";
    }
  }

  if (humStatus == CRITICAL) {
    if (ageGroup == "Older") {
      recommendations[recCount++] = urgency + "High humidity! Seek dry area.";
    } else if (lastWorkerRole.equalsIgnoreCase("Engineer")) {
      recommendations[recCount++] = urgency + "High humidity! Increase ventilation.";
    } else if (lastWorkerRole.equalsIgnoreCase("Supervisor")) {
      recommendations[recCount++] = urgency + "High humidity! Ensure vents are open.";
    } else {
      recommendations[recCount++] = urgency + "High humidity! Avoid exertion.";
    }
    if (lastWorkerWorkingLevel == WL_HIGH) {
      recommendations[recCount++] = urgency + "Critical humidity! Relocate if needed.";
    }
  } else if (humStatus == WARNING) {
    recommendations[recCount++] = urgency + "Elevated humidity! " + (lastWorkerWorkingLevel == WL_LOW ? "Monitor comfort." : "Check ventilation.");
  }

  if (realFeelStatus == CRITICAL) {
    if (ageGroup == "Older") {
      recommendations[recCount++] = urgency + "Extreme heat index! Rest immediately.";
    } else if (lastWorkerRole.equalsIgnoreCase("Engineer")) {
      recommendations[recCount++] = urgency + "Extreme heat index! Use cooling fans.";
    } else if (lastWorkerRole.equalsIgnoreCase("Supervisor")) {
      recommendations[recCount++] = urgency + "Extreme heat index! Limit team work.";
    } else {
      recommendations[recCount++] = urgency + "Extreme heat index! Find shade.";
    }
    if (lastWorkerWorkingLevel == WL_HIGH) {
      recommendations[recCount++] = urgency + "Critical heat index! Stop work.";
    }
  } else if (realFeelStatus == WARNING) {
    recommendations[recCount++] = urgency + "High heat index! " + (lastWorkerWorkingLevel == WL_LOW ? "Rest periodically." : "Wear light clothing.");
  }

  if (gasStatus == CRITICAL) {
    if (ageGroup == "Older") {
      recommendations[recCount++] = urgency + "Dangerous gas! Leave area now.";
    } else if (lastWorkerRole.equalsIgnoreCase("Engineer")) {
      recommendations[recCount++] = urgency + "Dangerous gas! Ventilate immediately.";
    } else if (lastWorkerRole.equalsIgnoreCase("Supervisor")) {
      recommendations[recCount++] = urgency + "Dangerous gas! Evacuate team.";
    } else {
      recommendations[recCount++] = urgency + "Dangerous gas! Move to fresh air.";
    }
    if (lastWorkerWorkingLevel == WL_HIGH) {
      recommendations[recCount++] = urgency + "Critical gas levels! Evacuate now.";
    }
  } else if (gasStatus == WARNING) {
    recommendations[recCount++] = urgency + "Elevated gas! " + (lastWorkerWorkingLevel == WL_LOW ? "Avoid prolonged exposure." : "Open windows.");
  }

  if (crowdStatus == CRITICAL) {
    if (ageGroup == "Older") {
      recommendations[recCount++] = urgency + "Overcrowded! Move to open space.";
    } else if (lastWorkerRole.equalsIgnoreCase("Engineer")) {
      recommendations[recCount++] = urgency + "Overcrowded! Clear work area.";
    } else if (lastWorkerRole.equalsIgnoreCase("Supervisor")) {
      recommendations[recCount++] = urgency + "Overcrowded! Disperse team.";
    } else {
      recommendations[recCount++] = urgency + "Overcrowded! Maintain distance.";
    }
    if (lastWorkerWorkingLevel == WL_HIGH) {
      recommendations[recCount++] = urgency + "Critical crowd! Disperse immediately.";
    }
  } else if (crowdStatus == WARNING) {
    recommendations[recCount++] = urgency + "Dense crowd! " + (lastWorkerWorkingLevel == WL_LOW ? "Be cautious." : "Limit occupancy.");
  }

  // Log recommendations
  if (recCount > 0) {
    Serial.println(timeStamp() + " [SAFETY ADVICE]");
    for (int i = 0; i < recCount; i++) {
      Serial.printf("**%d.** %s\n", i + 1, recommendations[i].c_str());
    }
  }

  if (critical && currentRiskProfile.buzzerEnabled && (millis() - lastCriticalAlertTime > 10000)) {
    digitalWrite(BUZZER_PIN, HIGH);
    Serial.println(timeStamp() + " [CRITICAL ALERT] Address these issues immediately!");
    lastCriticalAlertTime = millis();
  } else if (warning && (millis() - lastCriticalAlertTime > 10000)) {
    Serial.println(timeStamp() + " [WARNING] Take preventive actions.");
    lastCriticalAlertTime = millis();
  } else {
    digitalWrite(BUZZER_PIN, LOW);
    if (recCount == 0) {
      Serial.println(timeStamp() + " [SAFE] Environment stable.");
    }
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
  ThingSpeak.setField(8, realFeel);

  int x = ThingSpeak.writeFields(myChannelNumber, myWriteAPIKey);
  if (x == 200) {
    Serial.println(timeStamp() + " [ThingSpeak] Update successful.");
  } else {
    Serial.println(timeStamp() + " [ThingSpeak] Error code: " + String(x));
  }
}

void showWelcomeScreen(String name, String role, int age, WorkingLevel wl) {
  showingWelcomeScreen = true;
  welcomeScreenStartTime = millis();

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  display.println(" Welcome!");
  display.setCursor(0, 12);
  display.println(name);
  display.setCursor(0, 24);
  display.println(role);
  display.setCursor(0, 36);
  display.printf("Age: %d", age);
  display.setCursor(0, 48);
  display.printf("WL: %s", workingLevelToString(wl).c_str());
  display.display();
}

void saveWorkerToSD(String uid, String name, String role, int age, WorkingLevel wl) {
  File file = SD.open("/workers.txt", FILE_APPEND);
  if (!file) {
    Serial.println(timeStamp() + " [ERROR] Saving worker failed!");
    return;
  }
  file.println(uid + "," + name + "," + role + "," + String(age) + "," + workingLevelToString(wl));
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
    int comma1 = line.indexOf(',');
    int comma2 = line.indexOf(',', comma1 + 1);
    int comma3 = line.indexOf(',', comma2 + 1);
    int comma4 = line.indexOf(',', comma3 + 1);

    if (comma1 > 0 && comma2 > comma1 && comma3 > comma2 && comma4 > comma3) {
      workers[workerCount].uid = line.substring(0, comma1);
      workers[workerCount].name = line.substring(comma1 + 1, comma2);
      workers[workerCount].role = line.substring(comma2 + 1, comma3);
      workers[workerCount].age = line.substring(comma3 + 1, comma4).toInt();
      String wlStr = line.substring(comma4 + 1);
      if (wlStr.equalsIgnoreCase("Low")) {
        workers[workerCount].workingLevel = WL_LOW;
      } else if (wlStr.equalsIgnoreCase("Medium")) {
        workers[workerCount].workingLevel = WL_MEDIUM;
      } else if (wlStr.equalsIgnoreCase("High")) {
        workers[workerCount].workingLevel = WL_HIGH;
      } else {
        workers[workerCount].workingLevel = WL_LOW; // Default
      }
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