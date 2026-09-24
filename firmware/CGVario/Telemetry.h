#pragma once
#include <stdint.h>
#include <string.h>
#include <math.h>

namespace ez {
constexpr uint8_t VERSION = 4;
constexpr size_t VALUE_COUNT = 30;
constexpr size_t PACKET_SIZE = 20+4*VALUE_COUNT;
constexpr float G = 9.80665f;
enum ValueIndex : uint8_t {
  ACC_E, ACC_N, ACC_U, G_FORCE,
  MAG_X, MAG_Y, MAG_Z,
  PRESSURE, TEMPERATURE, HUMIDITY, GAS, IAQ, ECO2, BVOC,
  HEADING_ERROR, STANDARD_ALTITUDE, BSEC_ACCURACY,
  VARIO, AVERAGE, ALTITUDE, RELATIVE_ALTITUDE,
  MAX_CLIMB, MAX_SINK, MAX_ALTITUDE, FLIGHT_SECONDS,
  ACCEL_BIAS, SPEED_SIGMA, TONE_HZ, TONE_PERIOD, TONE_ON
};
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
inline float qnhForAltitude(float hPa, float height) {
  const float base=1.f-height/44330.f;
  return hPa>0 && isfinite(hPa) && isfinite(height) && base>0
    ? hPa/powf(base,1.f/0.19029495f) : NAN;
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
