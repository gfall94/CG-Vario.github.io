#pragma once
#include <mbed.h>
#include "VarioTone.h"
#include "Vario.h"
namespace ez {
// Arduino digital 0 = header GPIO3/LPIO3 = nRF P0_10.
// Hardware PWM leaves sensor FIFO servicing and BLE independent of audio edges.
class Buzzer {
  mbed::PwmOut* output=nullptr;
  uint32_t cycleStart=0;
  bool pulsing=false;
  float lastHz=0,lastDuty=-1;
 public:
  void begin(){static mbed::PwmOut pwm(P0_10);output=&pwm;output->write(0);}
  void update(uint32_t now,const VarioTone& tone,const Settings& settings){
    if(!output)return;
    float duty=0;
    const bool active=settings.buzzerEnabled==1&&settings.buzzerVolume>0&&isfinite(tone.hz)&&tone.hz>=80&&tone.hz<=2500;
    if(active){
      bool sounding=true;
      if(tone.period>0){
        if(!pulsing){cycleStart=now;pulsing=true;}
        const uint32_t period=(uint32_t)fmaxf(1,tone.period*1000);
        if(now-cycleStart>=period)cycleStart+=((now-cycleStart)/period)*period;
        sounding=now-cycleStart<(uint32_t)(tone.on*1000);
      }else pulsing=false;
      // Fundamental amplitude is proportional to sin(pi*duty), maximum at 50%.
      if(sounding)duty=asinf(settings.buzzerVolume*.01f)/3.14159265f;
      if(lastHz!=tone.hz){output->period_us((int)(1000000.f/tone.hz+.5f));lastHz=tone.hz;}
    }else pulsing=false;
    if(duty!=lastDuty){output->write(duty);lastDuty=duty;}
  }
};
}
