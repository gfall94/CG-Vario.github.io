#include <Arduino_BHY2.h>
#include <ArduinoBLE.h>
#include "Telemetry.h"
#include "Control.h"
#include "VarioTone.h"
#include "SettingsStore.h"

// One compact characteristic. Web Bluetooth/Bluefy starts the stream by
// subscribing, so no proprietary start command or MTU write is required.
BLEService service("a6e90001-7a25-4b48-9c6d-4f5b108a0001");
BLECharacteristic stream("a6e90002-7a25-4b48-9c6d-4f5b108a0001",
                         BLERead | BLENotify, ez::PACKET_SIZE, true);
BLECharacteristic control("a6e90003-7a25-4b48-9c6d-4f5b108a0001",
                          BLERead | BLEWrite | BLENotify, ez::CONTROL_SIZE, true);
ez::Vario vario;
ez::VarioTone varioTone;
ez::SettingsStore settingsStore;
uint16_t settingsRevision=0;
float zeroHeight=NAN, maxClimb=NAN, maxSink=NAN, maxAltitude=NAN;
bool flying=false;
uint32_t flightStart=0, flightDuration=0;
void replySettings(uint16_t request=0,uint8_t result=0) {
  uint8_t b[ez::CONTROL_SIZE];ez::encodeSettings(b,vario.settings,request,settingsRevision,result);control.writeValue(b,sizeof(b));
}
void commands(uint32_t now) {
  if(!control.written())return;
  uint8_t b[ez::CONTROL_SIZE];
  const int n=control.readValue(b,sizeof(b));
  if(n!=ez::CONTROL_SIZE || b[0]!='E'||b[1]!='C'||b[2]!=2){replySettings(0,1);return;}
  const uint16_t request=ez::read16(b+4);
  bool ok=true;
  uint8_t result=0;
  ez::Settings candidate=vario.settings;
  switch(b[3]) {
    case 0: result=ez::persistSettings(vario,ez::readSettings(b),settingsStore);break;
    case 1: ok=vario.ready;if(ok)zeroHeight=vario.height;break;
    case 2: ok=vario.ready&&!flying;if(ok){flying=true;flightStart=now;flightDuration=0;zeroHeight=vario.height;maxClimb=maxSink=0;maxAltitude=NAN;}break;
    case 3: if(flying){flightDuration=now-flightStart;flying=false;}break;
    case 4: result=ez::persistSettings(vario,ez::Settings{},settingsStore);break;
    case 5: case 6: case 7:
      candidate=ez::profile(b[3]-5,vario.settings.qnh);candidate.audio=vario.settings.audio;
      result=ez::persistSettings(vario,candidate,settingsStore);break;
    default: ok=false;
  }
  if(!ok)result=1;
  if(result==0)settingsRevision++;
  replySettings(request,result);
}
// Gravity, linear acceleration and rotation vector are fused virtual sensors
// calculated on the BHI260AP. Both acceleration vectors are rotated into the
// earth-fixed ENU frame with the fused quaternion before transmission.
SensorXYZ gravity(SENSOR_ID_GRA), linear(SENSOR_ID_LACC), gyro(SENSOR_ID_GYRO), mag(SENSOR_ID_MAG);
SensorQuaternion rotation(SENSOR_ID_RV);
Sensor pressure(SENSOR_ID_BARO), temperature(SENSOR_ID_TEMP), humidity(SENSOR_ID_HUM), gas(SENSOR_ID_GAS);
SensorBSEC bsec(SENSOR_ID_BSEC);
SensorClass* sensors[] = {&gravity,&linear,&gyro,&mag,&rotation,&pressure,&temperature,&humidity,&gas,&bsec};
const float rates[] = {50,50,50,50,50,25,1,1,1,1};
const uint32_t staleMs[] = {200,200,200,500,200,500,5000,5000,15000,15000};
uint32_t updated[10]={}, sequence=0, nextSend=0;
uint16_t present=0, seen=0, fresh=0;
float gravityScale=NAN, linearScale=NAN, gyroScale=NAN, magScale=NAN;
ez::Vec scaled(SensorXYZ& s, float k) { return {s.x()*k,s.y()*k,s.z()*k}; }
void putVec(float* v, ez::Vec a) { v[0]=a.x; v[1]=a.y; v[2]=a.z; }
bool recent(uint16_t valid, int i) { return valid & (1u<<i); }
bool aligned(int i) { return abs((int32_t)(updated[i]-updated[4])) <= 25; }

void setup() {
  Serial.begin(115200); // No wait for USB: works from battery.
  // Cordio requires one contiguous 13 kB heap block. Reserve it before any
  // sensor or persistence subsystem can allocate or fragment the small heap.
  if (!BLE.begin()) { Serial.println("BLE initialization failed"); while(true) delay(1000); }
  if(!settingsStore.begin(vario.settings))Serial.println("Settings storage unavailable; changes will be rejected");
  if (!BHY2.begin(NICLA_STANDALONE)) {
    Serial.println("BHY2 initialization failed"); while (true) delay(1000);
  }
  for (int i=0;i<10;++i) {
    if (sensors[i]->begin(rates[i],0)) present |= 1u<<i;
    else { Serial.print("Unavailable sensor ID: "); Serial.println(sensors[i]->id()); }
  }
  pressure.setFactor(1.f/128.f); // Exact BHY2 hPa scale (library rounds to 0.0078).
  // Use the actual configured full scale: raw XYZ accessors return signed counts.
  if (present&1) gravityScale=gravity.getConfiguration().range * ez::G / 32768.f;
  if (present&2) linearScale=linear.getConfiguration().range * ez::G / 32768.f;
  if (present&4) gyroScale=gyro.getConfiguration().range / 32768.f;
  if (present&8) magScale=mag.getConfiguration().range / 32768.f;
  if (!(gravityScale>0)) gravityScale=NAN;
  if (!(linearScale>0)) linearScale=NAN;
  if (!(gyroScale>0)) gyroScale=NAN;
  if (!(magScale>0)) magScale=NAN;
  BLE.setLocalName("EZ-Vario");
  BLE.setDeviceName("EZ-Vario Nicla");
  BLE.setAdvertisedService(service);
  service.addCharacteristic(stream); service.addCharacteristic(control); BLE.addService(service);
  // Apple-compatible request: units are 1.25 ms and 10 ms respectively.
  // 7.5–15 ms was outside Apple's rules and caused iOS supervision timeouts.
  BLE.setConnectionInterval(12,24); // 15–30 ms; still supports the 50 Hz stream.
  BLE.setSupervisionTimeout(600);   // 6 s, valid for iOS and the interval above.
  uint8_t initial[ez::PACKET_SIZE];
  float emptyValues[ez::VALUE_COUNT]; for (float& value : emptyValues) value=NAN;
  ez::encode(initial,0,millis(),present,0,0,emptyValues);
  stream.writeValue(initial,sizeof(initial));
  replySettings();
  BLE.advertise();
  nextSend=millis()+20;
}

void loop() {
  BHY2.update(); BLE.poll();
  const uint32_t now=millis();
  commands(now);
  for (int i=0;i<10;++i) {
    if (sensors[i]->dataAvailable()) {
      sensors[i]->clearDataAvailFlag(); updated[i]=now;
      seen |= 1u<<i; fresh |= 1u<<i;
    }
  }
  if ((int32_t)(now-nextSend)<0) return;
  const uint32_t ticks=1+(now-nextSend)/20;
  nextSend += ticks*20; sequence += ticks; // Expose missed deadlines, never burst old data.
  uint16_t valid=0;
  for (int i=0;i<10;++i)
    // Temperature/humidity are on-change sensors: silence is not a stale sample.
    if ((seen&(1u<<i)) && (i==6 || i==7 || now-updated[i]<=staleMs[i])) valid |= 1u<<i;
  float v[ez::VALUE_COUNT]; for (float& x:v) x=NAN;
  ez::Quat q{rotation.x(),rotation.y(),rotation.z(),rotation.w()};
  const float qn=q.x*q.x+q.y*q.y+q.z*q.z+q.w*q.w;
  if (!isfinite(qn) || qn<0.81f || qn>1.21f) valid &= ~(1u<<4);
  if (recent(valid,4)) {
    v[12]=q.x; v[13]=q.y; v[14]=q.z; v[15]=q.w;
    v[23]=rotation.accuracy();
  }
  const bool gravityOk=recent(valid,0) && recent(valid,4) && aligned(0) && isfinite(gravityScale);
  const bool linearOk=recent(valid,1) && recent(valid,4) && aligned(1) && isfinite(linearScale);
  const ez::Vec gravityEarth=gravityOk ? ez::earth(scaled(gravity,gravityScale),q) : ez::Vec{NAN,NAN,NAN};
  const ez::Vec linearEarth=linearOk ? ez::earth(scaled(linear,linearScale),q) : ez::Vec{NAN,NAN,NAN};
  if (linearOk) putVec(v+3,linearEarth); else valid &= ~2u;
  if (gravityOk && linearOk) {
    // Fused total acceleration: a = linear acceleration + gravity.
    putVec(v,{linearEarth.x+gravityEarth.x,
              linearEarth.y+gravityEarth.y,
              linearEarth.z+gravityEarth.z});
  } else valid &= ~1u;
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
  // Estimation runs even when no phone is connected. Fresh pressure is consumed
  // exactly once; a held IMU sample is used only for at most 80 ms.
  vario.update(now,v[24],(fresh&32)&&recent(valid,5),v[5],linearOk && now-updated[1]<=80);
  uint16_t status=(vario.ready?1:0)|(vario.fused?2:0)|(flying?4:0);
  if(vario.ready) {
    if(!isfinite(zeroHeight))zeroHeight=vario.height;
    v[26]=vario.speed;v[27]=vario.average;
    // QNH affects altitude only, never the estimator's velocity state.
    const double p=1013.25*pow(1-(double)vario.height/44330.0,1/0.19029495);
    v[28]=ez::altitude((float)p,vario.settings.qnh);v[29]=vario.height-zeroHeight;
    if(flying){maxClimb=fmaxf(maxClimb,v[26]);maxSink=fminf(maxSink,v[26]);maxAltitude=isfinite(maxAltitude)?fmaxf(maxAltitude,v[28]):v[28];}
  }
  v[30]=maxClimb;v[31]=maxSink;v[32]=maxAltitude;
  v[33]=(flying?now-flightStart:flightDuration)*.001f;v[34]=vario.bias;v[35]=vario.sigma;
  varioTone.update(vario.speed,vario.ready,vario.settings.audio);
  v[36]=varioTone.hz;v[37]=varioTone.period;v[38]=varioTone.on;
  uint8_t packet[ez::PACKET_SIZE];
  ez::encode(packet,sequence,now,present,valid,fresh,v,status);
  fresh=0;
  if (BLE.connected() && stream.subscribed())stream.writeValue(packet,sizeof(packet));
}
