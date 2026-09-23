#pragma once
#include <math.h>
#include <stdint.h>
#include <string.h>

namespace ez {
// Independent implementation of a height / speed / acceleration-bias estimator.
// See docs/VARIO.md for the reference-method comparison and units.
struct Settings {
  float qnh=1013.25f, baroSigma=1.5f, accelTau=.12f;
  float responseTau=.55f, averageSeconds=10.f, processNoise=.08f;
  bool valid() const {
    return isfinite(qnh)&&qnh>=800&&qnh<=1100 && isfinite(baroSigma)&&baroSigma>=.3f&&baroSigma<=3
      && isfinite(accelTau)&&accelTau>=.04f&&accelTau<=.4f && isfinite(responseTau)&&responseTau>=.1f&&responseTau<=2
      && isfinite(averageSeconds)&&averageSeconds>=2&&averageSeconds<=30 && isfinite(processNoise)&&processNoise>=.02f&&processNoise<=1;
  }
};
inline Settings profile(unsigned index, float qnh) {
  Settings s; s.qnh=qnh;
  if(index==0) { s.baroSigma=2; s.accelTau=.18f; s.responseTau=.9f; s.processNoise=.06f; }
  if(index==2) { s.baroSigma=1; s.accelTau=.08f; s.responseTau=.3f; s.processNoise=.14f; }
  return s;
}

class Vario {
 public:
  Settings settings;
  float speed=NAN, average=NAN, height=NAN, bias=0, sigma=NAN;
  bool fused=false, ready=false;
  uint32_t rejected=0;
  void reset() {
    initialized=false; ready=false; fused=false; speed=average=height=sigma=NAN;
    bias=0; acc=NAN; vibration=0; count=cursor=0; distance=0;
  }
  bool configure(const Settings& s) { if(!s.valid())return false; settings=s; return true; }
  void update(uint32_t now, float baroHeight, bool freshBaro, float upAcceleration, bool imuValid) {
    bool baro=freshBaro&&isfinite(baroHeight)&&baroHeight>-1500&&baroHeight<15000;
    const bool imu=imuValid&&isfinite(upAcceleration)&&fabsf(upAcceleration)<30;
    if(initialized && now==lastTime)return;
    if(initialized && (now-lastTime>500 || now-lastBaro>1500))reset();
    if(!initialized) {
      if(!baro)return; // Never initialize from a held pressure snapshot.
      origin=baroHeight; x[0]=x[1]=x[2]=0; memset(P,0,sizeof(P));
      P[0][0]=settings.baroSigma*settings.baroSigma; P[1][1]=1; P[2][2]=.25f;
      lastTime=lastBaro=started=now; initialized=true; speed=0; height=origin;
      record(now); return;
    }
    const float dt=(now-lastTime)*.001f; lastTime=now;
    if(imu) {
      if(!isfinite(acc))acc=upAcceleration;
      const float r=upAcceleration-acc;
      vibration+=(1-expf(-dt))*(r*r-vibration);
      acc+=(1-expf(-dt/settings.accelTau))*r;
    } else acc=NAN;
    const float d2=.5f*dt*dt, a=imu?acc-x[2]:0;
    x[0]+=x[1]*dt+a*d2; x[1]+=a*dt;
    const float F[3][3]={{1,dt,imu?-d2:0},{0,1,imu?-dt:0},{0,0,1}};
    float next[3][3]={};
    for(int i=0;i<3;i++)for(int j=0;j<3;j++)for(int k=0;k<3;k++)for(int l=0;l<3;l++)next[i][j]+=F[i][k]*P[k][l]*F[j][l];
    // Continuous acceleration noise; pressure gets more authority with vibration
    // or missing IMU. Bias is observable through repeated altitude corrections.
    const float q=imu?settings.processNoise+fminf(vibration*.04f,.5f):.5f;
    next[0][0]+=q*dt*dt*dt/3; next[0][1]+=q*dt*dt/2;
    next[1][0]+=q*dt*dt/2; next[1][1]+=q*dt; next[2][2]+=.00005f*dt;
    memcpy(P,next,sizeof(P));
    if(baro) {
      float R=settings.baroSigma*settings.baroSigma;
      const float residual=(baroHeight-origin)-x[0], S=P[0][0]+R;
      if(fabsf(residual)<=fmaxf(4,6*sqrtf(S))) {
        // Huber-like weighting softens moderate pressure disturbances without
        // clipping true speed or forcing a zero in weak lift.
        const float weight=fmaxf(1,fabsf(residual)/(2.5f*sqrtf(S)));
        R*=weight*weight;
        float K[3]; for(int i=0;i<3;i++){K[i]=P[i][0]/(P[0][0]+R);x[i]+=K[i]*residual;}
        const float A[3][3]={{1-K[0],0,0},{-K[1],1,0},{-K[2],0,1}};
        // Joseph form protects positive covariance on the MCU's float32 FPU.
        for(int i=0;i<3;i++)for(int j=0;j<3;j++) {
          next[i][j]=K[i]*R*K[j];
          for(int k=0;k<3;k++)for(int l=0;l<3;l++)next[i][j]+=A[i][k]*P[k][l]*A[j][l];
        }
        memcpy(P,next,sizeof(P));lastBaro=now;
      } else rejected++;
    }
    if(now-lastBaro>1500){reset();return;}
    // Continuous blend, unlike a hard threshold which switches time constants
    // back and forth in noisy air. Strong real acceleration reduces lag.
    const float motion=imu?fabsf(acc-x[2]):0;
    const float blend=motion*motion/(motion*motion+.25f);
    const float tau=settings.responseTau*(1-blend)+fminf(.12f,settings.responseTau)*blend;
    speed+=(1-expf(-dt/tau))*(x[1]-speed);
    height=origin+x[0]; bias=x[2];sigma=sqrtf(fmaxf(0,P[1][1]));
    fused=imu;ready=now-started>=2000;
    distance+=x[1]*dt;
    record(now);
    // Signed, time-weighted rolling mean, independent of display smoothing.
    const uint32_t window=(uint32_t)(settings.averageSeconds*1000);
    average=NAN;
    for(unsigned n=0;n<count;n++) {
      const unsigned idx=(cursor+CAPACITY-count+n)%CAPACITY;
      const uint32_t age=now-history[idx].time;
      if(age<=window) {
        float old=history[idx].distance, seconds=age*.001f;
        if(n>0) {
          const auto& prev=history[(idx+CAPACITY-1)%CAPACITY];
          const float span=(history[idx].time-prev.time)*.001f;
          const float fraction=(window-age)*.001f/span;
          old+=(prev.distance-old)*fraction;seconds=window*.001f;
        }
        if(seconds>=.5f)average=(distance-old)/seconds;
        break;
      }
    }
  }
 private:
  static constexpr unsigned CAPACITY=302;
  struct Point {uint32_t time;float distance;} history[CAPACITY];
  unsigned cursor=0,count=0;
  bool initialized=false;
  uint32_t lastTime=0,lastBaro=0,started=0;
  float origin=0,x[3]={},P[3][3]={},acc=NAN,vibration=0,distance=0;
  void record(uint32_t now) {
    if(count && now-history[(cursor+CAPACITY-1)%CAPACITY].time<100)return;
    history[cursor]={now,distance};cursor=(cursor+1)%CAPACITY;
    if(count<CAPACITY)count++;
  }
};
}
