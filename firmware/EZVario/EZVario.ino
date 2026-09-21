#include <Arduino_BHY2.h>
#include <ArduinoBLE.h>
#include "Telemetry.h"

// One compact characteristic. Web Bluetooth/Bluefy starts the stream by
// subscribing, so no proprietary start command or MTU write is required.
BLEService service("a6e90001-7a25-4b48-9c6d-4f5b108a0001");
BLECharacteristic stream("a6e90002-7a25-4b48-9c6d-4f5b108a0001",
                         BLERead | BLENotify, ez::PACKET_SIZE, true);
SensorXYZ acc(SENSOR_ID_ACC), linear(SENSOR_ID_LACC), gyro(SENSOR_ID_GYRO), mag(SENSOR_ID_MAG);
SensorQuaternion rotation(SENSOR_ID_RV);
Sensor pressure(SENSOR_ID_BARO), temperature(SENSOR_ID_TEMP), humidity(SENSOR_ID_HUM), gas(SENSOR_ID_GAS);
SensorBSEC bsec(SENSOR_ID_BSEC);
SensorClass* sensors[] = {&acc,&linear,&gyro,&mag,&rotation,&pressure,&temperature,&humidity,&gas,&bsec};
const float rates[] = {50,50,50,50,50,25,1,1,1,1};
const uint32_t staleMs[] = {200,200,200,500,200,500,5000,5000,15000,15000};
uint32_t updated[10]={}, sequence=0, nextSend=0;
uint16_t present=0, seen=0, fresh=0;
float accScale=NAN, linearScale=NAN, gyroScale=NAN, magScale=NAN;
ez::Vec scaled(SensorXYZ& s, float k) { return {s.x()*k,s.y()*k,s.z()*k}; }
void putVec(float* v, ez::Vec a) { v[0]=a.x; v[1]=a.y; v[2]=a.z; }
bool recent(uint16_t valid, int i) { return valid & (1u<<i); }
bool aligned(int i) { return abs((int32_t)(updated[i]-updated[4])) <= 25; }

void setup() {
  Serial.begin(115200); // No wait for USB: works from battery.
  if (!BHY2.begin(NICLA_STANDALONE)) {
    Serial.println("BHY2 initialization failed"); while (true) delay(1000);
  }
  for (int i=0;i<10;++i) {
    if (sensors[i]->begin(rates[i],0)) present |= 1u<<i;
    else { Serial.print("Unavailable sensor ID: "); Serial.println(sensors[i]->id()); }
  }
  pressure.setFactor(1.f/128.f); // Exact BHY2 hPa scale (library rounds to 0.0078).
  // Use the actual configured full scale: raw XYZ accessors return signed counts.
  if (present&1) accScale=acc.getConfiguration().range * ez::G / 32768.f;
  if (present&2) linearScale=linear.getConfiguration().range * ez::G / 32768.f;
  if (present&4) gyroScale=gyro.getConfiguration().range / 32768.f;
  if (present&8) magScale=mag.getConfiguration().range / 32768.f;
  if (!(accScale>0)) accScale=NAN;
  if (!(linearScale>0)) linearScale=NAN;
  if (!(gyroScale>0)) gyroScale=NAN;
  if (!(magScale>0)) magScale=NAN;
  if (!BLE.begin()) { Serial.println("BLE initialization failed"); while(true) delay(1000); }
  BLE.setLocalName("EZ-Vario");
  BLE.setDeviceName("EZ-Vario Nicla");
  BLE.setAdvertisedService(service);
  service.addCharacteristic(stream); BLE.addService(service);
  BLE.setConnectionInterval(6,12); // Request 7.5–15 ms; phone has final say.
  uint8_t initial[ez::PACKET_SIZE];
  float emptyValues[26]; for (float& value : emptyValues) value=NAN;
  ez::encode(initial,0,millis(),present,0,0,emptyValues);
  stream.writeValue(initial,sizeof(initial));
  BLE.advertise();
  nextSend=millis()+20;
}

void loop() {
  BHY2.update(); BLE.poll();
  const uint32_t now=millis();
  for (int i=0;i<10;++i) {
    if (sensors[i]->dataAvailable()) {
      sensors[i]->clearDataAvailFlag(); updated[i]=now;
      seen |= 1u<<i; fresh |= 1u<<i;
    }
  }
  if ((int32_t)(now-nextSend)<0) return;
  const uint32_t ticks=1+(now-nextSend)/20;
  nextSend += ticks*20; sequence += ticks; // Expose missed deadlines, never burst old data.
  if (!BLE.connected() || !stream.subscribed()) return;
  uint16_t valid=0;
  for (int i=0;i<10;++i)
    // Temperature/humidity are on-change sensors: silence is not a stale sample.
    if ((seen&(1u<<i)) && (i==6 || i==7 || now-updated[i]<=staleMs[i])) valid |= 1u<<i;
  float v[26]; for (float& x:v) x=NAN;
  ez::Quat q{rotation.x(),rotation.y(),rotation.z(),rotation.w()};
  const float qn=q.x*q.x+q.y*q.y+q.z*q.z+q.w*q.w;
  if (!isfinite(qn) || qn<0.81f || qn>1.21f) valid &= ~(1u<<4);
  if (recent(valid,4)) {
    v[12]=q.x; v[13]=q.y; v[14]=q.z; v[15]=q.w;
    v[23]=rotation.accuracy();
  }
  if (recent(valid,0) && recent(valid,4) && aligned(0) && isfinite(accScale))
    putVec(v,ez::earth(scaled(acc,accScale),q));
  else valid &= ~1u;
  if (recent(valid,1) && recent(valid,4) && aligned(1) && isfinite(linearScale))
    putVec(v+3,ez::earth(scaled(linear,linearScale),q));
  else valid &= ~2u;
  if (recent(valid,2) && isfinite(gyroScale)) putVec(v+6,scaled(gyro,gyroScale));
  else valid &= ~4u;
  if (recent(valid,3) && isfinite(magScale)) putVec(v+9,scaled(mag,magScale));
  else valid &= ~8u;
  if (recent(valid,5)) { v[16]=pressure.value(); v[24]=ez::altitude(v[16]); }
  if (recent(valid,6)) v[17]=temperature.value();
  if (recent(valid,7)) v[18]=humidity.value();
  if (recent(valid,8)) v[19]=gas.value();
  if (recent(valid,9)) {
    v[20]=bsec.iaq(); v[21]=bsec.co2_eq(); v[22]=bsec.b_voc_eq(); v[25]=bsec.accuracy();
  }
  uint8_t packet[ez::PACKET_SIZE];
  ez::encode(packet,sequence,now,present,valid,fresh,v);
  if (stream.writeValue(packet,sizeof(packet))) fresh=0;
}

