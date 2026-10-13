#pragma once
constexpr int P0_10=10;
namespace mbed {class PwmOut {public:static float duty;static int period;PwmOut(int){} void write(float v){duty=v;}void period_us(int v){period=v;}};}
