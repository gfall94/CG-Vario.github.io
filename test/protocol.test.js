import test from 'node:test';import assert from 'node:assert/strict';
import {PACKET_SIZE,decodeTelemetry,altitudeFromPressure,sequenceGap,groupValid} from '../protocol.js';

function packet(){const b=new ArrayBuffer(PACKET_SIZE),v=new DataView(b);v.setUint8(0,0x45);v.setUint8(1,0x5a);v.setUint8(2,1);v.setUint8(3,PACKET_SIZE);v.setUint32(4,0xabcdef01,true);v.setUint32(8,123456,true);v.setUint16(12,1023,true);v.setUint16(14,0b100001,true);v.setUint16(16,1,true);for(let i=0;i<26;i++)v.setFloat32(20+i*4,i+.25,true);return b}
test('decodes complete little-endian packet',()=>{const s=decodeTelemetry(packet());assert.equal(s.sequence,0xabcdef01);assert.equal(s.millis,123456);assert.equal(s.accE,.25);assert.equal(s.bsecAccuracy,25.25);assert.equal(groupValid(s,0),true);assert.equal(groupValid(s,1),false)});
test('rejects malformed packets',()=>{assert.throws(()=>decodeTelemetry(new ArrayBuffer(20)),/Paketlänge/);const b=packet();new DataView(b).setUint8(2,2);assert.throws(()=>decodeTelemetry(b),/Protokollversion/)});
test('calculates pressure altitude',()=>{assert.ok(Math.abs(altitudeFromPressure(1013.25))<1e-8);assert.ok(altitudeFromPressure(900)>900);assert.ok(Number.isNaN(altitudeFromPressure(0)))});
test('counts gaps across uint32 wrap',()=>{assert.equal(sequenceGap(10,14),3);assert.equal(sequenceGap(0xffffffff,1),1);assert.equal(sequenceGap(8,8),0)});
