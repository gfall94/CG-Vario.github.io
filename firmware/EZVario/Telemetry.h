#pragma once
#include <stdint.h>
#include <string.h>
#include <math.h>

namespace ez {
constexpr uint8_t VERSION = 2;
constexpr size_t VALUE_COUNT = 36;
constexpr size_t PACKET_SIZE = 20+4*VALUE_COUNT;
constexpr float G = 9.80665f;
struct Vec { float x, y, z; };
struct Quat { float x, y, z, w; };

// Bosch RV maps the ENU reference frame to the sensor frame.
// Apply its inverse to express a sensor vector in East / North / Up.
inline Vec earth(Vec v, Quat q) {
  const float norm = sqrtf(q.x*q.x + q.y*q.y + q.z*q.z + q.w*q.w);
  if (!isfinite(norm) || norm < 0.9f || norm > 1.1f) return {NAN,NAN,NAN};
  const float x=-q.x/norm, y=-q.y/norm, z=-q.z/norm, w=q.w/norm;
  const Vec t{2*(y*v.z-z*v.y), 2*(z*v.x-x*v.z), 2*(x*v.y-y*v.x)};
  return {v.x+w*t.x+y*t.z-z*t.y,
          v.y+w*t.y+z*t.x-x*t.z,
          v.z+w*t.z+x*t.y-y*t.x};
}
inline float altitude(float hPa, float qnh=1013.25f) {
  return hPa > 0 && isfinite(hPa) && qnh>0 ? (float)(44330.0*(1-pow((double)hPa/qnh,0.19029495))) : NAN;
}
inline void u16(uint8_t* b, uint16_t v) { b[0]=v; b[1]=v>>8; }
inline void u32(uint8_t* b, uint32_t v) {
  for (int i=0;i<4;++i) b[i]=v>>(8*i);
}
inline void f32(uint8_t* b, float v) {
  static_assert(sizeof(float)==4,"IEEE float32 required");
  uint32_t bits; memcpy(&bits,&v,4); u32(b,bits);
}
inline void encode(uint8_t* b, uint32_t seq, uint32_t ms,
                   uint16_t present, uint16_t valid, uint16_t fresh,
                   const float (&v)[VALUE_COUNT], uint16_t status=0) {
  b[0]='E'; b[1]='Z'; b[2]=VERSION; b[3]=PACKET_SIZE;
  u32(b+4,seq); u32(b+8,ms); u16(b+12,present); u16(b+14,valid);
  u16(b+16,fresh); u16(b+18,status);
  for (size_t i=0;i<VALUE_COUNT;++i) f32(b+20+4*i,v[i]);
}
}
