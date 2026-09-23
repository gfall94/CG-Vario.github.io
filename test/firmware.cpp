#include "../firmware/EZVario/Vario.h"
#include "../firmware/EZVario/Control.h"
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <assert.h>
#include <stdio.h>

float noise(){static uint32_t seed=123456789;seed=1664525u*seed+1013904223u;return (double)seed/4294967295.0-.5;}
int main(){
  ez::Vario f;float energy=0,peak=0;int n=0;
  for(int i=0;i<6000;i++){
    float h=100+.45f*noise()+.12f*sinf(i*.19f),a=.09f+.16f*noise()+.05f*sinf(i*.7f);
    f.update(i*20,h,i%2==0,a,true);
    if(i>3000){energy+=f.speed*f.speed;peak=fmaxf(peak,fabsf(f.speed));n++;}
  }
  printf("stationary RMS %.4f m/s, peak %.4f m/s, bias %.4f\n",sqrtf(energy/n),peak,f.bias);
  assert(sqrtf(energy/n)<.06f);assert(peak<.16f);assert(fabsf(f.bias-.09f)<.04f);
  f.reset();float response=0;
  for(int i=0;i<1500;i++){
    float u=fmaxf(0,i*.02f-5),a=u>0&&u<1?2:0,h=u<1?u*u:2*u-1;
    f.update(i*20,100+h,i%2==0,a,true);if(i==300)response=f.speed;
  }
  printf("one-second climb response %.3f m/s, final %.3f, mean %.3f\n",response,f.speed,f.average);
  assert(response>1.4f);assert(fabsf(f.speed-2)<.1f);assert(fabsf(f.average-2)<.1f);
  float speed=f.speed;auto settings=f.settings;settings.qnh=1020;assert(f.configure(settings));assert(f.speed==speed);
  settings.baroSigma=NAN;assert(!f.configure(settings));assert(f.settings.baroSigma==1.5f);
  f.reset();for(int i=0;i<1500;i++)f.update(i*20,100-i*.02f,i%2==0,NAN,false);
  assert(fabsf(f.speed+1)<.15f);assert(!f.fused);assert(fabsf(f.average+1)<.15f);
  f.update(31000,100,false,0,true);assert(!f.ready&&isnan(f.speed));
  f.update(31020,100,true,0,true);assert(f.speed==0&&!f.ready);
  f.reset();for(int i=0;i<500;i++)f.update(i*20,100,i%2==0,0,true);
  f.update(10000,200,true,0,true);assert(fabsf(f.speed)<.1f);assert(f.rejected==1);
  for(int i=501;i<580;i++)f.update(i*20,100,false,0,true);
  assert(!f.ready&&isnan(f.speed));
  f.reset();f.update(0xfffffff0u,100,true,0,true);f.update(4,100,false,0,true);assert(isfinite(f.speed));
  // Irregular sampling must preserve a constant signed mean and remain finite.
  f.reset();uint32_t now=0;for(int i=0;i<2000;i++){now+=i%3==0?30:20;f.update(now,100+now*.001f,i%2==0,0,true);}
  assert(fabsf(f.speed-1)<.1f&&fabsf(f.average-1)<.1f);
  for(unsigned p=0;p<3;p++){
    ez::Vario v;assert(v.configure(ez::profile(p,1013.25f)));
    for(int i=0;i<3000;i++)v.update(i*20,100+.2f*sinf(i),i%2==0,.1f,true);
    assert(isfinite(v.speed)&&fabsf(v.speed)<.1f);
  }
  // ENU quaternion convention and wire format are exercised on real C++ code.
  const float r=sqrtf(.5f);auto a=ez::earth({0,ez::G,0},{r,0,0,r});assert(fabsf(a.z+ez::G)<.001f);
  float values[ez::VALUE_COUNT];for(unsigned i=0;i<ez::VALUE_COUNT;i++)values[i]=i+.25f;
  uint8_t packet[ez::PACKET_SIZE];ez::encode(packet,42,500,1023,1023,32,values,3);
  assert(sizeof(packet)==164&&packet[2]==2&&packet[3]==164&&ez::read16(packet+18)==3);
  assert(ez::readFloat(packet+124)==26.25f);
  uint8_t config[ez::CONTROL_SIZE];ez::Settings s;ez::encodeSettings(config,s,12,3,0);
  assert(ez::readSettings(config).valid());assert(ez::read16(config+4)==12);
  puts("Firmware estimator and protocol tests passed.");
}
