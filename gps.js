export function distanceMeters(a,b){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r;const h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export class GpsJourney{
 constructor(){this.reset();}
 reset(){this.distance=0;this.seconds=0;this.last=null;this.segments=[];this.breakPending=true;}
 pause(){this.last=null;this.breakPending=true;}
 update(p){const c=p.coords,point={lat:c.latitude,lon:c.longitude,time:p.timestamp,accuracy:c.accuracy};
 if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||!Number.isFinite(point.time)||!Number.isFinite(point.accuracy)||point.accuracy>50){this.pause();return false;}
 if(this.last){const dt=(point.time-this.last.time)/1000;if(dt<=0)return false;const d=distanceMeters(this.last,point);
 if(dt>15||d/dt>75){this.pause();}else{this.seconds+=dt;const threshold=Math.max(3,Math.min(15,(point.accuracy+this.last.accuracy)*.5));if(d>=threshold){this.distance+=d;this.last=point;this.segments.at(-1).push([point.lat,point.lon]);}else{this.last.time=point.time;}return true;}}
 this.last=point;this.segments.push([[point.lat,point.lon]]);return true;
 }
 get averageKmh(){return this.seconds>0?this.distance/this.seconds*3.6:0;}
}
export function tileArea(lat,lon,radiusKm,minZoom=10,maxZoom=13){
 const tiles=[],clamp=v=>Math.max(-85.0511,Math.min(85.0511,v)),x=(v,n)=>(v+180)/360*n,y=(v,n)=>{const r=clamp(v)*Math.PI/180;return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n;};
 const dy=radiusKm/111.195,dx=dy/Math.max(.01,Math.cos(lat*Math.PI/180));
 for(let z=minZoom;z<=maxZoom;z++){const n=2**z;for(let ix=Math.floor(x(lon-dx,n));ix<=Math.floor(x(lon+dx,n));ix++)for(let iy=Math.max(0,Math.floor(y(lat+dy,n)));iy<=Math.min(n-1,Math.floor(y(lat-dy,n)));iy++)tiles.push({z,x:((ix%n)+n)%n,y:iy});}
 return tiles;
}
