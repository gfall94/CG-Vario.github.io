import {SERVICE_UUID, CHARACTERISTIC_UUID, fields, decodeTelemetry, altitudeFromPressure, sequenceGap, samplesInWindow} from './protocol.js?v=5';
import {VarioFilter} from './vario.js?v=5';
const filter=new VarioFilter();

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['status','connect','demo','altitude','relativeAltitude','vario','pressure','temperature','humidity','rate','lost','qnh','zero','pause','export','message','gas','iaq','eco2','bvoc','quat','bsec','magX','magY','magZ','filterMode'].map(id=>[id,$(id)]));
const MAX_SAMPLES=3000, WINDOW_MS=60000, STALE_MS=1500;
let samples=[], device=null, characteristic=null, lastSequence=null, lost=0, paused=false, demoTimer=null, zeroPressure=null, packetTimes=[], lastPacketAt=0, invalidPackets=0, repaintHandle=0, connectedAt=0;
let qnh=1013.25;
try { const saved=Number(localStorage.getItem('qnh')); if(saved>=800&&saved<=1100)qnh=saved; } catch {}
ui.qnh.value=qnh.toFixed(2);

const chartDefs={
  varioChart:[['vario','#32d6d0']],
  altitudeChart:[['altitude','#32d6d0'],['relativeAltitude','#ffb84d']],
  linearChart:[['linearE','#32d6d0'],['linearN','#ffb84d'],['linearU','#68a9ff']],
  accChart:[['accE','#32d6d0'],['accN','#ffb84d'],['accU','#68a9ff']],
  gyroChart:[['gyroX','#32d6d0'],['gyroY','#ffb84d'],['gyroZ','#68a9ff']],
  environmentChart:[['temperature','#ffb84d'],['humidity','#68a9ff']],
  airChart:[['iaq','#32d6d0'],['eco2','#ffb84d'],['bvoc','#68a9ff']]
};

function setStatus(text,type='offline'){ui.status.className=`status ${type}`;ui.status.querySelector('span').textContent=text;}
function message(text,error=false){ui.message.textContent=text;ui.message.className=`message${error?' error':''}`;}
function fmt(v,d=1){return Number.isFinite(v)?v.toFixed(d):'–';}

function addSample(sample, received=performance.now()){
  const gap=sequenceGap(lastSequence,sample.sequence); lost+=gap; lastSequence=sample.sequence;
  sample.received=received; sample.epoch=Date.now(); sample.altitude=altitudeFromPressure(sample.pressure,qnh);
  sample.relativeAltitude=zeroPressure?altitudeFromPressure(sample.pressure,zeroPressure):0;
  sample.vario=filter.update(sample);
  samples.push(sample); if(samples.length>MAX_SAMPLES)samples.splice(0,samples.length-MAX_SAMPLES);
  packetTimes.push(received); packetTimes=packetTimes.filter(t=>received-t<=2000); lastPacketAt=Date.now();
}

function onNotification(event){
  try{addSample(decodeTelemetry(event.target.value));setStatus(device?.name||'EZ-Vario','live');message('Live-Daten werden lokal empfangen.');}
  catch(error){invalidPackets++;message(`Empfangsfehler: ${error.message}${/Paketlänge/.test(error.message)?' (124 Byte benötigt; Bluetooth neu verbinden.)':''}`,true);}
}

async function connect(){
  if(!navigator.bluetooth){message('Web Bluetooth ist hier nicht verfügbar. Öffne diese Seite in Bluefy.',true);return;}
  stopDemo(); resetSession(); ui.connect.disabled=true; message('Bluetooth-Gerät auswählen …');
  try{
    device=await navigator.bluetooth.requestDevice({filters:[{services:[SERVICE_UUID]}]});
    device.addEventListener('gattserverdisconnected',onDisconnected);
    const server=await device.gatt.connect();
    const service=await server.getPrimaryService(SERVICE_UUID);
    characteristic=await service.getCharacteristic(CHARACTERISTIC_UUID);
    characteristic.addEventListener('characteristicvaluechanged',onNotification);
    await characteristic.startNotifications();
    connectedAt=Date.now();
    setScreenDim(false);
    setStatus(device.name||'EZ-Vario','live'); ui.connect.textContent='Trennen'; ui.connect.onclick=disconnect;
    message('Verbunden. Warte auf das erste Telemetriepaket …');
  }catch(error){if(device?.gatt?.connected)device.gatt.disconnect();setStatus('Nicht verbunden');message(error.name==='NotFoundError'?'Keine Geräteauswahl getroffen.':`Verbindung fehlgeschlagen: ${error.message}`,true);}
  finally{ui.connect.disabled=false;}
}
function setScreenDim(enabled){try{Promise.resolve(navigator.bluetooth?.setScreenDimEnabled?.(enabled)).catch(()=>{});}catch{}}
function resetSession(){samples=[];lost=0;lastSequence=null;packetTimes=[];lastPacketAt=0;filter.reset();paused=false;ui.pause.textContent='Ansicht pausieren';}
function disconnect(){if(device?.gatt?.connected)device.gatt.disconnect();else onDisconnected();}
function onDisconnected(){characteristic=null;connectedAt=0;setStatus('Nicht verbunden');ui.connect.textContent='Bluetooth verbinden';ui.connect.onclick=connect;ui.connect.disabled=false;setScreenDim(true);message('Verbindung beendet.');}

function startDemo(){
  disconnect();resetSession();let seq=0,t=0;ui.demo.textContent='Demo stoppen';setStatus('Demo','live');
  demoTimer=setInterval(()=>{t+=.02;const trueHeight=12*Math.sin(t/8);const pressure=1013.25*Math.pow(1-trueHeight/44330,1/.19029495);const altitude=altitudeFromPressure(pressure,qnh);addSample({sequence:seq++,millis:Math.round(t*1000),present:1023,valid:1023,fresh:seq%2===0?1023:991,accE:.12*Math.sin(t*2),accN:.08*Math.cos(t*1.7),accU:9.80665+.2*Math.sin(t*2.3),linearE:.12*Math.sin(t*2),linearN:.08*Math.cos(t*1.7),linearU:-12/64*Math.sin(t/8)+.025*Math.sin(t*29),gyroX:4*Math.sin(t),gyroY:2*Math.cos(t*1.2),gyroZ:8*Math.sin(t*.5),magX:22+2*Math.sin(t),magY:4*Math.cos(t),magZ:-41+Math.sin(t*.7),quatX:0,quatY:0,quatZ:Math.sin(t*.05),quatW:Math.cos(t*.05),pressure,temperature:22.3+.4*Math.sin(t/12),humidity:48+2*Math.cos(t/10),gas:118000+5000*Math.sin(t/15),iaq:42+4*Math.sin(t/20),eco2:530+35*Math.sin(t/17),bvoc:.48+.06*Math.cos(t/19),headingError:.08,standardAltitude:trueHeight,bsecAccuracy:3});},20);
  message('Simulierte Daten – keine Hardware verbunden.');
}
function stopDemo(){if(demoTimer){clearInterval(demoTimer);demoTimer=null;ui.demo.textContent='Demo starten';setStatus('Nicht verbunden');message('Demo beendet.');}}

function drawChart(canvas, series, visible){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h} const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);const W=rect.width,H=rect.height,p={l:48,r:10,t:8,b:22};c.clearRect(0,0,W,H);
  let vals=[];visible.forEach(s=>series.forEach(([key])=>{const v=s[key];if(Number.isFinite(v))vals.push(v)})); if(!vals.length){c.fillStyle='#7595a1';c.fillText('Noch keine gültigen Daten',p.l,30);return}
  let min=Math.min(...vals),max=Math.max(...vals);if(min===max){min-=1;max+=1}const pad=(max-min)*.12;min-=pad;max+=pad;
  c.strokeStyle='#1a4352';c.fillStyle='#7595a1';c.font='11px system-ui';c.lineWidth=1;for(let i=0;i<4;i++){const y=p.t+(H-p.t-p.b)*i/3;c.beginPath();c.moveTo(p.l,y);c.lineTo(W-p.r,y);c.stroke();const label=(max-(max-min)*i/3).toFixed(Math.abs(max-min)<10?1:0);c.fillText(label,4,y+4)}
  // Keep a fixed 60-second axis. During the first minute the unused portion
  // stays empty instead of stretching a few samples across the full graph.
  const t1=visible[visible.length-1].received,t0=t1-WINDOW_MS;
  for(const [key,color] of series){c.strokeStyle=color;c.lineWidth=1.7;c.beginPath();let drawing=false,lastT=0;for(const s of visible){const v=s[key],x=p.l+(s.received-t0)/Math.max(1,t1-t0)*(W-p.l-p.r),y=p.t+(max-v)/(max-min)*(H-p.t-p.b);if(!Number.isFinite(v)){drawing=false;continue}if(!drawing||s.received-lastT>150){c.moveTo(x,y);drawing=true}else c.lineTo(x,y);lastT=s.received}c.stroke()}
  c.fillStyle='#7595a1';c.fillText('−60 s',p.l,H-5);c.fillText('jetzt',W-38,H-5);
}

function repaint(){
  repaintHandle=setTimeout(repaint,100);
  try {
  if(!paused){const latest=samples[samples.length-1];if(latest){
    ui.altitude.textContent=fmt(latest.altitude,1);ui.relativeAltitude.textContent=`Relativ: ${fmt(latest.relativeAltitude,1)} m`;ui.vario.textContent=fmt(latest.vario,1);ui.pressure.textContent=fmt(latest.pressure,1);ui.temperature.textContent=fmt(latest.temperature,1);ui.humidity.textContent=fmt(latest.humidity,1);ui.rate.textContent=(packetTimes.length/2).toFixed(0);ui.lost.textContent=lost;
    ui.filterMode.textContent=filter.mode;
    ui.magX.textContent=fmt(latest.magX,1);ui.magY.textContent=fmt(latest.magY,1);ui.magZ.textContent=fmt(latest.magZ,1);
    ui.gas.textContent=fmt(latest.gas,0);ui.iaq.textContent=fmt(latest.iaq,0);ui.eco2.textContent=fmt(latest.eco2,0);ui.bvoc.textContent=fmt(latest.bvoc,2);ui.quat.textContent=[latest.quatX,latest.quatY,latest.quatZ,latest.quatW].map(x=>fmt(x,3)).join(' / ');ui.bsec.textContent=fmt(latest.bsecAccuracy,0);
    const visible=samplesInWindow(samples,latest.received,WINDOW_MS);for(const [id,defs] of Object.entries(chartDefs))drawChart($(id),defs,visible);
  }}
  if(!demoTimer&&device?.gatt?.connected){
    if(lastPacketAt&&Date.now()-lastPacketAt>STALE_MS){setStatus('Daten veraltet','error');ui.vario.textContent='–';}
    else if(!lastPacketAt&&connectedAt&&Date.now()-connectedAt>3000){setStatus('Keine Daten','error');message('Verbunden, aber keine gültigen Pakete. Nicla neu starten und Bluetooth erneut verbinden.',true);}
  }
  } catch(error) { message(`Anzeigefehler: ${error.message}`,true); }
}

function requantify(){const nextQnh=Number(ui.qnh.value);if(!(nextQnh>=800&&nextQnh<=1100)){message('QNH muss zwischen 800 und 1100 hPa liegen.',true);return}qnh=nextQnh;try{localStorage.setItem('qnh',qnh);}catch{}for(const s of samples)s.altitude=altitudeFromPressure(s.pressure,qnh);message(`QNH ${qnh.toFixed(1)} hPa übernommen.`);}
function zero(){const p=samples[samples.length-1]?.pressure;if(Number.isFinite(p)){zeroPressure=p;for(const s of samples)s.relativeAltitude=altitudeFromPressure(s.pressure,p);message('Relative Höhe auf 0 m gesetzt.')}else message('Zum Nullen wird zuerst ein gültiger Druckwert benötigt.',true);}
async function exportCsv(){if(!samples.length){message('Noch keine Daten zum Exportieren.',true);return}const columns=['time','sequence','millis',...fields,'altitude','relativeAltitude','vario'];const rows=[columns.join(',')];for(const s of samples)rows.push(columns.map(k=>k==='time'?new Date(s.epoch).toISOString():(Number.isFinite(s[k])?s[k]:'')).join(','));const file=new File([rows.join('\n')],`ez-vario-${new Date().toISOString().replaceAll(':','-')}.csv`,{type:'text/csv'});if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'EZ-Vario Messdaten'});else{const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}message(`${samples.length} Messwerte exportiert.`);}

ui.connect.onclick=connect;ui.demo.onclick=()=>demoTimer?stopDemo():startDemo();ui.qnh.onchange=requantify;ui.zero.onclick=zero;ui.pause.onclick=()=>{paused=!paused;ui.pause.textContent=paused?'Ansicht fortsetzen':'Ansicht pausieren';};ui.export.onclick=()=>exportCsv().catch(e=>message(e.message,true));
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});repaint();
