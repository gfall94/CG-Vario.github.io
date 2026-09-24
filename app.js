import {SERVICE_UUID,CHARACTERISTIC_UUID,CONTROL_UUID,fields,settingFields,AUDIO_SPEEDS,decodeTelemetry,decodeSettings,isCommandEcho,validateSettings,encodeCommand,sequenceGap,samplesInWindow} from './protocol.js?v=9';
import {VarioAudio} from './audio.js?v=9';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const $=id=>document.getElementById(id);
const audio=new VarioAudio();let previewTone=null,previewUntil=0;
$('audioRows').innerHTML=AUDIO_SPEEDS.map((v,i)=>`<tr><th>${v>0?'+':''}${v} m/s</th><td><input aria-label="Tonhöhe bei ${v} m/s" id="pitch${i}" type="number" min="80" max="2500" step="1" required></td><td><input aria-label="Tonlänge bei ${v} m/s" id="length${i}" type="number" min="${i<3?0:40}" max="1000" step="1" ${i<3?'readonly':''} required></td><td><input aria-label="Pause bei ${v} m/s" id="pause${i}" type="number" min="${i<3?0:40}" max="1500" step="1" ${i<3?'readonly':''} required></td><td><button type="button" aria-label="Tonprobe bei ${v} m/s" data-preview="${i}">▶</button></td></tr>`).join('');
try{const v=localStorage.getItem('varioVolume');if(v!==null)audio.setVolume(Number(v));}catch{}
$('audioVolume').value=Math.round(audio.volume*100);$('audioVolumeValue').textContent=`${Math.round(audio.volume*100)} %`;
const sensorDefs=[['pressure','Luftdruck','hPa'],['temperature','Temperatur','°C'],['humidity','Feuchte','%'],['accE','Beschleunigung Ost','m/s²'],['accN','Beschleunigung Nord','m/s²'],['accU','Beschleunigung Oben + g','m/s²'],['linearE','Linear Ost','m/s²'],['linearN','Linear Nord','m/s²'],['linearU','Linear Oben','m/s²'],['gyroX','Drehrate X','°/s'],['gyroY','Drehrate Y','°/s'],['gyroZ','Drehrate Z','°/s'],['magX','Magnetfeld X','µT'],['magY','Magnetfeld Y','µT'],['magZ','Magnetfeld Z','µT'],['quatX','Quaternion X',''],['quatY','Quaternion Y',''],['quatZ','Quaternion Z',''],['quatW','Quaternion W',''],['headingError','Richtungsunsicherheit','rad'],['gas','Gaswiderstand','Ω'],['iaq','Luftgüte IAQ',''],['eco2','eCO₂','ppm'],['bvoc','bVOC','ppm'],['bsecAccuracy','BSEC-Status',''],['accelBias','Geschätzter Beschleunigungsoffset','m/s²'],['speedSigma','Geschätzte Vario-Unsicherheit','m/s']];
for(const [key,label,unit] of sensorDefs){const row=document.createElement('div'),name=document.createElement('span'),value=document.createElement('strong');name.textContent=label;value.id=key;value.textContent=`– ${unit}`;row.append(name,value);$('sensorGrid').append(row);}
let device=null,stream=null,control=null,settings=null,pending=null,request=0,session=0;
let samples=[],latest=null,previous=null,lost=0,times=[],connectedAt=0;
const number=(v,d=1,signed=false)=>Number.isFinite(v)?`${signed&&v>0?'+':''}${v.toFixed(d)}`:'–';
function message(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';}
function status(text,cls=''){$('status').textContent=text;$('status').className=cls;}
function screenDim(enabled){try{Promise.resolve(navigator.bluetooth?.setScreenDimEnabled?.(enabled)).catch(()=>{});}catch{}}
function fillSettings(s){$('audioDraftStatus').textContent='Audio-Profil vom Nicla übernommen.';settings=s;for(const key of settingFields)$(key).value=Number(s[key].toFixed(key==='qnh'?2:3));$('qnhReadout').textContent=number(s.qnh,2);$('averageWindow').textContent=number(s.averageSeconds,0);drawAudioProfile();}
function draftSettings(){return Object.fromEntries(settingFields.map(k=>[k,Number($(k).value)]));}
function drawAudioProfile(){
  const draft=draftSettings(),x=v=>55+(v+10)/20*780,y=(v,max)=>230-v/max*200;
  const ticks=[-10,-5,-2,0,2,5,10].map(v=>`<text x="${x(v)}" y="254" text-anchor="middle">${v} m/s</text>`).join('');
  const grid=[0,500,1000,1500,2000,2500].map(v=>`<path d="M55 ${y(v,2500)}H835"/><text x="48" y="${y(v,2500)+4}" text-anchor="end">${v}</text><text x="845" y="${y(v,2500)+4}">${v*.6}</text>`).join('');
  const curves=[['pitch',2500,'#76c6ff'],['length',1500,'#ff886b'],['pause',1500,'#c3b1fb']].map(([key,max,color])=>{
    const points=AUDIO_SPEEDS.map((v,i)=>[x(v),y(Number.isFinite(draft[key+i])?draft[key+i]:0,max)]);
    return `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${points.map(p=>p.join(',')).join(' ')}"/>`+points.map(([cx,cy])=>`<circle cx="${cx}" cy="${cy}" r="4" fill="${color}"/>`).join('');
  }).join('');
  $('audioGraph').innerHTML=`<g fill="#91a7b5" font-size="12"><text x="10" y="15">Hz</text><text x="845" y="15">ms</text><g stroke="#293c48" stroke-width="1">${grid}</g>${ticks}</g>${curves}`;
}
function settingsNotification(event){
  try{if(isCommandEcho(event.target.value))return;const s=decodeSettings(event.target.value);if(pending&&s.request===pending.id){const p=pending;pending=null;clearTimeout(p.timer);if(s.result===0){fillSettings(s);p.resolve();}else p.reject(Error(s.result===3?'Speichern im Nicla-Flash fehlgeschlagen. Bisherige Einstellungen bleiben aktiv.':'Nicla hat den Befehl abgelehnt. Werte und Sensorstatus prüfen.'));}}
  catch(e){message(e.message,true);}
}
async function command(opcode,values={}){
  if(!control||!settings||pending)throw Error('Einstellungen sind gerade nicht verfügbar.');
  const characteristic=control;
  $('deviceSettings').disabled=true;$('settingsStatus').textContent='Warte auf Gerätebestätigung …';
  const id=request=(request+1)&65535;
  let promise=new Promise((resolve,reject)=>{pending={id,resolve,reject,timer:setTimeout(()=>{if(pending?.id===id){pending=null;reject(Error('Keine Gerätebestätigung. Neu verbinden und Einstellungen prüfen.'));}},4000)};});
  // Register rejection handling before the asynchronous BLE write completes.
  promise.catch(()=>{});
  try {
    const payload=encodeCommand(opcode,id,values);
    if(characteristic.writeValueWithResponse)await characteristic.writeValueWithResponse(payload);
    else await characteristic.writeValue(payload); // Older Bluefy Web Bluetooth API.
    await promise;
    $('settingsStatus').textContent=opcode===0||opcode>=4?'Dauerhaft gespeichert':'Vom Nicla bestätigt';message(opcode===0||opcode>=4?'Einstellungen im Nicla dauerhaft gespeichert.':'Gerätebefehl bestätigt.');
  } catch(e) {
    if(pending?.id===id){clearTimeout(pending.timer);pending.reject(e);pending=null;}
    $('settingsStatus').textContent='Nicht bestätigt';throw e;
  } finally {$('deviceSettings').disabled=!control||!settings;}
}
function receive(event){
  try{
    const s=decodeTelemetry(event.target.value),now=performance.now();
    s.received=now;s.epoch=Date.now();lost+=sequenceGap(previous,s.sequence);previous=s.sequence;
    samples.push(s);if(samples.length>3100)samples.splice(0,samples.length-3100);
    latest=s;times.push(now);times=times.filter(t=>now-t<=2000);
    if(s.version===1){status('Firmware aktualisieren','error');message('Dein Nicla sendet noch Protokoll 1. Für Steigrate, Höhen und Einstellungen bitte die neue Firmware aufspielen. Rohsensoren bleiben sichtbar.',true);}
    else {status('Verbunden','live');}
  }catch(e){message(`Empfangsfehler: ${e.message}`,true);}
}
function disconnected(){
  audio.disable();previewUntil=0;
  session++;if(stream)stream.removeEventListener('characteristicvaluechanged',receive);
  if(control)control.removeEventListener('characteristicvaluechanged',settingsNotification);
  stream=control=null;settings=null;connectedAt=0;
  if(pending){clearTimeout(pending.timer);pending.reject(Error('Bluetooth-Verbindung beendet.'));pending=null;}
  $('connect').disabled=false;$('connect').textContent='Verbinden';$('deviceSettings').disabled=true;$('settingsStatus').textContent='Gerät verbinden';
  status('Nicht verbunden');screenDim(true);render();
}
async function connect(){
  if(device?.gatt?.connected){device.gatt.disconnect();return;}
  if(!navigator.bluetooth){message('Web Bluetooth ist nicht verfügbar. Bitte in Bluefy öffnen.',true);return;}
  const attempt=++session;$('connect').disabled=true;
  try{
    device=await navigator.bluetooth.requestDevice({filters:[{services:[SERVICE_UUID]}]});
    await delay(200);
    device.addEventListener('gattserverdisconnected',disconnected);
    await delay(200);
    const server=await device.gatt.connect(),service=await server.getPrimaryService(SERVICE_UUID);
    await delay(200);
    stream=await service.getCharacteristic(CHARACTERISTIC_UUID);
    await delay(200);
    samples=[];latest=null;previous=null;lost=0;times=[];
    stream.addEventListener('characteristicvaluechanged',receive);await stream.startNotifications();
     await delay(200);
     try{
      control=await service.getCharacteristic(CONTROL_UUID);
      await delay(200);
      control.addEventListener('characteristicvaluechanged',settingsNotification);await control.startNotifications();
      const s=decodeSettings(await control.readValue());fillSettings(s);
      $('deviceSettings').disabled=false;$('settingsStatus').textContent='Vom Nicla gelesen';
    }catch(e){if(control)control.removeEventListener('characteristicvaluechanged',settingsNotification);control=null;settings=null;$('settingsStatus').textContent='Firmware-Update erforderlich';message(e.message,true);}
    if(attempt!==session)return;
    connectedAt=performance.now();$('connect').textContent='Trennen';status('Warte auf Daten');screenDim(false);
    if(control)message('Verbunden. Der Nicla berechnet alle Flugwerte.');
  }catch(e){if(device?.gatt?.connected)device.gatt.disconnect();else disconnected();message(e.name==='NotFoundError'?'Keine Geräteauswahl getroffen.':`Verbindung fehlgeschlagen: ${e.message}`,true);}
  finally{$('connect').disabled=false;}
}
function drawTrend(now){
  const canvas=$('varioChart'),rect=canvas.getBoundingClientRect(),dpr=Math.min(globalThis.devicePixelRatio||1,2);
  const w=Math.max(1,rect.width),h=Math.max(1,rect.height);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  const visible=samplesInWindow(samples,now),range=Math.max(2,...visible.flatMap(s=>[Math.abs(s.vario)||0,Math.abs(s.average)||0]));
  const y=v=>h/2-v/range*(h/2-12),x=t=>40+(t-(now-60000))/60000*(w-48);
  c.font='11px system-ui';
  for(const v of [-range,0,range]){c.strokeStyle=v===0?'#647e8c':'#283d4a';c.lineWidth=1;c.beginPath();c.moveTo(40,y(v));c.lineTo(w,y(v));c.stroke();c.fillStyle='#93a9b7';c.fillText(number(v,1,true),0,y(v)+4);}
  for(const [key,color] of [['vario','#3edbc0'],['average','#ff9866']]){c.strokeStyle=color;c.lineWidth=2;c.beginPath();let last=null;for(const s of visible){if(!(s.status&1)||!Number.isFinite(s[key])){last=null;continue;}if(!last||s.received-last>200)c.moveTo(x(s.received),y(s[key]));else c.lineTo(x(s.received),y(s[key]));last=s.received;}c.stroke();}
}
function render(){
  const now=performance.now(),fresh=device?.gatt?.connected&&latest&&now-latest.received<1500;
  const usable=fresh&&latest.version>=2&&(latest.status&1),flying=fresh&&Boolean(latest.status&4);
  for(const key of ['vario','average','altitude','relativeAltitude','maxClimb','maxSink','maxAltitude'])$(key).textContent=number(usable?latest[key]:NaN,key.includes('Altitude')||key==='altitude'?0:1,['vario','average','maxClimb','maxSink'].includes(key));
  const seconds=fresh&&Number.isFinite(latest.flightSeconds)?Math.floor(latest.flightSeconds):0;
  $('flightTime').textContent=fresh?[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(v=>String(v).padStart(2,'0')).join(':'):'–';
  $('flightState').textContent=flying?'Flug läuft':seconds>0?'Flug beendet':'Nicht gestartet';
  $('filterMode').textContent=!fresh?'Warte auf Nicla':latest.version===1?'Firmware-Update nötig':!usable?'Filter läuft ein …':latest.status&2?'Barometer + IMU':'Nur Barometer';
  const v=usable&&Number.isFinite(latest.vario)?latest.vario:0,bar=$('varioBar');
  bar.style.height=`${Math.min(50,Math.abs(v)*10)}%`;bar.style.top=`${v>=0?50-Math.min(50,v*10):50}%`;bar.style.background=v>=0?'#c9f579':'#ea874c';
  $('startFlight').disabled=!usable||!control||!!pending||flying;$('stopFlight').disabled=!flying||!control||!!pending;$('zero').disabled=!usable||!control||!!pending;
  for(const [key,,unit] of sensorDefs)$(key).textContent=`${number(fresh?latest[key]:NaN,key.startsWith('quat')?3:1)} ${unit}`;
  $('rate').textContent=fresh?String(Math.round(times.filter(t=>now-t<=2000).length/2)):'0';$('lost').textContent=lost;$('protocolVersion').textContent=latest?.version??'–';
  if(device?.gatt?.connected&&connectedAt&&((latest&&!fresh)||(!latest&&now-connectedAt>3000))){status('Daten fehlen','error');$('filterMode').textContent='Keine aktuellen Messwerte';}
  drawTrend(now);
}
async function exportCsv(){
  if(!samples.length){message('Noch keine Daten zum Exportieren.');return;}
  const columns=['epoch','millis','sequence','status',...fields],text=[columns.join(','),...samples.map(s=>columns.map(k=>Number.isFinite(s[k])?s[k]:'').join(','))].join('\n');
  const file=new File([text],`cg-vario-${Date.now()}.csv`,{type:'text/csv'});
  if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file]});
  else{const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
}
const run=fn=>()=>Promise.resolve().then(fn).catch(e=>message(e.message,true));
$('connect').onclick=connect;
$('settingsForm').onsubmit=e=>{e.preventDefault();if(!$('settingsForm').reportValidity())return;try{const values=draftSettings();validateSettings(values);command(0,values).catch(e=>message(e.message,true));}catch(error){message(error.message,true);}};
$('settingsForm').oninput=()=>{$('settingsStatus').textContent='Entwurf · noch nicht gespeichert';drawAudioProfile();$('audioDraftStatus').textContent='Entwurf geändert – zum dauerhaften Speichern an Nicla senden.';};
$('audioToggle').onclick=async()=>{if(audio.enabled){audio.disable();previewUntil=0;}else try{await audio.enable();}catch(e){message(e.message,true);}audioTick(false);};
$('audioVolume').oninput=()=>{audio.setVolume(Number($('audioVolume').value)/100);$('audioVolumeValue').textContent=`${Math.round(audio.volume*100)} %`;try{localStorage.setItem('varioVolume',audio.volume);}catch{}};
for(const button of document.querySelectorAll('[data-preview]'))button.onclick=async()=>{
  try{const i=Number(button.dataset.preview),s=draftSettings();validateSettings(s);await audio.enable();previewTone={toneHz:s[`pitch${i}`],tonePeriod:i<3?0:(s[`length${i}`]+s[`pause${i}`])/1000,toneOn:i<3?0:s[`length${i}`]/1000};audio.mute();previewUntil=performance.now()+2000;message(`Tonprobe für ${AUDIO_SPEEDS[i]} m/s (Entwurf, noch nicht gespeichert).`);}catch(e){message(e.message,true);}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){audio.disable();previewUntil=0;}});
function audioTick(schedule=true){if(document.hidden){audio.disable();previewUntil=0;}
  const now=performance.now(),preview=now<previewUntil;
  const valid=!document.hidden&&device?.gatt?.connected&&latest?.version>=3&&(latest.status&1)&&now-latest.received<600;
  audio.render(preview?previewTone:latest,preview||valid);
  $('audioToggle').textContent=audio.enabled?'Ton ausschalten':'Ton einschalten';$('audioToggle').setAttribute('aria-pressed',String(audio.enabled));
  $('audioStatus').textContent=!audio.enabled?'Aus':preview?'Tonprobe':latest&&latest.version<3?'Audio benötigt neue Nicla-Firmware':valid?'Ein · Live-Vario':'Ein · warte auf Messwerte';
  if(schedule)setTimeout(audioTick,50);
}
audioTick();
for(const button of document.querySelectorAll('[data-command]'))button.onclick=run(()=>command(Number(button.dataset.command)));
$('zero').onclick=run(()=>command(1));$('startFlight').onclick=run(()=>command(2));$('stopFlight').onclick=run(()=>command(3));$('resetSettings').onclick=run(()=>command(4));$('export').onclick=run(exportCsv);
$('fullscreen').onclick=run(()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.());
if(!document.documentElement.requestFullscreen)$('fullscreen').hidden=true;
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
function tick(){try{render();}catch(e){message(`Anzeigefehler: ${e.message}`,true);}setTimeout(tick,100);}tick();
