export const SERVICE_UUID='a6e90001-7a25-4b48-9c6d-4f5b108a0001';
export const CHARACTERISTIC_UUID='a6e90002-7a25-4b48-9c6d-4f5b108a0001';
export const CONTROL_UUID='a6e90003-7a25-4b48-9c6d-4f5b108a0001';
export const VERSION=3, PACKET_SIZE=176;
export const fields=['accE','accN','accU','linearE','linearN','linearU','gyroX','gyroY','gyroZ','magX','magY','magZ','quatX','quatY','quatZ','quatW','pressure','temperature','humidity','gas','iaq','eco2','bvoc','headingError','standardAltitude','bsecAccuracy','vario','average','altitude','relativeAltitude','maxClimb','maxSink','maxAltitude','flightSeconds','accelBias','speedSigma','toneHz','tonePeriod','toneOn'];
export const AUDIO_SPEEDS=[-10,-5,-2,0,.5,1,2,5,10];
export const settingFields=['qnh','baroSigma','accelTau','responseTau','averageSeconds','processNoise','climbThreshold','sinkThreshold',...AUDIO_SPEEDS.flatMap((_,i)=>[`pitch${i}`,`length${i}`,`pause${i}`])];
export const CONTROL_SIZE=148;
const viewOf=input=>input instanceof DataView?input:new DataView(input.buffer??input,input.byteOffset??0,input.byteLength);
export function decodeTelemetry(input){
  const v=viewOf(input);
  if(v.byteLength<20)throw Error('Telemetriepaket zu kurz');
  if(v.getUint8(0)!==69||v.getUint8(1)!==90)throw Error('Ungültige Paketkennung');
  const version=v.getUint8(2),size=version===1?124:version===2?164:version===3?176:0;
  if(!size)throw Error(`Protokollversion ${version} wird nicht unterstützt`);
  if(v.byteLength!==size||v.getUint8(3)!==size)throw Error(`Paketlänge ${v.byteLength} statt ${size} Byte`);
  const s={version,sequence:v.getUint32(4,true),millis:v.getUint32(8,true),present:v.getUint16(12,true),valid:v.getUint16(14,true),fresh:v.getUint16(16,true),status:v.getUint16(18,true)};
  fields.forEach((key,i)=>s[key]=20+4*i<size?v.getFloat32(20+4*i,true):NaN);
  // The legacy firmware has no on-device vario. Never silently recreate it here.
  if(version===1)s.status=0;
  return s;
}
export function encodeCommand(opcode,request,settings={}){
  const b=new ArrayBuffer(CONTROL_SIZE),v=new DataView(b);
  v.setUint8(0,69);v.setUint8(1,67);v.setUint8(2,2);v.setUint8(3,opcode);v.setUint16(4,request,true);
  settingFields.forEach((key,i)=>v.setFloat32(8+4*i,settings[key]??0,true));
  return b;
}
export function decodeSettings(input){
  const v=viewOf(input);
  if(v.byteLength!==CONTROL_SIZE||v.getUint8(0)!==69||v.getUint8(1)!==83||v.getUint8(2)!==2)throw Error('Neue Nicla-Firmware für gespeicherte Einstellungen und Audio erforderlich.');
  const s={result:v.getUint8(3),request:v.getUint16(4,true),revision:v.getUint16(6,true)};
  settingFields.forEach((key,i)=>{s[key]=v.getFloat32(8+4*i,true);if(!Number.isFinite(s[key]))throw Error('Ungültiger Einstellwert');});
  validateSettings(s);
  return s;
}
export function isCommandEcho(input){const v=viewOf(input);return v.byteLength>=2&&v.getUint8(0)===69&&v.getUint8(1)===67;}
export function validateSettings(s){
  const limits={qnh:[800,1100],baroSigma:[.3,3],accelTau:[.04,.4],responseTau:[.1,2],averageSeconds:[2,30],processNoise:[.02,1],climbThreshold:[.05,2],sinkThreshold:[-5,-.2]};
  for(const [key,[min,max]] of Object.entries(limits))if(!Number.isFinite(s[key])||s[key]<min-1e-6||s[key]>max+1e-6)throw Error(`Ungültiger Einstellwert: ${key}`);
  for(let i=0;i<AUDIO_SPEEDS.length;i++){
    const p=s[`pitch${i}`],l=s[`length${i}`],a=s[`pause${i}`];
    if(![p,l,a].every(Number.isFinite)||p<80||p>2500||(i<3?(l!==0||a!==0):(l<40||l>1000||a<40||a>1500)))throw Error('Audio-Profil: Werte außerhalb des zulässigen Bereichs.');
    if(i&&p<s[`pitch${i-1}`])throw Error('Die Tonhöhe muss mit der Steigrate gleich bleiben oder steigen.');
    if(i>3&&l+a>s[`length${i-1}`]+s[`pause${i-1}`])throw Error('Mit stärkerem Steigen muss Tonlänge + Pause gleich bleiben oder kürzer werden.');
  }
}
export function sequenceGap(previous,current){if(previous==null)return 0;const d=(current-previous)>>>0;return d>0&&d<0x80000000?Math.max(0,d-1):0;}
export function samplesInWindow(samples,latest,window=60000){return samples.filter(s=>s.received>=latest-window&&s.received<=latest);}
