// Análisis de juego: hace jugar una partida larga con un estilo dado y resume cada oleada
// (duración, daño recibido, disparos y bajas), además de las muertes y la oleada máxima.
//
// Uso:  npx vite --port 5199 &   y luego   node tools/gameplay.cjs <estilo> [segundos]
// Estilos:
//   bot    piloto automático completo (dispara, huye, se cubre)
//   stand  se queda quieto y solo dispara
//   punch  solo puñetazos
// Salida por oleada: o<número>:<duración>s d<daño> s<disparos> k<bajas>
// Requiere Playwright con Chromium disponible en el entorno.
const { chromium } = require('playwright');
const MODE=process.argv[2]||'bot', SECS=+process.argv[3]||360;
(async()=>{
  const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
  const p=await b.newPage({viewport:{width:600,height:400}});
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto(process.env.GAME_URL || 'http://localhost:5199/');
  await p.waitForFunction(()=>window.__game,null,{timeout:60000});
  const r=await p.evaluate(({MODE,SECS})=>{const g=window.__game; g.renderer.setAnimationLoop(null);g.renderer.render=()=>{};g.input.touchMode=true;g.input.started=true;
    const dt=1/60,P=g.player,H=g.horde,A=g.autopilot;
    const waves=[];let cur=null,lastHealth=100,lastShots=0,lastKills=0,deaths=[],t=0,minHealth=100,firstContact=null;
    // Munición infinita y pistola desde el principio, como en los análisis anteriores.
    if(MODE==='bot'){g.input.pressed.add('KeyP');} else {P.infiniteAmmo=true;P.pickUp('pistola',0);H.start();}
    let wasActive=false;
    for(let f=0;f<SECS*60;f++){
      if(MODE!=='bot'){ // jugador simple
        if(!H.active){H.start();}
        let tgt=null,best=1e9;for(const z of H.zombies){if(!z.alive)continue;const d=z.position.distanceTo(P.position);if(d<best){best=d;tgt=z}}
        g.input.buttons.delete(0);g.input.auto={x:0,z:0,run:false};
        if(tgt){
          if(MODE==='stand'){const e=A.aimAt(tgt.position.x,tgt.position.y+1.15,tgt.position.z,dt);if(e<0.06&&best<25&&A.clearShot(tgt))g.input.buttons.add(0);}
          if(MODE==='punch'){A.aimAt(tgt.position.x,tgt.position.y+1.15,tgt.position.z,dt);const dx=tgt.position.x-P.position.x,dz=tgt.position.z-P.position.z;if(best>1.2)A.moveWorld(dx,dz,true);else{P.facing=Math.atan2(dx,dz);if(f%45===0)g.input.pressed.add('KeyF');}}
        }
      }
      g.tick(dt);t+=dt;
      if(H.wave&&(!cur||cur.n!==H.wave||(!wasActive&&H.active))){cur={n:H.wave,start:t,dmg:0,shots:0,kills:0,firstBite:null};waves.push(cur);lastShots=P.shots;lastKills=H.kills;}
      if(cur){ if(P.health<lastHealth-0.5){cur.dmg+=lastHealth-P.health;if(cur.firstBite===null)cur.firstBite=+(t-cur.start).toFixed(1);}
        cur.shots+=P.shots-lastShots;cur.kills+=Math.max(0,H.kills-lastKills);cur.end=t;}
      if(wasActive&&!H.active&&lastHealth<50){deaths.push({wave:cur?.n,t:+t.toFixed(0)});}
      wasActive=H.active;lastHealth=P.health;lastShots=P.shots;lastKills=H.kills;minHealth=Math.min(minHealth,P.health);
    }
    return {deaths,maxWave:Math.max(...waves.map(w=>w.n)),waves:waves.map(w=>({n:w.n,dur:+(w.end-w.start).toFixed(1),dmg:Math.round(w.dmg),shots:w.shots,kills:w.kills,bite:w.firstBite})),acts:MODE==='bot'?A.stats:null};
  },{MODE,SECS});
  console.log(MODE,'maxWave',r.maxWave,'deaths',JSON.stringify(r.deaths),JSON.stringify(r.acts));
  console.log(r.waves.map(w=>`o${w.n}:${w.dur}s d${w.dmg} s${w.shots} k${w.kills}`).join(' | '));
  await b.close();
})();
