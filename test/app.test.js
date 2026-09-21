import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as protocol from '../protocol.js';
import {VarioFilter} from '../vario.js';

test('Bluefy without Promise screen API or storage still connects and renders packets',async()=>{
 const elements=new Map(),timers=[];let notify;
 const context2d=new Proxy({}, {get:()=>()=>{}});
 const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'',className:'',querySelector:()=>element('statusText'),getBoundingClientRect:()=>({width:400,height:200}),getContext:()=>context2d});return elements.get(id);};
 const ch={addEventListener:(name,handler)=>{notify=handler;},startNotifications:async()=>{}};
 const device={name:'EZ-Vario',addEventListener(){},gatt:{connected:true,connect:async()=>({getPrimaryService:async()=>({getCharacteristic:async()=>ch})}),disconnect(){this.connected=false;}}};
 const context=vm.createContext({...protocol,VarioFilter,console,DataView,ArrayBuffer,performance:{now:()=>1000},devicePixelRatio:1,document:{getElementById:element},localStorage:{getItem(){throw Error('blocked');}},navigator:{bluetooth:{requestDevice:async()=>device,setScreenDimEnabled(){}}},setTimeout:fn=>{timers.push(fn);return timers.length;},setInterval(){},clearInterval(){}});
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInContext(source,context);await element('connect').onclick();
 assert.equal(element('connect').textContent,'Trennen');
 const packet=new DataView(new ArrayBuffer(124));packet.setUint8(0,69);packet.setUint8(1,90);packet.setUint8(2,1);packet.setUint8(3,124);packet.setUint16(14,1023,true);packet.setUint16(16,1023,true);packet.setFloat32(84,1000,true);packet.setFloat32(88,22,true);packet.setFloat32(116,110,true);
 notify({target:{value:packet}});timers.shift()();
 assert.equal(element('pressure').textContent,'1000.0');assert.equal(element('vario').textContent,'0.0');assert.equal(element('filterMode').textContent,'Höhe + Beschleunigung');
 // A transient canvas failure must not permanently kill the render timer.
 element('varioChart').getContext=()=>{throw Error('canvas temporarily unavailable');};timers.shift()();assert.ok(timers.length>0);assert.match(element('message').textContent,/Anzeigefehler/);
});
