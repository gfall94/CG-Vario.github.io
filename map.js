import {tileArea,distanceMeters} from './gps.js?v=16';
const preference=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const savePreference=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
const CACHE='cg-terrain-tiles-v1',BASE='https://a.tile.opentopomap.org/';
export class FlightMap{
 constructor(){this.map=null;this.generation=0;this.center=null;this.radius=Math.max(.5,Math.min(20,Number(preference('cgMapRadius',3))||3));this.showTrail=preference('cgMapTrail','true')!=='false';this.follow=true;this.lastPoint=null;this.initialViewPending=true;}
 init(){if(this.map||!globalThis.L)return;const L=globalThis.L;this.map=L.map('gpsMap',{zoomControl:true,zoomSnap:.1}).setView([47,11],13);
 const Tiles=L.GridLayer.extend({createTile:(coords,done)=>{const img=document.createElement('img');img.alt='';img.width=img.height=256;let objectUrl;
 this.tile(coords).then(blob=>{objectUrl=URL.createObjectURL(blob);img.onload=()=>{URL.revokeObjectURL(objectUrl);done(null,img);};img.onerror=()=>{URL.revokeObjectURL(objectUrl);done(Error('Kachel fehlt'),img);};img.src=objectUrl;}).catch(e=>done(e,img));return img;}});
 new Tiles({minZoom:3,maxZoom:16,keepBuffer:4,attribution:'Kartendaten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Darstellung © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'}).addTo(this.map);
 this.marker=L.circleMarker([47,11],{radius:7,color:'#fff',weight:2,fillColor:'#28ae98',fillOpacity:1});this.trail=L.polyline([],{color:'#ff9866',weight:3}).addTo(this.map);L.control.scale({imperial:false}).addTo(this.map);
 this.map.on('dragstart',()=>{this.follow=false;});}
 async tile(c){const url=`${BASE}${c.z}/${c.x}/${c.y}.png`;let cache;try{cache=await caches.open(CACHE);const hit=await cache.match(url);if(hit)return hit.blob();}catch{}
 const response=await fetch(url,{mode:'cors'});if(!response.ok)throw Error('Karte nicht erreichbar');if(cache)try{await cache.put(url,response.clone());}catch{}return response.blob();}
 async prefetch(p){let cache;try{cache=await caches.open(CACHE);}catch{this.report('Lokaler Kartenpuffer in diesem Browser nicht verfügbar.');return;}const generation=++this.generation,tiles=tileArea(p.lat,p.lon,this.radius);if(tiles.length>700){this.report('Radius zu groß für diese Breite; bitte verkleinern.');return;}this.center={...p};let ok=0,failed=0;
 for(const c of tiles){if(generation!==this.generation)return;try{await this.tile(c);if(await cache.match(`${BASE}${c.z}/${c.x}/${c.y}.png`))ok++;else failed++;}catch{failed++;}this.report(`Puffer ${this.radius} km · ${ok}/${tiles.length} Kacheln${failed?' · '+failed+' fehlen':''}`);await new Promise(r=>setTimeout(r,100));}
 if(generation===this.generation){this.report(failed?`Puffer unvollständig · ${failed} Kacheln fehlen`:`${this.radius} km gepuffert · Zoom 10–13`);try{const cache=await caches.open(CACHE),keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-1500)))await cache.delete(key);}catch{}}
 }
 report(text){document.getElementById('mapCacheStatus').textContent=text;}
 update(p,segments){this.init();if(!this.map)return;this.lastPoint=p;this.initialView();this.marker.setLatLng([p.lat,p.lon]);if(!this.map.hasLayer(this.marker))this.marker.addTo(this.map);this.trail.setLatLngs(this.showTrail?segments:[]);if(this.follow)this.map.panTo([p.lat,p.lon],{animate:false});if(!this.center||distanceMeters(this.center,p)>this.radius*1000/3)this.prefetch(p);}
 initialView(){if(!this.initialViewPending||!this.map||!this.lastPoint)return;const size=this.map.getSize();if(size.x<=0||size.y<=0)return;const p=this.lastPoint,dy=2/111.195,dx=dy/Math.max(.01,Math.cos(p.lat*Math.PI/180));this.map.fitBounds([[p.lat-dy,p.lon-dx],[p.lat+dy,p.lon+dx]],{animate:false,padding:[0,0],maxZoom:16});this.initialViewPending=false;}
 visible(){if(this.map){this.map.invalidateSize();this.initialView();}}
 recenter(){this.follow=true;if(this.lastPoint&&this.map)this.map.panTo([this.lastPoint.lat,this.lastPoint.lon]);}
 setRadius(value){if(!Number.isFinite(value)||value<.5||value>20)return;this.radius=value;savePreference('cgMapRadius',value);if(this.lastPoint)this.prefetch(this.lastPoint);}
 setTrail(value,segments){this.showTrail=value;savePreference('cgMapTrail',String(value));if(this.trail)this.trail.setLatLngs(value?segments:[]);}
}
