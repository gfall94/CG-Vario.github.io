#pragma once
#include <math.h>
#include "AudioProfile.h"
namespace ez {
// Audio is a device-generated presentation of the filtered instantaneous vario.
// Hysteresis prevents threshold chatter; weak lift remains visible numerically.
class VarioTone {
 public:
  float hz=0,period=0,on=0;
  void update(float speed,bool ready,const AudioProfile& profile) {
    if(!ready||!isfinite(speed)){mode=0;hz=period=on=0;return;}
    if(mode==1&&speed<profile.climb-.04f)mode=0;
    if(mode==-1&&speed>profile.sink+.1f)mode=0;
    if(speed>=profile.climb)mode=1;
    if(speed<=profile.sink)mode=-1;
    hz=period=on=0;
    const auto p=profile.at(speed);
    if(mode==1){hz=p.pitch;period=(p.length+p.pause)*.001f;on=p.length*.001f;}
    if(mode==-1)hz=p.pitch; // period=0: continuous sink tone
  }
 private:
  int mode=0;
};
}
