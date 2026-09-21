// Independent 3-state Kalman estimator: height, vertical speed, IMU bias.
// SI units. Device millis, not Bluetooth arrival intervals, drive prediction.
export class VarioFilter {
  constructor() { this.reset(); }
  reset() { this.x=null; this.time=null; this.lastBaro=null; this.output=NaN; this.accel=NaN; this.mode='Warte auf Druck'; }
  update(s) {
    const baro=Boolean(s.valid & 32) && Number.isFinite(s.standardAltitude);
    const fresh=baro && Boolean(s.fresh & 32);
    const imu=Boolean(s.valid & 2) && Number.isFinite(s.linearU) && Math.abs(s.linearU)<40;
    if(this.time!==null && s.millis===this.time) return this.output;
    let dt=this.time===null?0:((s.millis-this.time)>>>0)/1000;
    if(dt>0.5) { this.reset(); dt=0; }
    this.time=s.millis;
    if(!this.x) {
      if(!baro) return NaN;
      this.x=[s.standardAltitude,0,0]; this.P=[[.36,0,0],[0,4,0],[0,0,.25]];
      this.lastBaro=s.millis; this.output=0;
    }
    if(dt>0) {
      if(imu) {
        if(!Number.isFinite(this.accel)) this.accel=s.linearU;
        // BHI linear acceleration is responsive but still contains vibration
        // and attitude jitter. This short low-pass removes those impulses.
        this.accel+=(1-Math.exp(-dt/.12))*(s.linearU-this.accel);
      } else this.accel=NaN;
      const d2=dt*dt/2, a=imu?this.accel-this.x[2]:0;
      this.x[0]+=this.x[1]*dt+a*d2; this.x[1]+=a*dt;
      const F=[[1,dt,imu?-d2:0],[0,1,imu?-dt:0],[0,0,1]];
      const P=this.P, next=Array.from({length:3},()=>[0,0,0]);
      for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)for(let l=0;l<3;l++)next[i][j]+=F[i][k]*P[k][l]*F[j][l];
      // Continuous white acceleration uncertainty, increased for baro-only mode.
      const q=imu?.08:.35;
      next[0][0]+=q*dt**3/3; next[0][1]+=q*dt*dt/2; next[1][0]+=q*dt*dt/2; next[1][1]+=q*dt;
      next[2][2]+=.00005*dt; this.P=next;
    }
    if(fresh) {
      // A single BMP390 altitude sample is deliberately treated as noisy.
      // Acceleration provides the fast response; pressure anchors the estimate.
      const P=this.P, R=2.25, residual=s.standardAltitude-this.x[0], S=P[0][0]+R;
      // Reject isolated pressure spikes; sustained absence eventually resets.
      if(Math.abs(residual)<Math.max(4,6*Math.sqrt(S))) {
        const K=P.map(row=>row[0]/S);
        this.x=this.x.map((v,i)=>v+K[i]*residual);
        // Joseph covariance update preserves symmetry and positive variance.
        const A=[[1-K[0],0,0],[-K[1],1,0],[-K[2],0,1]];
        this.P=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>{
          let v=K[i]*R*K[j];for(let k=0;k<3;k++)for(let l=0;l<3;l++)v+=A[i][k]*P[k][l]*A[j][l];return v;
        }));
        this.lastBaro=s.millis;
      }
    }
    if(((s.millis-this.lastBaro)>>>0)>1500) { this.reset(); return NaN; }
    this.mode=imu?'Höhe + Beschleunigung':'Nur Barometer';
    // Adaptive smoothing: calm air gets a stable display, while a real vertical
    // acceleration opens the filter for a prompt paraglider-vario response.
    const dynamic=imu && Math.abs(this.accel-this.x[2])>.35;
    const tau=dynamic?.10:.55;
    this.output+=(1-Math.exp(-dt/tau))*(this.x[1]-this.output);
    return this.output;
  }
}
