#pragma once
#include <math.h>
namespace ez {
constexpr unsigned AUDIO_POINTS=9;
constexpr float AUDIO_SPEEDS[AUDIO_POINTS]={-10,-5,-2,0,.5f,1,2,5,10};
struct AudioPoint {float pitch,length,pause;}; // Hz, ms, ms
struct AudioProfile {
  float climb=.2f,sink=-1.5f;
  AudioPoint points[AUDIO_POINTS]={{120,0,0},{180,0,0},{270,0,0},{500,300,400},{760,250,350},{870,220,280},{1090,180,200},{1750,100,100},{2400,60,60}};
  bool valid() const {
    if(!isfinite(climb)||climb<.05f||climb>2||!isfinite(sink)||sink< -5||sink>-.2f)return false;
    for(unsigned i=0;i<AUDIO_POINTS;i++) {
      const auto& p=points[i];
      if(!isfinite(p.pitch)||p.pitch<80||p.pitch>2500||!isfinite(p.length)||!isfinite(p.pause))return false;
      if(i<3){if(p.length!=0||p.pause!=0)return false;}
      else if(p.length<40||p.length>1000||p.pause<40||p.pause>1500)return false;
      if(i&&p.pitch<points[i-1].pitch)return false;
      if(i>3&&p.length+p.pause>points[i-1].length+points[i-1].pause)return false;
    }
    return true;
  }
  AudioPoint at(float speed) const {
    if(speed<=AUDIO_SPEEDS[0])return points[0];
    for(unsigned i=1;i<AUDIO_POINTS;i++)if(speed<=AUDIO_SPEEDS[i]){
      float w=(speed-AUDIO_SPEEDS[i-1])/(AUDIO_SPEEDS[i]-AUDIO_SPEEDS[i-1]);
      const auto& a=points[i-1];const auto& b=points[i];
      return {a.pitch+w*(b.pitch-a.pitch),a.length+w*(b.length-a.length),a.pause+w*(b.pause-a.pause)};
    }
    return points[AUDIO_POINTS-1];
  }
};
}
