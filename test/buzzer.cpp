#include "../firmware/CGVario/Buzzer.h"
#include <assert.h>
float mbed::PwmOut::duty=0;int mbed::PwmOut::period=0;
int main(){ez::Buzzer b;b.begin();ez::Settings s;ez::VarioTone t;t.hz=1000;t.period=.5;t.on=.2;
b.update(0,t,s);assert(mbed::PwmOut::duty==0);
s.buzzerEnabled=1;s.buzzerVolume=100;b.update(0,t,s);assert(mbed::PwmOut::period==1000);assert(mbed::PwmOut::duty>.499);
b.update(210,t,s);assert(mbed::PwmOut::duty==0);b.update(510,t,s);assert(mbed::PwmOut::duty>.499);
s.buzzerVolume=25;b.update(520,t,s);assert(mbed::PwmOut::duty>0&&mbed::PwmOut::duty<.1);assert(mbed::PwmOut::period==1000);
t.period=0;b.update(800,t,s);assert(mbed::PwmOut::duty>0);
s.buzzerEnabled=0;b.update(810,t,s);assert(mbed::PwmOut::duty==0);
s.buzzerEnabled=1;t.hz=0;b.update(820,t,s);assert(mbed::PwmOut::duty==0);
}
