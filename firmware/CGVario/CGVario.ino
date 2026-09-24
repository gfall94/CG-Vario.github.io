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
float latestPressureHpa=NAN;
uint32_t latestPressureAt=0;
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
    case 8: {
      const float referenceHeight=ez::readFloat(b+8);
      ok=isfinite(referenceHeight)&&referenceHeight>=-500&&referenceHeight<=9000&&
         isfinite(latestPressureHpa)&&latestPressureHpa>0&&now-latestPressureAt<=1500;
      if(ok){
        candidate.qnh=ez::qnhForAltitude(latestPressureHpa,referenceHeight);
        result=ez::persistSettings(vario,candidate,settingsStore);
      }
      break;
    }
    default: ok=false;
  }
  if(!ok)result=1;
  if(result==0)settingsRevision++;
  replySettings(request,result);
}
// Gravity, linear acceleration and rotation vector are fused virtual sensors
// calculated on the BHI260AP. Both acceleration vectors are rotated into the
// earth-fixed ENU frame with the fused quaternion. Only total acceleration and
// its magnitude are transmitted; fusion internals stay on the microcontroller.
SensorXYZ gravity(SENSOR_ID_GRA), linear(SENSOR_ID_LACC), gyro(SENSOR_ID_GYRO), mag(SENSOR_ID_MAG);
SensorQuaternion rotation(SENSOR_ID_RV);
Sensor pressure(SENSOR_ID_BARO), temperature(SENSOR_ID_TEMP), humidity(SENSOR_ID_HUM), gas(SENSOR_ID_GAS);
SensorBSEC bsec(SENSOR_ID_BSEC);
SensorClass* sensors[] = {&gravity,&linear,&gyro,&mag,&rotation,&pressure,&temperature,&humidity,&gas,&bsec};
const float rates[] = {50,50,50,50,50,25,1,1,1,1};
const uint32_t staleMs[] = {200,200,200,500,200,500,5000,5000,15000,15000};
uint32_t updated[10]={}, sequence=0, nextSend=0, nextScaleRead=0;
uint16_t present=0, seen=0, fresh=0;
float gravityScale=NAN, linearScale=NAN, gyroScale=NAN, magScale=NAN;
ez::Vec scaled(SensorXYZ& s, float k) { return {s.x()*k,s.y()*k,s.z()*k}; }
void putVec(float* v, ez::Vec a) { v[0]=a.x; v[1]=a.y; v[2]=a.z; }
bool recent(uint16_t valid, int i) { return valid & (1u<<i); }
// Virtual sensors arrive as separate FIFO records. A 60 ms window covers their
// scheduling skew at 50 Hz without accepting an old orientation indefinitely.
bool aligned(int i) { return abs((int32_t)(updated[i]-updated[4])) <= 60; }
void refreshScales(uint32_t now) {
  if ((int32_t)(now-nextScaleRead)<0) return;
  nextScaleRead=now+1000;
  if ((present&1) && !isfinite(gravityScale)) {
    const uint16_t range=gravity.getConfiguration().range;
    if (range==2 || range==4 || range==8 || range==16) gravityScale=range*ez::G/32768.f;
  }
  if ((present&2) && !isfinite(linearScale)) {
    const uint16_t range=linear.getConfiguration().range;
    if (range==2 || range==4 || range==8 || range==16) linearScale=range*ez::G/32768.f;
  }
  if ((present&4) && !isfinite(gyroScale)) {
    const uint16_t range=gyro.getConfiguration().range;
    if (range>=125 && range<=4000) gyroScale=range/32768.f;
  }
  if ((present&8) && !isfinite(magScale)) {
    const uint16_t range=mag.getConfiguration().range;
    if (range>0) magScale=range/32768.f;
  }
}

void setup() {
  Serial.begin(115200); // No wait for USB: works from battery.
  // Initialize the Nicla/BHI hardware before Cordio. BHY2.begin() changes the
  // board's hardware state; doing that after BLE startup can stop radio events
  // and make the central disconnect with HCI reason 0x08.
  if (!BHY2.begin(NICLA_STANDALONE)) {
    Serial.println("BHY2 initialization failed"); while (true) delay(1000);
  }
  // Cordio needs a contiguous 13 kB heap block. Claim it before configuring
  // the individual virtual sensors; persistence itself is allocation-free.
  if (!BLE.begin()) { Serial.println("BLE initialization failed"); while(true) delay(1000); }
  if(!settingsStore.begin(vario.settings))Serial.println("Settings storage unavailable; changes will be rejected");
  for (int i=0;i<10;++i) {
    if (sensors[i]->begin(rates[i],0)) present |= 1u<<i;
    else { Serial.print("Unavailable sensor ID: "); Serial.println(sensors[i]->id()); }
  }
  pressure.setFactor(1.f/128.f); // Exact BHY2 hPa scale (library rounds to 0.0078).
  // BHI260 applies virtual-sensor configuration asynchronously. Its range is
  // therefore read later in loop(); an immediate read often returns zero.
  BLE.setLocalName("CG-Vario");
  BLE.setDeviceName("CG-Vario Nicla");
  BLE.setAdvertisedService(service);
  service.addCharacteristic(stream); service.addCharacteristic(control); BLE.addService(service);
  // The iPhone is the BLE central and chooses the link parameters. Do not send
  // a peripheral update request during discovery; this also matches Arduino's
  // official Nicla Sense ME BLE example.
  uint8_t initial[ez::PACKET_SIZE];
  float emptyValues[ez::VALUE_COUNT]; for (float& value : emptyValues) value=NAN;
  ez::encode(initial,0,millis(),present,0,0,emptyValues);
  stream.writeValue(initial,sizeof(initial));
  replySettings();
  BLE.advertise();
  nextSend=millis()+20;
  nextScaleRead=millis()+1000;
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
  refreshScales(now);
  if ((fresh&32) && recent(seen,5)) { latestPressureHpa=pressure.value(); latestPressureAt=now; }
  commands(now);
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
  if (recent(valid,4)) v[ez::HEADING_ERROR]=rotation.accuracy();
  const bool gravityOk=recent(valid,0) && recent(valid,4) && aligned(0) && isfinite(gravityScale);
  const bool linearOk=recent(valid,1) && recent(valid,4) && aligned(1) && isfinite(linearScale);
  const ez::Vec gravityEarth=gravityOk ? ez::earth(scaled(gravity,gravityScale),q) : ez::Vec{NAN,NAN,NAN};
  const ez::Vec linearEarth=linearOk ? ez::earth(scaled(linear,linearScale),q) : ez::Vec{NAN,NAN,NAN};
  if (!linearOk) valid &= ~2u;
  if (gravityOk && linearOk) {
    // Fused total acceleration: a = linear acceleration + gravity.
    const ez::Vec total{linearEarth.x+gravityEarth.x,
                        linearEarth.y+gravityEarth.y,
                        linearEarth.z+gravityEarth.z};
    putVec(v+ez::ACC_E,total);
    v[ez::G_FORCE]=sqrtf(total.x*total.x+total.y*total.y+total.z*total.z)/ez::G;
  } else valid &= ~1u;
  if (!recent(valid,2) || !isfinite(gyroScale)) valid &= ~4u;
  if (recent(valid,3) && isfinite(magScale)) putVec(v+ez::MAG_X,scaled(mag,magScale));
  else valid &= ~8u;
  if (recent(valid,5)) { v[ez::PRESSURE]=pressure.value(); v[ez::STANDARD_ALTITUDE]=ez::altitude(v[ez::PRESSURE]); }
  if (recent(valid,6)) v[ez::TEMPERATURE]=temperature.value();
  if (recent(valid,7)) v[ez::HUMIDITY]=humidity.value();
  if (recent(valid,8)) v[ez::GAS]=gas.value();
  if (recent(valid,9)) {
    v[ez::IAQ]=bsec.iaq(); v[ez::ECO2]=bsec.co2_eq(); v[ez::BVOC]=bsec.b_voc_eq(); v[ez::BSEC_ACCURACY]=bsec.accuracy();
  }
  // Estimation runs even when no phone is connected. Fresh pressure is consumed
  // exactly once; a held IMU sample is used only for at most 80 ms.
  vario.update(now,v[ez::STANDARD_ALTITUDE],(fresh&32)&&recent(valid,5),linearEarth.z,linearOk && now-updated[1]<=80);
  uint16_t status=(vario.ready?1:0)|(vario.fused?2:0)|(flying?4:0);
  if(vario.ready) {
    if(!isfinite(zeroHeight))zeroHeight=vario.height;
    v[ez::VARIO]=vario.speed;v[ez::AVERAGE]=vario.average;
    // QNH affects altitude only, never the estimator's velocity state.
    const double p=1013.25*pow(1-(double)vario.height/44330.0,1/0.19029495);
    v[ez::ALTITUDE]=ez::altitude((float)p,vario.settings.qnh);v[ez::RELATIVE_ALTITUDE]=vario.height-zeroHeight;
    if(flying){maxClimb=fmaxf(maxClimb,v[ez::VARIO]);maxSink=fminf(maxSink,v[ez::VARIO]);maxAltitude=isfinite(maxAltitude)?fmaxf(maxAltitude,v[ez::ALTITUDE]):v[ez::ALTITUDE];}
  }
  v[ez::MAX_CLIMB]=maxClimb;v[ez::MAX_SINK]=maxSink;v[ez::MAX_ALTITUDE]=maxAltitude;
  v[ez::FLIGHT_SECONDS]=(flying?now-flightStart:flightDuration)*.001f;v[ez::ACCEL_BIAS]=vario.bias;v[ez::SPEED_SIGMA]=vario.sigma;
  varioTone.update(vario.speed,vario.ready,vario.settings.audio);
  v[ez::TONE_HZ]=varioTone.hz;v[ez::TONE_PERIOD]=varioTone.period;v[ez::TONE_ON]=varioTone.on;
  uint8_t packet[ez::PACKET_SIZE];
  ez::encode(packet,sequence,now,present,valid,fresh,v,status);
  fresh=0;
  if (BLE.connected() && stream.subscribed())stream.writeValue(packet,sizeof(packet));
}
