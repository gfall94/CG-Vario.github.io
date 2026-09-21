import test from 'node:test';
import assert from 'node:assert/strict';
import {VarioFilter} from '../vario.js';
const sample=(i,h,a=0,imu=true)=>({millis:(i*20)>>>0,standardAltitude:h,linearU:a,valid:32|(imu?2:0),fresh:i%2===0?32:0});
test('stationary pressure noise and IMU bias do not create sustained climb',()=>{
 const f=new VarioFilter();let energy=0,n=0;
 for(let i=0;i<3000;i++){const v=f.update(sample(i,100+.2*Math.sin(i*1.7),.12+.04*Math.sin(i*2.3)));if(i>2000){energy+=v*v;n++;}}
 assert.ok(Math.sqrt(energy/n)<.15);assert.ok(Math.abs(f.x[2]-.12)<.04);
});
test('follows acceleration promptly and settles on constant climb',()=>{
 const f=new VarioFilter();let atTransition=0,last=0;
 for(let i=0;i<1000;i++){const t=i*.02,u=Math.max(0,t-5),a=u>0&&u<1?2:0,h=u<1?u*u:2*u-1;last=f.update(sample(i,100+h,a));if(i===300)atTransition=last;}
 assert.ok(atTransition>1.5);assert.ok(Math.abs(last-2)<.1);
});
test('barometer fallback, packet gap, wrap, and invalid sensors',()=>{
 const f=new VarioFilter();let v;
 for(let i=0;i<1000;i++)v=f.update(sample(i,100-i*.02,NaN,false));
 assert.ok(Math.abs(v+1)<.15);assert.equal(f.mode,'Nur Barometer');
 assert.equal(f.update(sample(1500,80)),0);
 f.reset();assert.ok(Number.isNaN(f.update({...sample(0,NaN),valid:0})));
 f.update({...sample(0,100),millis:0xfffffff0});assert.ok(Number.isFinite(f.update({...sample(1,100),millis:4})));
});
test('ignores repeated pressure snapshots and rejects isolated spikes',()=>{
 const f=new VarioFilter();for(let i=0;i<500;i++)f.update(sample(i,100));
 assert.ok(Math.abs(f.update(sample(500,200)))<.1);
 const x=f.x.slice();f.update({...sample(501,300),fresh:0});assert.ok(Math.abs(f.x[1]-x[1])<.01);
});
