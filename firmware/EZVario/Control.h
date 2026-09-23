#pragma once
#include "Telemetry.h"
#include "Vario.h"
namespace ez {
constexpr size_t CONTROL_SIZE=32;
inline uint16_t read16(const uint8_t* b){return b[0]|((uint16_t)b[1]<<8);}
inline float readFloat(const uint8_t* b){uint32_t n=0;for(int i=0;i<4;i++)n|=(uint32_t)b[i]<<(8*i);float v;memcpy(&v,&n,4);return v;}
inline Settings readSettings(const uint8_t* b){Settings s;s.qnh=readFloat(b+8);s.baroSigma=readFloat(b+12);s.accelTau=readFloat(b+16);s.responseTau=readFloat(b+20);s.averageSeconds=readFloat(b+24);s.processNoise=readFloat(b+28);return s;}
inline void encodeSettings(uint8_t* b,const Settings& s,uint16_t request,uint16_t revision,uint8_t result){
  b[0]='E';b[1]='C';b[2]=1;b[3]=result;u16(b+4,request);u16(b+6,revision);
  f32(b+8,s.qnh);f32(b+12,s.baroSigma);f32(b+16,s.accelTau);f32(b+20,s.responseTau);f32(b+24,s.averageSeconds);f32(b+28,s.processNoise);
}
}
