import {encodeCommand} from '../protocol.js';
export const defaults={qnh:1013.25,baroSigma:1.5,accelTau:.12,responseTau:.55,averageSeconds:10,processNoise:.08,climbThreshold:.2,sinkThreshold:-1.5};
[[120,0,0],[180,0,0],[270,0,0],[500,300,400],[760,250,350],[870,220,280],[1090,180,200],[1750,100,100],[2400,60,60]].forEach(([p,l,a],i)=>Object.assign(defaults,{[`pitch${i}`]:p,[`length${i}`]:l,[`pause${i}`]:a}));
export function acknowledgement(request=0,settings=defaults,result=0){const b=encodeCommand(result,request,{...defaults,...settings});new DataView(b).setUint8(1,83);return b;}
