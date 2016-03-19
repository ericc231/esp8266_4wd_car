/*
   WebSocketServer_LEDcontrol.ino

    Created on: 26.11.2015

*/

#include <Arduino.h>

#include <ESP8266WiFi.h>
#include <ESP8266WiFiMulti.h>
#include <WebSocketsServer.h>
#include <ESP8266WebServer.h>
#include <ESP8266mDNS.h>
#include <Hash.h>
#include <Wire.h>
#include <SimpleTimer.h>
#define SLAVE_ADDR 0x31 // Slave address, should be changed for other slaves

#define USE_SERIAL Serial


ESP8266WiFiMulti WiFiMulti;

ESP8266WebServer server = ESP8266WebServer(80);
WebSocketsServer webSocket = WebSocketsServer(81);

SimpleTimer ttt;

int valueA0;
int valueA1;

void updateSlave2(uint8_t * payload) {
  //if (cmdUpdateMotor || cmdUpdateServoH || cmdUpdateServoV) {
  Wire.beginTransmission(SLAVE_ADDR);
  //  if (cmdUpdateMotor) {
  Wire.write(0x0C);

  Wire.write(payload[1]);
  Wire.write(payload[2]);
  Wire.write(payload[1]);
  Wire.write(payload[2]);

  Wire.write(payload[3]);
  Wire.write(payload[4]);
  Wire.write(payload[3]);
  Wire.write(payload[4]);
  //}
  if (Wire.endTransmission() != 0) {
    USE_SERIAL.println("Error");
  }
  //}
}

void updateWheel(uint8_t * payload) {
  Wire.beginTransmission(SLAVE_ADDR);
  Wire.write(0x0D);
  Wire.write(payload[1]);
  Wire.write(payload[2]);
  Wire.write(payload[3]);
  if (Wire.endTransmission() != 0) {
    USE_SERIAL.println("Error2");
  }
}

void readSensors() {
  int res = Wire.requestFrom(SLAVE_ADDR, 4);
  if (res)
  {
    valueA0 = Wire.read() << 8 | Wire.read();
    valueA1 = Wire.read() << 8 | Wire.read();
  }
  else
  {
    valueA0 = -1;
    valueA1 = -1;
  }
}

void sendSensors(uint8_t clientNum, uint8_t cmd)
{
  unsigned long uptime = millis();
  uptime = uptime / 1000;

  readSensors();

  int len = 8;
  int i = 0;
  uint8_t payload[len];
  int a = valueA0;
  int v = valueA1;
  payload[i++] = cmd;

  payload[i++] = uptime >> 16;
  payload[i++] = (uptime << 8) >> 16;
  payload[i++] = uptime & 255;

  payload[i++] = a >> 8;
  payload[i++] = a & 255;
  payload[i++] = v >> 8;
  payload[i++] = v & 255;

  webSocket.sendBIN(clientNum, payload, len);
}

void sendOk(uint8_t clientNum, uint8_t cmd)
{
  uint8_t payload[1];
  payload[0] = cmd;
  webSocket.sendBIN(clientNum, payload, 1);
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t lenght) {

  switch (type) {
    case WStype_DISCONNECTED:
      USE_SERIAL.printf("[%u] Disconnected!\n", num);
      break;
    case WStype_CONNECTED: {
        IPAddress ip = webSocket.remoteIP(num);
        USE_SERIAL.printf("[%u] Connected from %d.%d.%d.%d url: %s\n", num, ip[0], ip[1], ip[2], ip[3], payload);
        // send message to client
        webSocket.sendTXT(num, "Connected");
      }
      break;
    case WStype_BIN:
      // TODO err
      uint8_t cmd = payload[0];
      switch (cmd) {
        case 0x0A:
          sendOk(num, cmd);
          break;
        case 0x0B:
          sendSensors(num, cmd);
          break;
        case 0x0C:
          updateSlave2(payload);
          sendOk(num, cmd);
          break;
        case 0x0D:
          updateWheel(payload);
          sendOk(num, cmd);
          break;
      }
      break;
  }

}

void setup() {
  //USE_SERIAL.begin(921600);
  USE_SERIAL.begin(115200);

  //USE_SERIAL.setDebugOutput(true);

  USE_SERIAL.println();
  USE_SERIAL.println();
  USE_SERIAL.println();

  for (uint8_t t = 4; t > 0; t--) {
    USE_SERIAL.printf("[SETUP] BOOT WAIT %d...\n", t);
    USE_SERIAL.flush();
    delay(1000);
  }

  Wire.begin();

  WiFiMulti.addAP("paradise2", "wifi12345!");

  while (WiFiMulti.run() != WL_CONNECTED) {
    delay(100);
  }

  // start webSocket server
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);

  if (MDNS.begin("esp8266")) {
    USE_SERIAL.println("MDNS responder started");
  }

  // handle index
  server.on("/", []() {
    // send index.html
    server.send(200, "text/html", "<html><head><script>var connection = new WebSocket('ws://'+location.hostname+':81/', ['arduino']);connection.onopen = function () {  connection.send('Connect ' + new Date()); }; connection.onerror = function (error) {    console.log('WebSocket Error ', error);};connection.onmessage = function (e) {  console.log('Server: ', e.data);};function sendRGB() {  var r = parseInt(document.getElementById('r').value).toString(16);  var g = parseInt(document.getElementById('g').value).toString(16);  var b = parseInt(document.getElementById('b').value).toString(16);  if(r.length < 2) { r = '0' + r; }   if(g.length < 2) { g = '0' + g; }   if(b.length < 2) { b = '0' + b; }   var rgb = '#'+r+g+b;    console.log('RGB: ' + rgb); connection.send(rgb); }</script></head><body>LED Control:<br/><br/>R: <input id=\"r\" type=\"range\" min=\"0\" max=\"255\" step=\"1\" onchange=\"sendRGB();\" /><br/>G: <input id=\"g\" type=\"range\" min=\"0\" max=\"255\" step=\"1\" onchange=\"sendRGB();\" /><br/>B: <input id=\"b\" type=\"range\" min=\"0\" max=\"255\" step=\"1\" onchange=\"sendRGB();\" /><br/></body></html>");
  });

  server.begin();

  // Add service to MDNS
  MDNS.addService("http", "tcp", 80);
  MDNS.addService("ws", "tcp", 81);

  //    ttt.setInterval(1000L, zzzzz);
}


void loop() {
  webSocket.loop();
  server.handleClient();
//  ttt.run();
}

