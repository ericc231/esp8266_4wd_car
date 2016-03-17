/*
 */
#include <Servo.h>
#include <Wire.h>

#define SLAVE_ADDR 0x31 // Slave address, should be changed for other slaves
byte buf[20];

const int hServoPin = 9; // Servo library disables analogWrite() (PWM) functionality on pins 9 and 10 
const int vServoPin = 10; // Servo library disables analogWrite() (PWM) functionality on pins 9 and 10
Servo servoH;          // horizontal servo
Servo servoV;         // vertical servo
int volatile hServoVal;
int volatile vServoVal;
int volatile valueA0;
int volatile valueA1;
unsigned long previousTime = 0;
#define READ_PERIOD 50 // period in milliseconds between sensor read

boolean volatile cmdUpdateMotor = false;
boolean volatile cmdUpdateServoH = false;
boolean volatile cmdUpdateServoV = false;

//Pin connected to ST_CP of 74HC595
int latchPin = 7;
//Pin connected to SH_CP of 74HC595
int clockPin = 8;
////Pin connected to DS of 74HC595
int dataPin = 4;

int pwmPins[4]  = {3, 5, 6, 11};

uint8_t latch_state = 0;

int dir1Pins[4] = {0, 2, 5, 7};
int dir2Pins[4] = {1, 3, 4, 6};
byte dirs[4] = {3, 3, 3, 3};
int pwms[4] = {0, 0, 0, 0};

// motors end

void setup() {
//  Serial.begin(115200);
  
  Wire.begin(SLAVE_ADDR);
  Wire.onReceive(receiveEvent);
  Wire.onRequest(requestEvent);

  pinMode (A0, INPUT);
  pinMode (A1, INPUT);

  pinMode(latchPin, OUTPUT);
  pinMode(dataPin, OUTPUT);  
  pinMode(clockPin, OUTPUT);
  
  servoH.attach(hServoPin);
  servoV.attach(vServoPin);

  for (int ind = 0; ind < 4; ind++) {
    pinMode(pwmPins[ind], OUTPUT);
  }
 
}

void loop() {
  if (cmdUpdateMotor) {
    noInterrupts();
    cmdUpdateMotor = false;
    updateMotorShield();
    interrupts();
  }
  if (cmdUpdateServoH) {
    cmdUpdateServoH = false;
    updateServo(servoH, hServoVal);
  }
  if (cmdUpdateServoV) {
    cmdUpdateServoV = false;
    updateServo(servoV, vServoVal);
  }
  unsigned long currTime = millis();
  unsigned long timeDiff = currTime - previousTime;
  if (timeDiff >= READ_PERIOD) {
    readSensor();
//    Serial.print(valueA0);
//    Serial.print(" ");
//    Serial.println(valueA1);
  }  
}

void readSensor() {
  int a0 = analogRead(A0);
  int a1 = analogRead(A1);
  noInterrupts();
  valueA0 = a0;
  valueA1 = a1;
  interrupts();
}

void updateServo(Servo servo, int value) {
  servo.write(value);
}

void updateMotorShield() {
  for (int i = 0; i < 4; i++) {
    updateShiftRegister(dir1Pins[i], dir2Pins[i], dirs[i]);
  }
  
 digitalWrite(latchPin, LOW);
 shiftOut(dataPin, clockPin, MSBFIRST, latch_state);
 digitalWrite(latchPin, HIGH);
 
//TODO first
 analogWrite(pwmPins[0], pwms[0]);
 analogWrite(pwmPins[1], pwms[1]);
 analogWrite(pwmPins[2], pwms[2]);
 analogWrite(pwmPins[3], pwms[3]);
}

void updateShiftRegister(uint8_t a, uint8_t b, byte cmd) {
  switch (cmd) {
  case 1:
    latch_state |= _BV(a);
    latch_state &= ~_BV(b); 
    break;
  case 2:
    latch_state &= ~_BV(a);
    latch_state |= _BV(b); 
    break;
  case 3:
    latch_state &= ~_BV(a);     // A and B both low
    latch_state &= ~_BV(b); 
    break;
  }
  //TODO cmd 4
}

void receiveEvent(int bytesReceived)
{
  for (int a = 0; a < bytesReceived; a++)
  {
    buf[a] = Wire.read();
  }

  cmdUpdateMotor = false;
  cmdUpdateServoH = false;
  cmdUpdateServoV = false;

  int ind = 0;
  while (ind <= bytesReceived - 1) {
    switch(buf[ind]){
      case 0x0C:
        dirs[0] = buf[ind + 1];
        pwms[0] = buf[ind + 2];
        dirs[1] = buf[ind + 3];
        pwms[1] = buf[ind + 4];
        dirs[2] = buf[ind + 5];
        pwms[2] = buf[ind + 6];
        dirs[3] = buf[ind + 7];
        pwms[3] = buf[ind + 8];
        ind += 9;
        cmdUpdateMotor = true;
        break;
      case 0x0A:
        hServoVal = buf[ind + 1];
        ind += 2;
        cmdUpdateServoH = true;
        break;
      case 0x0B:
        vServoVal = buf[ind + 1];
        ind += 2;
        cmdUpdateServoV = true;
        break;
      default:
        return; // ignore the commands and return
     }    
  }
  
}

void requestEvent() {
  byte arr[4];
  arr[0] = valueA0 >> 8;
  arr[1] = valueA0 & 0xFF;
  arr[2] = valueA1 >> 8;
  arr[3] = valueA1 & 0xFF;
  Wire.write(arr, 4);
}
