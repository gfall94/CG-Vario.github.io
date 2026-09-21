// Independent 3-state Kalman estimator: height, vertical speed, IMU bias.
// SI units. Device millis, not Bluetooth arrival intervals, drive prediction.
export class VarioFilter {
  constructor() { this.reset(); }
  reset() { this.x=null; this.time=null; this.lastBaro=null; this.output=NaN; this.mode='Warte auf Druck'; }
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
      const d2=dt*dt/2, a=imu?s.linearU-this.x[2]:0;
      this.x[0]+=this.x[1]*dt+a*d2; this.x[1]+=a*dt;
      const F=[[1,dt,imu?-d2:0],[0,1,imu?-dt:0],[0,0,1]];
      const P=this.P, next=Array.from({length:3},()=>[0,0,0]);
      for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)for(let l=0;l<3;l++)next[i][j]+=F[i][k]*P[k][l]*F[j][l];
      // Continuous white acceleration uncertainty, increased for baro-only mode.
      const q=imu?.5:4;
      next[0][0]+=q*dt**3/3; next[0][1]+=q*dt*dt/2; next[1][0]+=q*dt*dt/2; next[1][1]+=q*dt;
      next[2][2]+=.0004*dt; this.P=next;
    }
    if(fresh) {
      const P=this.P, R=.36, residual=s.standardAltitude-this.x[0], S=P[0][0]+R;
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
    // 150 ms display smoothing removes jitter while retaining acceleration response.
    this.output+=(1-Math.exp(-dt/.15))*(this.x[1]-this.output);
    return this.output;
  }
}
