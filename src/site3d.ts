// The low-poly three.js view of a world. Injected into the world page; reads the same inlined D (frames, map, events, citizens).
// Loaded as an ES module from a CDN; if that fails the page keeps the 2D canvas map.
export const THREE_BASE = "https://cdn.jsdelivr.net/npm/three@0.160.0";
export const THREE_URL = `${THREE_BASE}/build/three.module.js`;
export const ORBIT_URL = `${THREE_BASE}/examples/jsm/controls/OrbitControls.js`;

export function scene3dScript(): string {
  return `
<script type="importmap">{"imports":{"three":${JSON.stringify(THREE_URL)},"three/addons/":${JSON.stringify(THREE_BASE + "/examples/jsm/")}}}</script>
<script type="module">
const D=window.__AP;const short=n=>{const p=n.split(" ");return p[0].endsWith(".")&&p[1]?p[0]+" "+p[1]:p[0]};
const host=document.getElementById("view3d"),status=document.getElementById("v3status");
let THREE,OrbitControls;
try{THREE=await import("three");({OrbitControls}=await import("three/addons/controls/OrbitControls.js"));}
catch(e){status.textContent="3D view unavailable offline (three.js could not be loaded) — the 2D map is shown instead.";document.getElementById("mode2d").click();throw e;}
status.textContent="";
const CHRON=D.mode==="chronicle";const FEW=D.citizens.length<=14;
const E=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// ---------- seed, palette, materials (toon-shaded paper look) ----------
const hash=s=>{let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0}return h};
let rs=hash(D.runId||"w");const rnd=()=>{rs=(rs+0x6d2b79f5)>>>0;let t=rs;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296};
const text=((D.premise||"")+" "+D.map.locations.map(l=>l.name+" "+l.tags.join(" ")).join(" ")).toLowerCase();
const isSea=/\\b(ship|deck|sea|boat|drift|harbou?r|packet|lifeboat)\\b/.test(text)&&!/\\bmine\\b/.test(text);
const biome=isSea?{ground:0x35606f,accent:0x4a7b8a,hill:0.0}:{ground:0x9fae6a,accent:0xb9c37e,hill:0.7};
const gradTex=(()=>{const c=document.createElement("canvas");c.width=5;c.height=1;const x=c.getContext("2d");[["#5a5a5a",0],["#8c8c8c",1],["#bdbdbd",2],["#e6e6e6",3],["#ffffff",4]].forEach(([col,i])=>{x.fillStyle=col;x.fillRect(i,0,1,1)});const t=new THREE.CanvasTexture(c);t.minFilter=THREE.NearestFilter;t.magFilter=THREE.NearestFilter;return t})();
const M=(c,o)=>new THREE.MeshToonMaterial(Object.assign({color:c,gradientMap:gradTex},o||{}));
const box=(w,h,d,c)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),M(c));m.castShadow=true;m.receiveShadow=true;return m};
// ---------- renderer ----------
const W=host.clientWidth||900,H=Math.round(W*(CHRON?0.58:0.56));
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.setSize(W,H);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.domElement.style.display="block";host.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xd8d3c4,140,420);
const camera=new THREE.PerspectiveCamera(38,W/H,0.5,1000);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*0.47;controls.minDistance=25;controls.maxDistance=300;controls.autoRotate=false;controls.enableZoom=false;
renderer.domElement.addEventListener("pointerdown",()=>{controls.enableZoom=true});renderer.domElement.addEventListener("pointerleave",()=>{controls.enableZoom=false});
const hemi=new THREE.HemisphereLight(0xfff1dc,0x6b6a4a,0.9);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffe4b8,1.5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-160,right:160,top:160,bottom:-160,near:1,far:500});sun.shadow.bias=-0.0006;sun.shadow.radius=4;scene.add(sun);
const ambient=new THREE.AmbientLight(0xffffff,0.18);scene.add(ambient);
// ---------- layout: a smaller, closer town ----------
const MW=960,MH=540;const LP={};const locs=D.map.locations,paths=D.map.paths;
(function(){const n=locs.length;const given=locs.every(l=>typeof l.x==="number");locs.forEach((l,i)=>{LP[l.id]=given?{x:l.x*MW,y:l.y*MH}:{x:MW/2+Math.cos(i/n*2*Math.PI-Math.PI/2)*MW*0.34,y:MH/2+Math.sin(i/n*2*Math.PI-Math.PI/2)*MH*0.36}});})();
const SCALE=FEW?0.27:0.36;const toW=p=>({x:(p.x-MW/2)*SCALE,z:(p.y-MH/2)*SCALE});
const ptype=l=>{const n=(l.name+" "+l.tags.join(" ")).toLowerCase();return /pit|mine|quarry|kiln|forge/.test(n)?"mine":/farm|field|orchard/.test(n)?"farm":/market|square|shop|store/.test(n)?"market":/tavern|inn|lamp|bar|pub/.test(n)||l.tags.includes("social")?"tavern":/chapel|church|temple/.test(n)?"chapel":l.tags.includes("home")||l.tags.includes("rest")?"home":l.tags.includes("exit")?"exit":"public"};
const PT={};for(const l of locs)PT[l.id]=ptype(l);
// ---------- ground and sky ----------
const gGeo=new THREE.PlaneGeometry(520,520,72,72);const pos=gGeo.attributes.position;
for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);const r=Math.hypot(x,y);let h=isSea?0:(Math.sin(x*0.05)*Math.cos(y*0.04)*2.2+Math.sin(x*0.13+y*0.09)*0.9)*biome.hill*(1+Math.max(0,(r-110))/70);pos.setZ(i,h)}
gGeo.computeVertexNormals();const ground=new THREE.Mesh(gGeo,M(biome.ground));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
let water=null;if(isSea){water=new THREE.Mesh(new THREE.PlaneGeometry(900,900,40,40),new THREE.MeshPhongMaterial({color:0x1b3f57,shininess:80,transparent:true,opacity:0.92,flatShading:true}));water.rotation.x=-Math.PI/2;water.position.y=-0.6;scene.add(water);}
const clouds=[];if(!isSea){for(let i=0;i<6;i++){const g=new THREE.Group();for(let k=0;k<3;k++){const c=new THREE.Mesh(new THREE.SphereGeometry(6+rnd()*6,7,5),M(0xfffaf0));c.scale.y=0.4;c.position.set(k*8-8,rnd()*2,rnd()*4);g.add(c)}g.position.set((rnd()-0.5)*400,64+rnd()*20,(rnd()-0.5)*400);g.userData.v=0.5+rnd()*0.6;scene.add(g);clouds.push(g)}}
const placeLabels=[];const plates={};const lampLights=[];const windows=[];const chimneys=[];const cropMat=M(0x6aa441);const spots={};const goods=[];const housesAt={};const homeOf={};
const sprite=(txt,size,fg,bg)=>{const c=document.createElement("canvas");const ctx=c.getContext("2d");ctx.font="600 26px system-ui,sans-serif";const w=Math.ceil(ctx.measureText(txt).width)+26;c.width=w;c.height=42;ctx.font="600 26px system-ui,sans-serif";ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(0,0,w,42,14);ctx.fill();ctx.fillStyle=fg;ctx.fillText(txt,13,30);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));s.scale.set(w/42*size*0.28,size*0.28,1);return s};
function house(seed,c,name){const g=new THREE.Group();const w=8+seed()*3,d=7+seed()*3,h=4.6+seed()*1.6;const b=box(w,h,d,c);b.position.y=h/2;g.add(b);const roof=new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*0.74,4,4),M([0xa8563c,0x8b4a3a,0x6f5a4a][Math.floor(seed()*3)]));roof.position.y=h+2;roof.rotation.y=Math.PI/4;roof.castShadow=true;g.add(roof);const ch=box(1.2,2.6,1.2,0x5a4a40);ch.position.set(w*0.3,h+2.6,0);g.add(ch);chimneys.push({g:ch,smoke:[]});const win=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.3,0.2),new THREE.MeshBasicMaterial({color:0x2a2a2a}));win.position.set(-w*0.25,h*0.55,d/2+0.1);g.add(win);windows.push(win);const door=box(1.7,2.8,0.3,0x4a3520);door.position.set(w*0.2,1.4,d/2+0.1);g.add(door);if(name){const s=sprite(name,9,"#3a2f24","rgba(255,250,240,0.92)");s.position.set(0,h+4.6,0);g.add(s)}return g}
function props(kind,P,seed){const g=new THREE.Group();const sp=[];const add=(m,x,y,z)=>{m.position.set(x,y,z);g.add(m)};
 if(kind==="mine"){const post=(x)=>{add(box(1.3,20,1.3,0x5a4634),x,10,-6)};post(-3.5);post(3.5);add(box(9.5,1.3,1.5,0x5a4634),0,19.5,-6);const wheel=new THREE.Mesh(new THREE.TorusGeometry(2.8,0.45,6,14),M(0x3a3a3a));wheel.position.set(0,19.5,-6);g.add(wheel);const mouth=new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.5,1.2,8),M(0x1b1a18));add(mouth,0,0.6,-6);for(let i=0;i<2;i++){add(box(3,1.8,2,0x4d4238),9+i*4,2.1,4);const ore=new THREE.Mesh(new THREE.DodecahedronGeometry(1),M(0x8a8a8a));add(ore,9+i*4,3.3,4)}add(box(11,0.3,0.4,0x666),11,1.2,3);add(box(11,0.3,0.4,0x666),11,1.2,5);
  sp.push({x:-3,z:-2,do:"swing"},{x:3,z:-1,do:"swing"},{x:0,z:2,do:"swing"},{x:8,z:7,do:"carry"},{x:-7,z:4,do:"swing"},{x:6,z:-2,do:"sell"})}
 else if(kind==="farm"){for(let r=0;r<4;r++)for(let k=0;k<8;k++){const c=new THREE.Mesh(new THREE.BoxGeometry(1,1.2,1),cropMat);c.position.set(-13+k*3.6,0.9,-3+r*3.6);c.castShadow=true;g.add(c)}for(let k=0;k<9;k++)add(box(0.45,2.2,0.45,0x8a7050),-19+k*4.6,1.1,-8);add(box(42,0.3,0.4,0x8a7050),-0.6,1.9,-8);for(let r=0;r<3;r++)sp.push({x:-11+r*7,z:-1+r*3,do:"hoe"});sp.push({x:9,z:10,do:"carry"},{x:-14,z:8,do:"talk"})}
 else if(kind==="market"){const cols=[0xb33a2e,0x2f6f8f,0xd1a13a];for(let i=0;i<3;i++){const x=-12+i*12;add(box(7,2.4,3,0x8a6a4a),x,1.2,2);for(const [dx,dz] of [[-3.2,-1.4],[3.2,-1.4],[-3.2,1.4],[3.2,1.4]])add(box(0.4,6.4,0.4,0x6a5040),x+dx,3.2,2+dz);const aw=new THREE.Mesh(new THREE.BoxGeometry(8.6,0.3,4.6),M(cols[i]));aw.position.set(x,6.4,2);aw.rotation.x=0.15;aw.castShadow=true;g.add(aw);const cr=box(1.8,1.8,1.8,0x9a7a52);add(cr,x+4.5,0.9,6);goods.push(cr);const gd=box(4.4,0.7,1.4,[0xd9c27a,0xb04a3a,0x6fa04a][i]);add(gd,x,2.8,2);goods.push(gd);sp.push({x:x,z:-1.5,do:"sell"},{x:x-1.4,z:5.5,do:"browse"},{x:x+1.4,z:6,do:"browse"})}
  add(box(9,2.8,2.8,0x6a5a4a),0,1.4,-13);add(box(10,0.5,3.6,0x4a3a2a),0,3,-13);for(let q=0;q<6;q++)sp.push({x:-2+q*2.4,z:-8.5+q*0.5,do:"queue",face:Math.PI});const tb=new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.4,0.5,8),M(0x6a4a30));add(tb,14,2.4,10);add(box(0.7,2.4,0.7,0x5a4030),14,1.2,10);for(const a of [0,1,2,3]){const bn=box(2.8,0.5,1.1,0x7a5a3a);bn.position.set(14+Math.cos(a*Math.PI/2)*5.2,1.5,10+Math.sin(a*Math.PI/2)*5.2);bn.rotation.y=-a*Math.PI/2;g.add(bn);sp.push({x:14+Math.cos(a*Math.PI/2)*5.2,z:10+Math.sin(a*Math.PI/2)*5.2,do:"sit",face:Math.atan2(-Math.cos(a*Math.PI/2),-Math.sin(a*Math.PI/2))})}}
 else if(kind==="tavern"){const tb=new THREE.Mesh(new THREE.CylinderGeometry(3.6,3.6,0.5,8),M(0x6a4a30));add(tb,0,2.4,8);add(box(0.7,2.4,0.7,0x5a4030),0,1.2,8);for(const a of [0,1,2,3]){const bn=box(2.8,0.5,1.1,0x7a5a3a);bn.position.set(Math.cos(a*Math.PI/2)*5.4,1.5,8+Math.sin(a*Math.PI/2)*5.4);bn.rotation.y=-a*Math.PI/2;g.add(bn);sp.push({x:Math.cos(a*Math.PI/2)*5.4,z:8+Math.sin(a*Math.PI/2)*5.4,do:"sit",face:Math.atan2(-Math.cos(a*Math.PI/2),-Math.sin(a*Math.PI/2))})}sp.push({x:-9,z:2,do:"talk"},{x:-7,z:4,do:"talk"},{x:9,z:3,do:"talk"})}
 else if(kind==="chapel"){const sp2=new THREE.Mesh(new THREE.ConeGeometry(2.2,12,5),M(0x4b3f36));add(sp2,0,12,-13);add(box(0.5,2.6,0.5,0xd9c27a),0,18.5,-13);for(let r=0;r<3;r++){add(box(9,0.5,1,0x7a5a3a),0,1.5,2+r*2.8);sp.push({x:-2.5,z:2+r*2.8,do:"pray"},{x:2.5,z:2+r*2.8,do:"pray"})}}
 else if(kind==="home"){const wp=box(1.3,1.1,1.3,0x8a6a3a);add(wp,12,0.55,6);sp.push({x:12,z:9,do:"chop"});const line=box(12,0.15,0.15,0xddd);add(line,-5,4.6,11);for(let k=0;k<4;k++){const sh=box(1.5,2,0.1,[0xe8e0d0,0xc9d8ea,0xe8c9a6,0xd8e0c0][k]);add(sh,-9.5+k*3,3.5,11)}for(let i=0;i<5;i++)sp.push({x:-12+i*6,z:3+(i%2)*2,do:"talk"})}
 else{for(let i=0;i<4;i++)sp.push({x:-8+i*5.5,z:3,do:"talk"})}
 g.position.set(P.x,2,P.z);scene.add(g);return sp.map(s=>({x:P.x+s.x,z:P.z+s.z,do:s.do,face:s.face}))}
// homes: every named household gets its own house, with its name on it
const households={};const placed={};for(const c of D.citizens){const hm=(D.homes&&D.homes[c.id])||D.home[c.id];if(!hm)continue;households[hm]=households[hm]||[];if(placed[c.id])continue;const hh={ids:[c.id]};placed[c.id]=true;if(c.partner&&!placed[c.partner]){const p=D.citizens.find(o=>o.id===c.partner);const phm=p&&((D.homes&&D.homes[p.id])||D.home[p.id]);if(p&&phm===hm){hh.ids.push(p.id);placed[p.id]=true}}households[hm].push(hh)}
for(const l of locs){const P=toW(LP[l.id]);const kind=PT[l.id];const plate=new THREE.Mesh(new THREE.CylinderGeometry(32,34,2,10),M(isSea?0x7d6a52:kind==="farm"?0x9a8a58:biome.accent));plate.position.set(P.x,1,P.z);plate.receiveShadow=true;scene.add(plate);plates[l.id]=plate;
 const hh=households[l.id]||[];const n=Math.max(hh.length,kind==="home"?2:1);
 if(kind!=="mine"&&kind!=="farm"||hh.length){for(let i=0;i<n;i++){const ids=hh[i]?hh[i].ids:[];const hcol=kind==="mine"?0x6e665c:kind==="tavern"?0xc9a15c:kind==="market"?0xd9c7a8:kind==="chapel"?0xe8e0d0:kind==="farm"?0xb59a72:[0xe6d5b8,0xd9c9a3,0xe2cfb2,0xd6c4a5][i%4];const name=ids.length?ids.map(id=>short(D.citizens.find(c=>c.id===id).name)).join(" & "):null;const h=house(rnd,hcol,FEW?name:null);const span=Math.min(14,44/Math.max(1,n));h.position.set(P.x+(i-(n-1)/2)*span,2,P.z-15+(i%2)*4);h.rotation.y=(rnd()-0.5)*0.25;scene.add(h);(housesAt[l.id]=housesAt[l.id]||[]).push(h);for(const id of ids)homeOf[id]={x:h.position.x,z:h.position.z+8}}}
 else{const h=house(rnd,kind==="mine"?0x6e665c:0xb59a72,null);h.position.set(P.x,2,P.z-15);scene.add(h);(housesAt[l.id]=housesAt[l.id]||[]).push(h)}
 spots[l.id]=props(kind,P,rnd);
 if(kind==="tavern"||kind==="home"||kind==="market"){const lamp=new THREE.PointLight(0xffb060,0,55,2);lamp.position.set(P.x,8,P.z+10);scene.add(lamp);lampLights.push(lamp)}
 const label=sprite(l.name,15,"rgba(58,47,36,0.95)","rgba(255,250,240,0.85)");label.material.sizeAttenuation=false;label.scale.multiplyScalar(0.0055);label.position.set(P.x,24,P.z);scene.add(label);placeLabels.push(label);}
for(const [a,b] of paths){const A=toW(LP[a]),B=toW(LP[b]);const len=Math.hypot(B.x-A.x,B.z-A.z);const road=new THREE.Mesh(new THREE.PlaneGeometry(len,5),M(isSea?0x9a8466:0xd6c39a));road.rotation.x=-Math.PI/2;road.rotation.z=-Math.atan2(B.z-A.z,B.x-A.x);road.position.set((A.x+B.x)/2,1.9,(A.z+B.z)/2);road.receiveShadow=true;scene.add(road)}
if(!isSea){for(let i=0;i<70;i++){const x=(rnd()-0.5)*440,z=(rnd()-0.5)*440;if(locs.some(l=>{const P=toW(LP[l.id]);return Math.hypot(P.x-x,P.z-z)<46}))continue;const t=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.6,0.9,4.5,5),M(0x6b4a2b));trunk.position.y=2.2;const crown=new THREE.Mesh(new THREE.SphereGeometry(3.5+rnd()*3,6,5),M([0x4f8a42,0x5a9a48,0x467a3e][i%3]));crown.position.y=7+rnd()*2;crown.scale.y=1.3;crown.castShadow=true;t.add(trunk,crown);t.position.set(x,0,z);scene.add(t)}
 for(let i=0;i<30;i++){const x=(rnd()-0.5)*480,z=(rnd()-0.5)*480;if(locs.some(l=>{const P=toW(LP[l.id]);return Math.hypot(P.x-x,P.z-z)<40}))continue;const r=new THREE.Mesh(new THREE.DodecahedronGeometry(1.4+rnd()*2),M(0x9a978c));r.position.set(x,1,z);r.scale.y=0.55;r.castShadow=true;scene.add(r)}}
// ---------- effects ----------
const FX={};const rainGeo=new THREE.BufferGeometry();const RN=2600;const rp=new Float32Array(RN*3);for(let i=0;i<RN;i++){rp[i*3]=(Math.random()-0.5)*500;rp[i*3+1]=Math.random()*120;rp[i*3+2]=(Math.random()-0.5)*500}rainGeo.setAttribute("position",new THREE.BufferAttribute(rp,3));
const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0xbfd8ee,size:0.5,transparent:true,opacity:0}));scene.add(rain);
const snow=new THREE.Points(rainGeo.clone(),new THREE.PointsMaterial({color:0xffffff,size:1.6,transparent:true,opacity:0}));scene.add(snow);
const swarm=new THREE.Points(new THREE.BufferGeometry().setAttribute("position",new THREE.BufferAttribute(new Float32Array(900*3).map((_,i)=>(Math.random()-0.5)*(i%3===1?30:200)),3)),new THREE.PointsMaterial({color:0x222222,size:1.2,transparent:true,opacity:0}));swarm.position.y=20;scene.add(swarm);
const aurora=new THREE.Mesh(new THREE.PlaneGeometry(700,120,40,6),new THREE.MeshBasicMaterial({color:0x4fe0a0,transparent:true,opacity:0,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));aurora.position.set(0,150,-260);scene.add(aurora);
const fire=new THREE.PointLight(0xff7a20,0,90,2);scene.add(fire);const fireP=new THREE.Points(new THREE.BufferGeometry().setAttribute("position",new THREE.BufferAttribute(new Float32Array(300*3).map((_,i)=>(Math.random()-0.5)*(i%3===1?40:24)),3)),new THREE.PointsMaterial({color:0xff9a3c,size:1.8,transparent:true,opacity:0}));scene.add(fireP);
// timeline: event fx + seeded ambient weather (each world has its own sky)
const timeline=[];for(const e of D.events)if(e.fired&&e.fx)timeline.push({fx:e.fx,from:e.at,to:e.at+(e.fxHours||3),where:e.where,label:e.headline});
const showers=1+Math.floor(rnd()*3);for(let i=0;i<showers;i++){const s=2+Math.floor(rnd()*66);timeline.push({fx:rnd()<0.8?"rain":"fog",from:s,to:s+2+Math.floor(rnd()*4),where:"all",label:"weather"})}
function active(h,f){return timeline.filter(t=>t.from<=h&&h<t.to)}
const skyDay=new THREE.Color(0xbfe0f5),skyDusk=new THREE.Color(0xe4a26a),skyNight=new THREE.Color(0x0d1626);
let shake=0,flash=0,quakeUntil=0;const fxNow=new Set();let fxLabel="";
function applyFx(h,dt,t,todOverride){const act=active(h);const names=new Set(act.map(a=>a.fx));fxLabel=act.filter(a=>a.label!=="weather").map(a=>a.fx+" — "+a.label).concat(act.filter(a=>a.label==="weather").map(a=>a.fx)).join(" · ");
 const want=(k,v)=>names.has(k)?v:0;
 rain.material.opacity+=(want("rain",0.55)+want("storm",0.85)-rain.material.opacity)*0.05;snow.material.opacity+=(want("snow",0.9)-snow.material.opacity)*0.05;swarm.material.opacity+=(want("swarm",0.9)-swarm.material.opacity)*0.05;aurora.material.opacity+=(want("aurora",0.55)-aurora.material.opacity)*0.02;fireP.material.opacity+=(want("fire",0.9)-fireP.material.opacity)*0.05;
 const p=rain.geometry.attributes.position.array;const speed=names.has("storm")?2.6:1.2;const wind=names.has("storm")?Math.sin(t*3)*1.2:0.15;for(let i=0;i<RN;i++){p[i*3+1]-=speed;p[i*3]+=wind;if(p[i*3+1]<0){p[i*3+1]=120;p[i*3]=(Math.random()-0.5)*500}}rain.geometry.attributes.position.needsUpdate=true;
 const sp=snow.geometry.attributes.position.array;for(let i=0;i<RN;i++){sp[i*3+1]-=0.25;sp[i*3]+=Math.sin(t+i)*0.05;if(sp[i*3+1]<0)sp[i*3+1]=120}snow.geometry.attributes.position.needsUpdate=true;
 const wp=swarm.geometry.attributes.position.array;for(let i=0;i<900;i++){wp[i*3]+=Math.sin(t*2+i)*0.6;wp[i*3+1]+=Math.cos(t*1.7+i*0.3)*0.3;wp[i*3+2]+=Math.cos(t*2.3+i)*0.6}swarm.geometry.attributes.position.needsUpdate=true;
 aurora.material.color.setHSL((0.45+Math.sin(t*0.3)*0.1)%1,0.9,0.6);aurora.position.x=Math.sin(t*0.2)*40;
 const dist=camera.position.distanceTo(controls.target);const fogT=names.has("fog")?dist*1.25:names.has("storm")?dist*1.9:dist*2.6;scene.fog.far+=(fogT-scene.fog.far)*0.03;scene.fog.near+=((names.has("fog")?dist*0.55:dist*0.8)-scene.fog.near)*0.03;
 if(names.has("storm")&&Math.random()<0.012){flash=1}flash*=0.85;
 if(names.has("quake")){shake=Math.max(shake,1.4);if(quakeUntil<t){quakeUntil=t+0.6}}shake*=0.94;
 const fireAt=act.find(a=>a.fx==="fire");if(fireAt){const P=toW(LP[fireAt.where]||{x:MW/2,y:MH/2});fire.position.set(P.x,6,P.z);fireP.position.set(P.x,4,P.z);fire.intensity=1.6+Math.random()*1.2;const fp=fireP.geometry.attributes.position.array;for(let i=0;i<300;i++){fp[i*3+1]+=0.35;if(fp[i*3+1]>40)fp[i*3+1]=0}fireP.geometry.attributes.position.needsUpdate=true}else fire.intensity*=0.9;
 if(water){water.position.y+=((names.has("flood")?6:-0.6)-water.position.y)*0.02;const wp2=water.geometry.attributes.position.array;for(let i=0;i<wp2.length/3;i++){wp2[i*3+2]=Math.sin(t*1.5+wp2[i*3]*0.05)*Math.cos(t+wp2[i*3+1]*0.05)*(names.has("storm")?2.2:0.6)}water.geometry.attributes.position.needsUpdate=true;water.geometry.computeVertexNormals()}
 // sky + sun by hour of day; eclipse dims to red; silence desaturates
 const hod=todOverride!=null?todOverride:((h%24)+ (t%1))/24;const sunA=(todOverride!=null?(hod-0.10):(hod-0.25))*2*Math.PI;sun.position.set(Math.cos(sunA)*200,Math.sin(sunA)*180,60);const day=Math.max(0,Math.sin(sunA));const dusk=Math.max(0,1-Math.abs(day-0.15)*6);
 const sky=new THREE.Color().copy(skyNight).lerp(skyDay,day).lerp(skyDusk,dusk*0.6);if(names.has("eclipse")){sky.lerp(new THREE.Color(0x3a0a0a),0.8)}if(names.has("storm"))sky.lerp(new THREE.Color(0x3d4650),0.6);if(names.has("silence"))sky.lerp(new THREE.Color(0x9a9a9a),0.7);
 scene.background=sky;scene.fog.color.copy(sky);sun.intensity=(names.has("eclipse")?0.15:(0.25+day*1.6))*(names.has("storm")?0.5:1)+flash*3;sun.color.setHex(names.has("eclipse")?0xff3b1a:0xfff2d0);hemi.intensity=0.6+day*0.5+flash;
 for(const l of lampLights)l.intensity=(day<0.2?2.4:0)+(names.has("silence")?0.4:0);
 renderer.toneMappingExposure=names.has("silence")?0.7:1;}
// ---------- people: roles you can see, bodies that show their state ----------
const ROLE=r=>{const n=(r||"").toLowerCase();return /clerk|foreman|overseer/.test(n)?"clerk":/min|pit|quarry|digger/.test(n)?"miner":/farm|shepherd|field|hand/.test(n)?"farmer":/shop|keeper|merchant|trader|grocer/.test(n)?"shop":/publican|innkeep|tavern|brewer|bar/.test(n)?"publican":/doctor|nurse|physician|midwife/.test(n)?"doctor":/priest|parson|vicar|chapel/.test(n)?"priest":/soldier|guard|officer/.test(n)?"soldier":"villager"};
const LOOK={miner:{body:0x3b3d44,hat:"helmet"},clerk:{body:0x3f5f8f,hat:"cap"},farmer:{body:0x6f8f4a,hat:"straw"},shop:{body:0x8f5b3a,apron:0xe8dcc8},publican:{body:0x8a2f2f,apron:0xd9c7a8},doctor:{body:0xe8e6de,hat:"cap"},priest:{body:0x2b2b2b},soldier:{body:0x2b2f36,hat:"shako"},villager:{body:0x7a6a5a}};
const SKIN=[0xe8c9a6,0xd9b48a,0xc99a6e,0xb07d55,0x8a5a3a];
const COATS=[0x8a3b2f,0x2f5f8a,0x6a7a3a,0x8a6a2a,0x5a3a6a,0x3a6a6a,0x9a5a3a,0x4a4a7a,0x7a4a4a,0x3a5a3a,0xa06a8a,0x6a5a3a];
const HAIR=[0x2a1d14,0x5a3a22,0x8a6a3a,0xc9a36a,0x4a4a4a,0x9a9a9a];
function makeFigure(c,scale,look){const role=ROLE(c&&c.role);const L=look||LOOK[role]||LOOK.villager;const coat=look?L.body:COATS[hash((c&&c.id)||"x")%COATS.length];const g=new THREE.Group();const pivot=new THREE.Group();g.add(pivot);
 const mat=M(coat);const body=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.25,3.0,8),mat);body.position.y=2.6;body.castShadow=true;pivot.add(body);const shoulders=new THREE.Mesh(new THREE.SphereGeometry(1.05,8,6),mat);shoulders.position.y=4.0;shoulders.scale.y=0.55;pivot.add(shoulders);
 const legs=[];for(const sgn of [-1,1]){const hip=new THREE.Group();hip.position.set(sgn*0.5,1.2,0);const lg=new THREE.Mesh(new THREE.CylinderGeometry(0.38,0.34,1.3,6),M(role==="soldier"?0x1a1c22:0x3a3028));lg.position.y=-0.6;lg.castShadow=true;hip.add(lg);pivot.add(hip);legs.push(hip)}
 const skin=SKIN[hash(((c&&c.id)||"x")+"s")%SKIN.length];const head=new THREE.Mesh(new THREE.SphereGeometry(1.0,9,7),M(skin));head.position.y=5.1;head.castShadow=true;pivot.add(head);
 const hair=new THREE.Mesh(new THREE.SphereGeometry(1.06,9,7,0,Math.PI*2,0,Math.PI*0.55),M(c&&c.age>=60?0xbdbdbd:HAIR[hash(((c&&c.id)||"x")+"h")%HAIR.length]));hair.position.y=5.15;pivot.add(hair);
 if(L.apron){const ap=box(1.5,2.0,0.45,L.apron);ap.position.set(0,2.5,0.95);pivot.add(ap)}
 if(L.hat==="helmet"){const h=new THREE.Mesh(new THREE.SphereGeometry(1.12,8,5,0,Math.PI*2,0,Math.PI/2),M(0xd9c27a));h.position.y=5.3;pivot.add(h);const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.28,5,4),new THREE.MeshBasicMaterial({color:0xfff2a0}));lamp.position.set(0,5.7,0.95);pivot.add(lamp)}
 else if(L.hat==="straw"){const h=new THREE.Mesh(new THREE.CylinderGeometry(2.1,2.1,0.22,9),M(0xd8c27a));h.position.y=5.75;pivot.add(h);const top=new THREE.Mesh(new THREE.CylinderGeometry(0.95,1.05,0.9,8),M(0xd8c27a));top.position.y=6.1;pivot.add(top)}
 else if(L.hat==="cap"){const h=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,0.6,9),M(role==="doctor"?0xffffff:0x2b3a52));h.position.y=6.0;pivot.add(h)}
 else if(L.hat==="shako"){const h=new THREE.Mesh(new THREE.CylinderGeometry(0.95,1.05,1.7,8),M(0x1a1c22));h.position.y=6.4;pivot.add(h)}
 const arms=[];for(const sgn of [-1,1]){const sh=new THREE.Group();sh.position.set(sgn*1.25,4.0,0);const a=new THREE.Mesh(new THREE.CylinderGeometry(0.27,0.3,2.3,6),M(coat));a.position.y=-1.1;a.castShadow=true;sh.add(a);const hand=new THREE.Mesh(new THREE.SphereGeometry(0.32,6,5),M(skin));hand.position.y=-2.3;sh.add(hand);pivot.add(sh);arms.push(sh)}
 const trim=new THREE.Mesh(new THREE.TorusGeometry(1.15,0.16,5,12),new THREE.MeshBasicMaterial({color:0xffd54a}));trim.rotation.x=Math.PI/2;trim.position.y=4.1;trim.visible=false;pivot.add(trim);
 const tool=new THREE.Group();tool.visible=false;pivot.add(tool);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(2,0.22,6,18),new THREE.MeshBasicMaterial({color:0xffd27a}));ring.rotation.x=Math.PI/2;ring.position.y=0.15;ring.visible=false;g.add(ring);
 let tag=null;if(c&&FEW){tag=sprite(short(c.name),12,"#3a2f24","rgba(255,250,240,0.9)");tag.material.sizeAttenuation=false;tag.scale.multiplyScalar(0.0062);tag.position.y=7.6;g.add(tag)}
 g.scale.setScalar(scale||1);g.userData={mat,ring,pivot,arms,legs,tool,head,trim,body,tag};scene.add(g);return g}
function giveTool(g,kind){const t=g.userData.tool;while(t.children.length)t.remove(t.children[0]);t.visible=true;if(kind==="pick"){const h=box(0.35,4,0.35,0x6b4a2b);h.position.set(1.5,2.8,1.2);h.rotation.x=-0.6;t.add(h);const hd=box(2.2,0.5,0.5,0x555);hd.position.set(1.5,4.7,2.4);t.add(hd)}else if(kind==="hoe"){const h=box(0.3,4.2,0.3,0x8a6a3a);h.position.set(1.4,1.6,1.4);h.rotation.x=-0.9;t.add(h);const hd=box(1.4,0.3,0.5,0x555);hd.position.set(1.4,0.1,3.3);t.add(hd)}else if(kind==="sack"){const s=new THREE.Mesh(new THREE.SphereGeometry(1.3,6,5),M(0x9a8060));s.position.set(0,3.6,-1.3);s.scale.set(1,1.3,0.8);t.add(s)}else if(kind==="mug"){const m=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,0.8,6),M(0xb08a5a));m.position.set(1.7,2.2,1.4);t.add(m)}else if(kind==="axe"){const h=box(0.3,3.2,0.3,0x6b4a2b);h.position.set(1.5,2,1);h.rotation.x=-0.5;t.add(h);const hd=box(0.5,1.2,1,0x666);hd.position.set(1.5,3.4,1.8);t.add(hd)}else if(kind==="bag"){const b=box(1.4,1.2,0.8,0x3a2a1c);b.position.set(1.6,1.6,0.6);t.add(b)}else t.visible=false}
const figures=D.citizens.map((c)=>makeFigure(c,1));
// emoji sprites for the moments that matter — icons, not sentences
const ICON={theft:"💰",violence:"👊",betrayal:"🗡️",abandonment:"🚪",lie:"🤥",help:"❤️",gift:"🍞",rescue:"❤️",sacrifice:"🕊️",mercy:"🤝",justice:"⚖️",loyalty:"🛡️",death:"💀",birth:"👶",sick:"🤒",leave:"🎒",homeless:"🏚️",choice:"❓",marry:"💍"};
const iconCache={};function icon(ch){if(!iconCache[ch]){const c=document.createElement("canvas");c.width=96;c.height=96;const ctx=c.getContext("2d");ctx.beginPath();ctx.arc(48,48,44,0,Math.PI*2);ctx.fillStyle="rgba(255,253,248,0.92)";ctx.fill();ctx.font="58px system-ui,'Apple Color Emoji','Segoe UI Emoji',sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(ch,48,52);iconCache[ch]=new THREE.CanvasTexture(c)}const s=new THREE.Sprite(new THREE.SpriteMaterial({map:iconCache[ch],transparent:true,depthTest:false}));s.scale.set(5,5,1);return s}
// ---------- roads ----------
const adjL={};for(const [a,b] of paths){(adjL[a]=adjL[a]||[]).push(b);(adjL[b]=adjL[b]||[]).push(a)}
const routeCache={};function route(a,b){if(!a||!b)return [];if(a===b)return [a];const k=a+"|"+b;if(routeCache[k])return routeCache[k];const prev={[a]:null};const q=[a];while(q.length){const x=q.shift();if(x===b)break;for(const y of adjL[x]||[])if(!(y in prev)){prev[y]=x;q.push(y)}}let r=[];if(b in prev){for(let x=b;x;x=prev[x])r.unshift(x)}else r=[a,b];routeCache[k]=r;return r}
const plateP=id=>{const P=toW(LP[id]||{x:MW/2,y:MH/2});return {x:P.x,z:P.z+8}};
const doorOf=L=>homeOf[D.citizens[L.i].id]||plateP(L.home||publicLoc);
const publicLoc=(locs.find(l=>PT[l.id]==="market")||locs.find(l=>l.tags.includes("public"))||locs[0]).id;
const tavernLoc=(locs.find(l=>PT[l.id]==="tavern")||{id:publicLoc}).id;const chapelLoc=(locs.find(l=>PT[l.id]==="chapel")||{}).id;const farmLoc=(locs.find(l=>PT[l.id]==="farm")||{}).id;
function seatsFor(fr){const by={};D.citizens.forEach((c,i)=>{if(fr.at[i]==null)return;(by[fr.at[i]]=by[fr.at[i]]||[]).push(i)});const out={};for(const loc in by){const idx=by[loc].slice().sort((a,b)=>Number(D.citizens[b].named)-Number(D.citizens[a].named)||a-b);const P=toW(LP[loc]||{x:MW/2,y:MH/2});let k=0,ring=0;while(k<idx.length){const cap=ring===0?1:ring*6;const n=Math.min(cap,idx.length-k);for(let j=0;j<n;j++,k++){const a=(j/n)*2*Math.PI+ring*0.6;out[idx[k]]={x:P.x+Math.cos(a)*ring*7,z:P.z+8+Math.sin(a)*ring*7}}ring++}}return out}
const seatCache={};const seat=(i,h)=>{const fr=D.frames[Math.max(0,Math.min(D.frames.length-1,h-1))];if(!fr)return null;return (seatCache[h]||(seatCache[h]=seatsFor(fr)))[i]||null};
// ---------- life state ----------
const life=D.citizens.map((c,i)=>{const home=(D.homes&&D.homes[c.id]!==undefined?D.homes[c.id]:D.home[c.id])||null;const tr=c.traits||{sociable:0.5,bold:0.5,loyal:0.5,restless:0.5};return {i,role:ROLE(c.role),tr,home,here:home||publicLoc,pos:{...plateP(home||publicLoc)},path:[],target:null,mode:"idle",sick:false,starving:false,rich:false,shunned:false,down:0,gone:false,fade:1,speed:9,spot:null,doing:"stand",face:null,inside:false,actUntil:0,hit:0,flinch:0,glow:0,sprite:null,spriteUntil:0,jit:(hash(c.id+"j")%100)/100*0.06}});
const children=[];const graves=[];const soldiers=[];
function showIcon(L,ch,ms){const g=figures[L.i];if(L.sprite)g.remove(L.sprite);const s=icon(ch);s.position.y=8.6;g.add(s);L.sprite=s;L.spriteUntil=performance.now()+ms}
function dropIcon(L){if(L.sprite){figures[L.i].remove(L.sprite);L.sprite=null}}
const busy={};const takeSpot=(L,locId,kinds)=>{const sp=spots[locId]||[];const free=sp.map((s,k)=>({s,k})).filter(({s,k})=>kinds.includes(s.do)&&!busy[locId+":"+k]);if(!free.length)return null;const {s,k}=free[hash(L.i+":"+cur+locId)%free.length];busy[locId+":"+k]=L.i;L.spotKey=locId+":"+k;return s};
const freeSpot=L=>{if(L.spotKey){delete busy[L.spotKey];L.spotKey=null}L.spot=null};
function walkTo(L,locId,extraPt,speed){const ids=route(L.here,locId);const pts=ids.slice(1).map(id=>plateP(id));if(extraPt)pts.push(extraPt);L.path=pts;L.dest=locId;if(!pts.length&&extraPt)L.path=[extraPt];L.mode=L.path.length?"walk":"idle";L.speed=speed||9;freeSpot(L);L.doing="walk";L.inside=false}
function step(L,dt,t,spd){const g=figures[L.i];const tgt=L.path.length?L.path[0]:L.target;if(!tgt)return false;const dx=tgt.x-L.pos.x,dz=tgt.z-L.pos.z;const d=Math.hypot(dx,dz);const mv=Math.min(d,spd*dt);if(d>0.01){L.pos.x+=dx/d*mv;L.pos.z+=dz/d*mv;g.rotation.y=Math.atan2(dx,dz)}if(d<=mv+0.05){if(L.path.length){L.path.shift();if(!L.path.length){L.here=L.dest||L.here;if(L.mode==="walk")L.mode="idle";L.target=null;return true}}else{L.target=null;return true}}return false}
// ---------- the day: one season is one day, with a shape ----------
// phase: title 0–.05 · morning walk .05–.2 · working day .2–.78 (the season's events play here) · evening .78–.92 · night .92–1
let seasonMs=2000,prog=0.4,phase="day",epochNow=[];
const PH=p=>p<0.05?"title":p<0.2?"morning":p<0.78?"day":p<0.92?"evening":"night";const PHOF=(p,L)=>PH(Math.max(0,p-(L?L.jit:0)));
function plan(L,fr){const phase=PHOF(prog,L);const at=fr&&fr.at[L.i];const work=at&&at!==L.home?at:null;const home=L.home||publicLoc;const famine=epochNow.some(e=>e.kind==="famine"),war=epochNow.some(e=>e.kind==="war"),winter=epochNow.some(e=>e.kind==="winter")||((cur-1+400)%4===3),plague=epochNow.some(e=>e.kind==="plague");
 if(phase==="title"||phase==="night")return {loc:home,do:L.home?"inside":"sleeprough"};
 if(phase==="morning"||phase==="day"){
  if(L.sick&&plague)return {loc:home,do:"bed"};
  if(L.role==="doctor"&&plague){const sickHome=life.find(o=>o.sick&&!o.gone&&o.home);if(sickHome)return {loc:sickHome.home,do:"tend",at:doorOf(sickHome)}}
  if(work)return {loc:work,do:"work"};
  if(L.starving&&famine)return {loc:publicLoc,do:"queue"};
  if(L.home&&PT[L.home]==="home")return {loc:home,do:winter?"chop":"talk"};
  return {loc:home,do:"talk"}}
 // evening: what the person chose this season (the ledger), not a rule of the renderer
 const ev=(fr&&fr.evening&&fr.evening[L.i])||"home";
 if(famine&&L.starving)return {loc:publicLoc,do:"queue"};
 if(ev==="work")return {loc:work||home,do:work?"work":"chop"};
 if(ev==="tavern")return {loc:tavernLoc,do:PT[tavernLoc]==="tavern"?"sit":"talk"};
 if(ev==="chapel"&&chapelLoc)return {loc:chapelLoc,do:"pray"};
 if(ev==="square")return {loc:publicLoc,do:"browse"};
 if(ev.startsWith("visit:")){const o=life.find(o=>D.citizens[o.i].id===ev.slice(6));if(o&&o.home)return {loc:o.home,do:"visit",withI:o.i,at:doorOf(o)}}
 if(war&&ev==="square")return {loc:publicLoc,do:"browse"};
 return {loc:home,do:winter?"inside":"talk"}}
const WORK_BY_PLACE={mine:["swing","carry"],farm:["hoe","carry"],market:["sell","browse"],tavern:["sit","talk"],chapel:["pray"],home:["talk","chop"],public:["talk"],exit:["talk"]};
function settle(L,want){L.withI=want.withI!=null?want.withI:null;const kind=PT[L.here]||"public";let kinds=want.do==="work"?WORK_BY_PLACE[kind]||["talk"]:[want.do];if(want.do==="work"&&kind==="market"&&L.role!=="shop"&&L.role!=="publican")kinds=["browse","sell"];
 const s=takeSpot(L,L.here,kinds)||takeSpot(L,L.here,["talk","browse","sit","hoe","swing","sell","carry","pray","chop","queue"]);
 const P=plateP(L.here);
 if(want.do==="inside"||want.do==="sleeprough"||want.do==="bed"||want.do==="tend"){L.doing=want.do;const dr=want.at||doorOf(L);L.target={x:dr.x+(hash(L.i)%3-1)*1.6,z:dr.z-1};L.face=null;freeSpot(L);return}
 if(want.do==="visit"&&want.at){L.target={x:want.at.x+2.2,z:want.at.z+1.5};L.doing="talk";L.face=null;freeSpot(L);return}
 if(want.do==="talk"&&L.here===L.home&&homeOf[D.citizens[L.i].id]){const dr=doorOf(L);L.target={x:dr.x+(hash(L.i)%3-1)*1.5,z:dr.z+1};L.doing="talk";L.face=null;freeSpot(L);return}
 if(s){L.spot=s;L.target={x:s.x,z:s.z};L.doing=s.do;L.face=s.face!=null?s.face:null}else{L.target={x:P.x+(hash(L.i+cur)%14)-7,z:P.z+(hash(L.i*7+cur)%10)-5};L.doing="talk";L.face=null}}
// ---------- the day's events, one at a time ----------
const HARM=new Set(["theft","violence","betrayal","abandonment","lie","justice"]);
let watched=-1;let vignettes=[];let vig=null;let shot=null;let narr="";
function pickEvents(h,ms){const acts=((D.acts&&D.acts[h-1])||[]).filter(a=>!["work","well","housed"].includes(a.kind));
 const weight=a=>a.kind==="death"?10:a.kind==="violence"?6:a.kind==="leave"?5:a.kind==="marry"?4:a.kind==="birth"?1.5:a.kind==="homeless"?4:a.kind==="choice"?2.5+(/hang|die|kill|starv|steal|purse|store/.test(a.situation||"")?1:0):(a.harm||0)*8+(a.help||0)*5+(a.kind==="sick"?1:0);
 let list=acts.map((a,i)=>({...a,i})).sort((a,b)=>weight(b)-weight(a));
 if(watched>=0)list=list.filter(a=>a.c===watched||a.target===watched);
 const hang=acts.find(a=>/hanged/.test(a.text||""));if(hang){const d=acts.find(a=>a.kind==="death"&&a.c===hang.target);if(d){hang.kills=true;acts.splice(acts.indexOf(d),1);list=list.filter(a=>a.kind!=="death"||a.c!==hang.target)}}
 const cnt={};for(const a of acts)if(a.kind==="choice"){const k=(a.situation||"").slice(0,24);cnt[k]=(cnt[k]||0)+1}
 list.sort((a,b)=>(weight(b)+(b.kind==="choice"?1.5/(cnt[(b.situation||"").slice(0,24)]||1):0))-(weight(a)+(a.kind==="choice"?1.5/(cnt[(a.situation||"").slice(0,24)]||1):0)));
 const room=Math.floor(Math.max(0,ms*0.58)/2200);let births=0;const shown=[],rest=[];const seen=new Set();const key=a=>a.kind==="choice"?"c:"+(a.situation||"").slice(0,24):a.kind==="birth"?"birth":a.kind+":"+(a.text||"").replace(/\\b[A-Z][a-z]+\\b/g,"").slice(0,20);for(const pass of [0,1])for(const a of list){if(shown.includes(a)||rest.includes(a))continue;const k=key(a);const dup=seen.has(k);if(pass===0&&dup)continue;if(shown.length<room&&!(a.kind==="birth"&&births>=1)){shown.push(a);seen.add(k);if(a.kind==="birth")births++}else if(pass===1)rest.push(a)}for(const a of list)if(!shown.includes(a)&&!rest.includes(a))rest.push(a);shown.sort((a,b)=>{const ba=a.kind==="death"||a.kind==="violence"||a.kind==="betrayal"||a.kind==="homeless"||a.kind==="leave"||/hanged|house/.test(a.text||""),bb=b.kind==="death"||b.kind==="violence"||b.kind==="betrayal"||b.kind==="homeless"||b.kind==="leave"||/hanged|house/.test(b.text||"");return (bb?1:0)-(ba?1:0)||a.i-b.i});
 const instant=rest; // no time to show them: apply their consequences quietly
 return {shown,instant}}
function applyQuiet(a){const L=life[a.c];if(!L||L.gone)return;if(a.kind==="death"){L.gone=true;figures[L.i].visible=false;grave(L);freeSpot(L)}else if(a.kind==="leave"){L.gone=true;figures[L.i].visible=false;freeSpot(L)}else if(a.kind==="birth")child(L);else if(a.kind==="sick")L.sick=true;else if(a.kind==="homeless")L.home=null}
function child(L){const kid=makeFigure(null,0.5,{body:[0xd9c27a,0x6fb0d0,0xd07aa8,0x9cc26a][children.length%4]});const P=plateP(L.home||publicLoc);kid.position.set(P.x+(children.length%5)*3-6,2,P.z+4);kid.userData.home=L.home||publicLoc;kid.userData.wanderAt=0;children.push(kid)}
function narrate(a){const n=i=>short(D.citizens[i].name);const A=n(a.c);const T=a.target!=null?n(a.target):null;
 if(a.kind==="choice")return "<i>"+E(a.situation||"")+"</i><br>"+A+": <b>"+E(a.text)+"</b> — "+E(a.outcome||"");if(a.kind==="marry")return A+" marries "+T;if(a.kind==="death")return A+" "+a.text;if(a.kind==="leave")return A+" leaves the valley for good";if(a.kind==="birth")return "a child is born to "+A;if(a.kind==="sick")return A+" has caught the sickness";if(a.kind==="homeless")return A+" has lost the roof";
 let t=(a.text||a.kind);if(T)t=t.replace(new RegExp(T+"'s"),T+"'s").replace(/\\bthem\\b/g,T);return A+" "+t}
// a vignette: the actor goes to the other person, hesitates, acts; the other reacts; the camera is on them
function roadBetween(a,b){let ra=route(a,b);if(ra.length<2)ra=route(a,a===publicLoc?(adjL[a]||[a])[0]:publicLoc);if(ra.length<2)return plateP(a);const A=plateP(ra[0]),B=plateP(ra[1]);return {x:A.x+(B.x-A.x)*0.55,z:A.z+(B.z-A.z)*0.55}}
function startVignette(a,t,dur){const L=life[a.c];if(!L||L.gone){vig=null;return}const T=a.target!=null&&!life[a.target].gone?life[a.target]:null;
 const txt=(a.text||"")+" "+(a.situation||"");const night=/tonight|night|dark/.test(txt);const where=/hanged|flogged|council|crowd|square|store/.test(txt)?{loc:publicLoc,pt:null}:/on the road|the road|ditch/.test(txt)&&T?{loc:null,pt:roadBetween(L.here,T.here)}:/house|roof|took them in|door|lanes/.test(txt)&&T&&T.home?{loc:T.home,pt:null}:null;
 vig={a,L,T,t0:t,dur,stage:0,night,harm:HARM.has(a.kind)||a.kind==="death"};
 if(where&&(a.kind!=="death"||a.kills)){const dest=where.loc||L.here;const pt=where.pt||(where.loc===publicLoc?(spots[publicLoc]||[]).find(s=>s.do==="queue")||plateP(publicLoc):plateP(dest));const go=(P)=>{const ids=route(P.here,dest);const pts=ids.slice(1).map(id=>plateP(id));pts.push({x:pt.x+(P===L?-2:2),z:pt.z+(P===L?1:-1)});let len=0,prev=P.pos;for(const q of pts){len+=Math.hypot(q.x-prev.x,q.z-prev.z);prev=q}walkTo(P,dest,pts[pts.length-1],Math.max(10,len/(dur*0.36)));P.mode="walk";P.inside=false;figures[P.i].visible=true};go(L);if(T){go(T);T.onArrive=()=>{T.mode="acting";T.actUntil=t+dur;T.doing="stand"}}L.onArrive=()=>{L.mode="acting";L.actUntil=t+dur;if(T){figures[L.i].rotation.y=Math.atan2(T.pos.x-L.pos.x,T.pos.z-L.pos.z);figures[T.i].rotation.y=Math.atan2(L.pos.x-T.pos.x,L.pos.z-T.pos.z)}};
  if(/hanged|flogged/.test(txt)){vig.crowd=life.filter(o=>o!==L&&o!==T&&!o.gone&&!o.inside).slice(0,7);vig.crowd.forEach((o,k)=>{const ang=k/7*Math.PI*2;walkTo(o,publicLoc,{x:pt.x+Math.cos(ang)*8,z:pt.z+Math.sin(ang)*8},Math.max(10,120/(dur*0.4)));o.onArrive=()=>{o.mode="acting";o.actUntil=t+dur;o.doing="stand";figures[o.i].rotation.y=Math.atan2(pt.x-o.pos.x,pt.z-o.pos.z)}})}
  narr=narrate(a);if(a.kind!=="choice")narr=E(narr);if(window.__apCast)window.__apCast.focus(a.c,a.target);return}narr=narrate(a);if(a.kind!=="choice")narr=E(narr);if(window.__apCast)window.__apCast.focus(a.c,a.target);L.inside=false;figures[L.i].visible=true;
 if(T){T.inside=false;figures[T.i].visible=true;T.mode="acting";T.actUntil=t+dur;T.target=null;freeSpot(T)}
 if(a.kind==="birth"&&L.home&&L.here!==L.home){const P=plateP(L.home);walkTo(L,L.home,{x:P.x-4,z:P.z-4},Math.max(12,60/(dur*0.38)));L.onArrive=()=>{L.mode="acting";L.actUntil=t+dur};return}
 if(a.kind==="death"||a.kind==="sick"||a.kind==="birth"||a.kind==="homeless"){L.mode="acting";L.actUntil=t+dur;L.target=null;freeSpot(L);return}
 if(a.kind==="leave"){const far=locs.reduce((m,l)=>{const P=toW(LP[l.id]);return Math.hypot(P.x,P.z)>Math.hypot(toW(LP[m.id]).x,toW(LP[m.id]).z)?l:m},locs[0]);const P=toW(LP[far.id]);const d=Math.hypot(P.x,P.z)||1;walkTo(L,far.id,{x:P.x/d*260,z:P.z/d*260},18);L.mode="leaving";giveTool(figures[L.i],"sack");L.tool="sack";return}
 // walk to the other person fast enough to arrive by 40 % of the vignette
 if(T){const P={x:T.pos.x+Math.sin(figures[T.i].rotation.y)*3.4,z:T.pos.z+Math.cos(figures[T.i].rotation.y)*3.4};const ids=route(L.here,T.here);const pts=ids.slice(1).map(id=>plateP(id));pts.push(P);let len=0,prev=L.pos;for(const q of pts){len+=Math.hypot(q.x-prev.x,q.z-prev.z);prev=q}walkTo(L,T.here,P,Math.max(9,len/(dur*0.38)));L.mode="walk";L.onArrive=()=>{L.mode="acting";L.actUntil=t+dur;figures[L.i].rotation.y=Math.atan2(T.pos.x-L.pos.x,T.pos.z-L.pos.z);figures[T.i].rotation.y=Math.atan2(L.pos.x-T.pos.x,L.pos.z-T.pos.z)}}
 else if(/store/.test(a.text||"")&&L.here!==publicLoc){const q=(spots[publicLoc]||[]).find(s=>s.do==="queue")||plateP(publicLoc);walkTo(L,publicLoc,{x:q.x,z:q.z-3},18);L.onArrive=()=>{L.mode="acting";L.actUntil=t+dur;figures[L.i].rotation.y=Math.PI}}
 else{L.mode="acting";L.actUntil=t+dur;L.target=null;freeSpot(L)}}
function runVignette(t){if(!vig)return;const {a,L,T}=vig;const k=(t-vig.t0)/vig.dur;const g=figures[L.i];const harm=HARM.has(a.kind)||(a.harm||0)>=0.3;
 const arrived=L.mode!=="walk";
 if(vig.stage===0&&(arrived||k>0.42)){vig.stage=1;if(L.mode==="walk"){L.path=[];L.mode="acting";L.actUntil=vig.t0+vig.dur}if(a.kind!=="death"&&a.kind!=="birth"&&a.kind!=="sick"&&a.kind!=="homeless"&&a.kind!=="leave")showIcon(L,ICON.choice,a.kind==="choice"?1400:600);L.doing="stand"}
 if(vig.stage===1&&k>(a.kind==="choice"?0.62:0.52)){vig.stage=2;if(window.__apCast)window.__apCast.impact(a);if(a.kind!=="choice")showIcon(L,ICON[a.kind]||"•",vig.dur*1000*0.45);
  if(a.kind==="choice"){L.doing=T?"talk":"stand";showIcon(L,"🎲",900);if(T){T.doing="talk";figures[T.i].rotation.y=Math.atan2(L.pos.x-T.pos.x,L.pos.z-T.pos.z)}}
  else if(a.kind==="death"){L.mode="down";L.down=t;freeSpot(L)}
  else if(a.kind==="birth"){child(L);L.doing="give"}
  else if(a.kind==="sick"){L.sick=true;L.doing="cough"}
  else if(a.kind==="homeless"){L.home=null;L.doing="stand"}
  else if(a.kind==="marry"){L.doing="give";if(T){T.doing="give";T.glow=t;showIcon(T,ICON.marry,vig.dur*1000*0.45)}}
  else if(a.kind==="leave"){}
  else{L.doing=harm?(a.kind==="violence"?"strike":"grab"):"give";if(T){if(a.kind==="violence")T.hit=t;else if(harm)T.flinch=t;else T.glow=t;if(a.kind==="theft"||a.kind==="betrayal")T.doing="stand";if(a.kills){T.mode="down";T.down=t+0.8;showIcon(T,ICON.death,vig.dur*1000*0.5)}else if(a.kind==="violence"&&(a.harm||0)>=0.5){T.downSeason=cur;T.doing="bed"}}}}
 if(k>=1){vig=null;if(window.__apCast)window.__apCast.focus(-1,-1);if(L.mode==="acting"){L.mode="idle";L.doing="stand"}if(T&&T.mode==="acting"){T.mode="idle";T.doing="stand"}}}
// ---------- epochs staged in the world ----------
function makeSoldier(){return makeFigure(null,1.12,LOOK.soldier)}
function grave(L){const at=chapelLoc||L.home||publicLoc;const P=plateP(at);const g=new THREE.Group();const st=box(1.6,2.6,0.5,0x6d6a63);st.position.y=1.3;const bar=box(1.2,0.3,0.6,0x6d6a63);bar.position.y=1.9;g.add(st,bar);const k=graves.length;g.position.set(P.x+14+(k%5)*3.2,2,P.z+2+Math.floor(k/5)*3.2);g.rotation.y=(hash(k)%40-20)/100;scene.add(g);graves.push(g)}
const groundMat=ground.material;const groundBase=new THREE.Color(biome.ground);
function epochsAt(h){return CHRON?D.events.filter(e=>e.at<=h&&h<e.at+(e.seasons||1)):[]}
const burnt=new Set();function burn(locId){for(const h of housesAt[locId]||[])if(!burnt.has(h)){burnt.add(h);h.traverse(o=>{if(o.isMesh&&o.material&&o.material.color)o.material=M(0x1e1a16)})}}
const smokeMat=new THREE.SpriteMaterial({color:0xdddddd,transparent:true,opacity:0.35,depthWrite:false});
function puff(ch){const s=new THREE.Sprite(smokeMat.clone());s.scale.set(1.5,1.5,1);ch.g.getWorldPosition(s.position);s.position.y+=1.8;s.userData.t0=performance.now();scene.add(s);ch.smoke.push(s)}
// ---------- the body doing something ----------
function animate(L,g,t,walking){const u=g.userData;const p=u.pivot;const [la,ra]=u.arms;const [ll,rl]=u.legs||[];let bob=0;if(ll){ll.rotation.x=walking?Math.sin(t*9+L.i)*0.6:0;rl.rotation.x=walking?-Math.sin(t*9+L.i)*0.6:0}p.rotation.x=0;p.rotation.z=0;p.position.y=0;p.scale.set(1,1,1);let tool=null;u.head.rotation.set(0,0,0);
 if(walking){bob=Math.abs(Math.sin(t*9+L.i))*0.18;la.rotation.x=-Math.sin(t*9+L.i)*0.55;ra.rotation.x=Math.sin(t*9+L.i)*0.55;if(L.doing==="carry"||L.mode==="leaving")tool="sack"}
 else switch(L.doing){
  case "swing":{const k=(t*2.2+L.i)%1;const a=k<0.7?-2.4+k/0.7*2.9:0.5-(k-0.7)/0.3*2.9;la.rotation.x=a;ra.rotation.x=a;p.rotation.x=Math.max(0,a)*0.15;tool="pick";break}
  case "hoe":{const k=Math.sin(t*3+L.i);p.rotation.x=0.35+k*0.12;la.rotation.x=-1.2+k*0.4;ra.rotation.x=-1.2+k*0.4;tool="hoe";break}
  case "chop":{const k=(t*1.8+L.i)%1;const a=k<0.6?-2.6+k/0.6*3.2:0.6-(k-0.6)/0.4*3.2;la.rotation.x=a;ra.rotation.x=a;p.rotation.x=Math.max(0,a)*0.2;tool="axe";break}
  case "carry":{la.rotation.x=-2.6;ra.rotation.x=-2.6;tool="sack";break}
  case "sell":{la.rotation.x=-0.9;ra.rotation.x=-0.9+Math.sin(t*2+L.i)*0.3;u.head.rotation.y=Math.sin(t*0.8+L.i)*0.4;break}
  case "browse":{la.rotation.x=-0.6;ra.rotation.x=-1.4+Math.sin(t*1.5+L.i)*0.4;u.head.rotation.x=0.3;break}
  case "queue":{la.rotation.x=-0.2;ra.rotation.x=-0.2;p.rotation.x=0.1;u.head.rotation.x=0.2;break}
  case "sit":{p.position.y=-1.1;if(ll){ll.rotation.x=-1.4;rl.rotation.x=-1.4}la.rotation.x=-1.3;ra.rotation.x=-1.6+(Math.sin(t*1.2+L.i)>0.85?-1.2:0);tool="mug";break}
  case "talk":{la.rotation.x=Math.sin(t*2.3+L.i)*0.4-0.3;ra.rotation.x=Math.cos(t*1.7+L.i)*0.4-0.3;u.head.rotation.y=Math.sin(t*1.1+L.i)*0.25;break}
  case "pray":{p.position.y=-0.8;p.rotation.x=0.35;la.rotation.x=-1.6;ra.rotation.x=-1.6;break}
  case "tend":{p.rotation.x=0.4;la.rotation.x=-1.4;ra.rotation.x=-1.4;tool="bag";break}
  case "bed":{p.position.y=-2.4;p.rotation.z=Math.PI/2;la.rotation.x=-0.6;ra.rotation.x=-0.6;break}
  case "cough":{p.rotation.x=0.3+Math.max(0,Math.sin(t*9))*0.25;la.rotation.x=-1.5;ra.rotation.x=-0.3;break}
  case "strike":{const k=Math.min(1,Math.max(0,(t-L.actUntil+vigDur*0.48)/0.35));ra.rotation.x=-2.5+k*3;la.rotation.x=-0.5;p.rotation.x=k*0.25;break}
  case "grab":{ra.rotation.x=-1.6;la.rotation.x=-1.0;p.rotation.x=0.35;break}
  case "give":{ra.rotation.x=-1.3;la.rotation.x=-1.3;break}
  case "sleeprough":{p.position.y=-2.4;p.rotation.z=Math.PI/2;la.rotation.x=-1.2;ra.rotation.x=-1.2;break}
  default:{la.rotation.x=Math.sin(t*0.8+L.i)*0.06;ra.rotation.x=-Math.sin(t*0.8+L.i)*0.06;u.head.rotation.y=Math.sin(t*0.5+L.i)*0.2}}
 // the body shows its state: hunger slumps and thins, sickness bends and coughs, wealth wears gold
 if(L.starving){p.rotation.x+=0.22;p.scale.set(0.86,0.97,0.86);if(!walking&&L.doing!=="bed")la.rotation.x=-1.2}
 if(L.sick&&!walking&&L.doing!=="bed"&&L.doing!=="cough"){p.rotation.z+=Math.sin(t*3+L.i)*0.08;p.rotation.x+=0.12;if(Math.sin(t*5+L.i*2)>0.92)p.rotation.x+=0.2}
 u.trim.visible=!!L.rich;
 if(L.hit&&t-L.hit<1.2){p.rotation.z+=Math.sin((t-L.hit)*8)*0.6*(1-(t-L.hit)/1.2)}if(L.flinch&&t-L.flinch<0.8){p.rotation.x-=0.35*Math.sin((t-L.flinch)*4)}
 if((tool||"")!==(L.tool||"")){giveTool(g,tool);L.tool=tool}
 return bob}
let vigDur=3;
// ---------- per-season script ----------
let cur=0,prevHour=0,tStart=0,dur=0;let script=null;
const hud={title:document.getElementById("v3title"),season:document.getElementById("hudseason"),epoch:document.getElementById("hudepoch"),pop:document.getElementById("hudpop"),narr:document.getElementById("v3narr")};
function applyState(fr){life.forEach((L,i)=>{const f=(fr.flags&&fr.flags[i])||0;L.starving=!!(f&1);L.sick=!!(f&2);if(f&4)L.home=null;L.rich=!!(f&8);L.shunned=!!(f&32)})}
function settleAll(h){const fr=D.frames[Math.max(0,Math.min(D.frames.length-1,h-1))];if(!fr)return;const before=D.frames[Math.max(0,Math.min(D.frames.length-1,h-2))];
 life.forEach((L,i)=>{const dead=h>1?before.at[i]==null:false;L.gone=dead;figures[i].visible=!dead;L.mode="idle";L.down=0;L.fade=1;L.inside=false;const hm=(D.homes&&D.homes[D.citizens[i].id])||D.home[D.citizens[i].id]||null;L.home=hm;L.here=fr.at[i]||hm||publicLoc;L.pos={...plateP(L.here)};L.path=[];L.target=null;L.doing="stand";dropIcon(L);freeSpot(L);figures[i].userData.pivot.rotation.set(0,0,0);figures[i].userData.pivot.position.y=0});
 for(let k=1;k<=h;k++)for(const a of (D.acts&&D.acts[k-1])||[]){const L=life[a.c];if(a.kind==="homeless")L.home=null;if(a.kind==="housed"&&a.target!=null)L.home=life[a.target].home}
 for(const g of graves)scene.remove(g);graves.length=0;for(const k of children)scene.remove(k);children.length=0;
 life.forEach((L,i)=>{if(L.gone&&(D.acts||[]).slice(0,h-1).some(as=>as.some(a=>a.c===i&&a.kind==="death")))grave(L)});
 for(let k=1;k<h;k++)for(const a of (D.acts&&D.acts[k-1])||[])if(a.kind==="birth"&&!life[a.c].gone)child(life[a.c]);
 for(const e of D.events)if(e.at<=h&&(e.kind==="fire")&&e.where!=="all")burn(e.where);
 applyState(fr);vignettes=[];vig=null;narr="";
 // scatter people to where the season would have them at midday
 life.forEach(L=>{if(L.gone)return;const want=plan(L,fr);L.here=want.loc;L.pos={...plateP(L.here)};settle(L,want);if(L.target){L.pos={...L.target};L.target=null;if(L.face!=null)figures[L.i].rotation.y=L.face}})}
window.__ap3d={watch(i){watched=i;if(i>=0){controls.autoRotate=false;shot=null}},
 setHour(h,ms){const jump=Math.abs(h-cur)>1||h<cur;prevHour=cur;cur=h;tStart=performance.now();dur=ms||0;seasonMs=Math.max(1200,ms||1200);const fr=D.frames[Math.max(0,Math.min(D.frames.length-1,h-1))];if(!fr)return;epochNow=epochsAt(h);
 if(!CHRON){fr.lines.slice(0,4).forEach(ln=>{showIcon(life[ln.c],"💬",Math.max(1500,ms||0))});return}
 if(jump||!ms){settleAll(h);return}
 // a new season: the day's shape and its events
 applyState(fr);for(const e of D.events)if(e.at===h&&e.kind==="fire"&&e.where!=="all")burn(e.where);
 const {shown,instant}=pickEvents(h,ms);for(const a of instant)applyQuiet(a);
 const t0=0.2,t1=0.8;const big=a=>a.kind==="death"||a.kind==="violence"||a.kind==="betrayal"||a.kind==="homeless"||a.kind==="leave"||/hanged|house/.test(a.text||"");const slots=shown.reduce((k,a)=>k+(big(a)?1.8:1),0);vigDur=slots?Math.min(5,(t1-t0)*seasonMs/1000/slots):3;
 let acc=t0;vignettes=shown.map((a)=>{const d=vigDur*(big(a)?1.8:1);const v={a,at:acc,dur:Math.min(d,Math.max(1.2,(0.9-acc)*seasonMs/1000)),started:false};acc+=(t1-t0)*(big(a)?1.8:1)/Math.max(1,slots);return v});vig=null;narr="";
 const ep=D.events.find(e=>e.at===h);hud.title.innerHTML="<b>"+E(D.tickLabels[h-1])+"</b>"+(ep?"<br><span>"+E(ep.headline)+"</span>":"");hud.title.classList.add("show");setTimeout(()=>hud.title.classList.remove("show"),Math.min(2600,seasonMs*0.5));
 for(const L of life){if(L.gone)continue;L.mode==="acting"&&(L.mode="idle");L.doing="stand"}
 }};
// ---------- camera: wide when nothing is happening, close on the people when something is ----------
const centre=(()=>{let x=0,z=0;for(const l of locs){const P=toW(LP[l.id]);x+=P.x;z+=P.z}return {x:x/locs.length,z:z/locs.length}})();
const WIDE={pos:new THREE.Vector3(centre.x+(FEW?34:48),FEW?62:70,centre.z+(FEW?108:118)),tgt:new THREE.Vector3(centre.x,0,centre.z)};camera.position.copy(WIDE.pos);controls.target.copy(WIDE.tgt);let userTouched=-1e9;
renderer.domElement.addEventListener("pointerdown",()=>{userTouched=performance.now()});
const rig={tgt:WIDE.tgt.clone(),off:WIDE.pos.clone().sub(WIDE.tgt)};let shotOff=null,shotFor=null;
function aimCamera(dt,t){const now=performance.now();if(now-userTouched<9000){rig.tgt.copy(controls.target);rig.off.copy(camera.position).sub(controls.target);shotFor=null;return}
 let tgt,off;
 if(watched>=0&&!vig){const L=life[watched];tgt=new THREE.Vector3(L.pos.x,2,L.pos.z);off=new THREE.Vector3(24,22,32)}
 else if(vig){const {L,T}=vig;const near=T&&Math.hypot(L.pos.x-T.pos.x,L.pos.z-T.pos.z)<40;tgt=new THREE.Vector3(near?(L.pos.x+T.pos.x)/2:L.pos.x,4.5,near?(L.pos.z+T.pos.z)/2:L.pos.z);if(shotFor!==vig){shotFor=vig;const ang=(hash(vig.a.c*31+cur)%100/100-0.5)*1.9;shotOff=new THREE.Vector3(Math.sin(ang)*(FEW?38:46),FEW?24:34,Math.cos(ang)*(FEW?38:46))}off=shotOff}
 else{tgt=WIDE.tgt;off=WIDE.pos.clone().sub(WIDE.tgt);shotFor=null}
 const rate=vig&&(t-vig.t0)<0.7?14:vig?5:2;const k=1-Math.exp(-rate*Math.min(1,Math.max(0.004,dt)));rig.tgt.lerp(tgt,k);rig.off.lerp(off,k);
 controls.target.copy(rig.tgt);camera.position.copy(rig.tgt).add(rig.off);if(camera.position.y<12)camera.position.y=12;camera.lookAt(rig.tgt);controls.autoRotate=false}
// ---------- hover / click ----------
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let hover=-1,hoverSprite=null;
function pick(ev){const r=renderer.domElement.getBoundingClientRect();mouse.set(((ev.clientX-r.left)/r.width)*2-1,-((ev.clientY-r.top)/r.height)*2+1);ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(figures.filter(g=>g.visible),true)[0];if(!hit)return -1;let g=hit.object;while(g&&!figures.includes(g))g=g.parent;return figures.indexOf(g)}
let lastHover=0;renderer.domElement.addEventListener("pointermove",ev=>{const now=performance.now();if(now-lastHover<80)return;lastHover=now;const i=pick(ev);if(i===hover)return;if(hoverSprite){figures[hover].remove(hoverSprite);hoverSprite=null}hover=i;if(i>=0){const c=D.citizens[i];hoverSprite=sprite(c.name+" · "+c.role,16,"#1d1b17","rgba(255,253,248,0.95)");hoverSprite.position.y=8.4;figures[i].add(hoverSprite);renderer.domElement.style.cursor="pointer"}else renderer.domElement.style.cursor=""});
renderer.domElement.addEventListener("click",ev=>{const i=pick(ev);if(i<0)return;const el=document.getElementById("j-"+D.citizens[i].id);if(el){el.open=true;el.scrollIntoView({behavior:"smooth",block:"start"})}});
// ---------- render loop ----------
const clock=new THREE.Clock();let lastT=0,lastPuff=0;
let frameCount=0;function frame(){frameCount++;const t=clock.getElapsedTime();const dtRaw=t-lastT;const dt=Math.min(0.05,dtRaw);lastT=t;const now=performance.now();const fr=D.frames[Math.max(0,Math.min(D.frames.length-1,cur-1))];
 prog=dur?Math.min(1,(now-tStart)/seasonMs):0.45;phase=PH(prog);const seasonIdx=CHRON?(cur-1+400)%4:0;
 for(const c of clouds){c.position.x+=c.userData.v*dt*2;if(c.position.x>300)c.position.x=-300}
 if(fr&&CHRON){
  // events of the day, in order
  if(!vig){const nx=vignettes.find(v=>!v.started&&prog>=v.at);if(nx){nx.started=true;startVignette(nx.a,t,nx.dur)}}
  if(vig)runVignette(t);
  life.forEach((L,i)=>{const g=figures[i];if(L.gone){g.visible=false;return}
   if(L.sprite&&now>L.spriteUntil)dropIcon(L);
   if(L.mode==="down"){g.visible=true;const k=Math.min(1,Math.max(0,(t-L.down)/0.6));g.userData.pivot.rotation.z=k*Math.PI/2;g.userData.pivot.position.y=t-L.down>2.2?-4*Math.min(1,(t-L.down-2.2)/1.2):0;if(t-L.down>3.6){L.gone=true;g.visible=false;grave(L)}g.position.set(L.pos.x,2,L.pos.z);return}
   if(L.mode==="leaving"){g.visible=true;step(L,dt,t,L.speed);if(!L.path.length){L.fade-=dt*0.5;g.userData.pivot.position.y=-4*(1-L.fade);if(L.fade<=0){L.gone=true;g.visible=false}}animate(L,g,t,true);g.position.set(L.pos.x,2,L.pos.z);return}
   let walking=false;
   if(L.downSeason===cur&&L.mode!=="down"){L.mode="acting";L.actUntil=t+1;L.doing="bed";L.target=null}
   if(L.mode==="acting"){if(t>L.actUntil){L.mode="idle";L.doing="stand"}}
   else if(L.mode==="walk"){walking=true;if(step(L,dt,t,L.sick||L.starving?L.speed*0.6:L.speed)){if(L.onArrive){const fn=L.onArrive;L.onArrive=null;fn()}else settle(L,plan(L,fr))}}
   else{const want=plan(L,fr);if(want.loc!==L.here)walkTo(L,want.loc,null,PHOF(prog,L)==="morning"?7:6);else{if(want.do!==L.doing&&!(want.do==="work"&&(WORK_BY_PLACE[PT[L.here]||"public"]||[]).includes(L.doing)))settle(L,want);if(L.target){walking=!step(L,dt,t,3.5);if(!walking&&L.face!=null)g.rotation.y=L.face}}}
   L.inside=(L.doing==="inside")&&!L.target&&L.mode==="idle"&&i!==watched;g.visible=!L.inside;
   const bob=animate(L,g,t,walking||L.mode==="walk");
   g.position.set(L.pos.x+(L.hit&&t-L.hit<1?(Math.random()-0.5):0),2+bob+(L.glow&&t-L.glow<1.5?Math.abs(Math.sin((t-L.glow)*6))*1.0:0),L.pos.z);
   g.userData.mat.emissive=g.userData.mat.emissive||new THREE.Color(0);g.userData.mat.emissive.setHex(L.glow&&t-L.glow<1.5?0x2a4a10:L.flinch&&t-L.flinch<0.8?0x5a1a10:L.sick?0x0a2a0a:0);
   g.userData.ring.visible=i===watched;
   // talkers face each other; a visitor's host comes to the door; a known thief is turned away from
   if(L.doing==="talk"&&!L.target&&L.mode==="idle"){let o=L.withI!=null?life[L.withI]:null;if(o&&!o.gone&&o.here===L.here&&o.mode==="idle"){o.inside=false;figures[o.i].visible=true;if(Math.hypot(o.pos.x-L.pos.x,o.pos.z-L.pos.z)>6&&!o.target){o.target={x:L.pos.x+2.5,z:L.pos.z};o.doing="talk"}}else o=life.find(o=>o!==L&&!o.gone&&o.here===L.here&&!o.inside&&o.mode==="idle"&&Math.hypot(o.pos.x-L.pos.x,o.pos.z-L.pos.z)<10);if(o){const a=Math.atan2(o.pos.x-L.pos.x,o.pos.z-L.pos.z);g.rotation.y=o.shunned?a+Math.PI:a;if(o.doing==="talk"&&!o.target)figures[o.i].rotation.y=a+Math.PI}}});
  for(const k of children){const P=plateP(k.userData.home);const night=phase==="night"||phase==="title";k.visible=!night;if(t>k.userData.wanderAt){k.userData.tgt={x:P.x+(Math.random()-0.5)*16,z:P.z+(Math.random()-0.5)*12};k.userData.wanderAt=t+2+Math.random()*4}const tg=k.userData.tgt;if(tg){const dx=tg.x-k.position.x,dz=tg.z-k.position.z,d=Math.hypot(dx,dz);if(d>0.2){k.position.x+=dx/d*4*dt;k.position.z+=dz/d*4*dt;k.rotation.y=Math.atan2(dx,dz);k.userData.arms[0].rotation.x=Math.sin(t*10)*0.7;k.userData.arms[1].rotation.x=-Math.sin(t*10)*0.7;k.position.y=2+Math.abs(Math.sin(t*10))*0.25}else k.position.y=2}}
  const war=epochNow.some(e=>e.kind==="war"),famine=epochNow.some(e=>e.kind==="famine"),winter=seasonIdx===3||epochNow.some(e=>e.kind==="winter");
  if(war&&!soldiers.length){for(let k=0;k<6;k++){const g=makeSoldier();const L={here:publicLoc,pos:{...plateP(publicLoc)},path:[],speed:9,k};L.pos.x+=k*3-8;soldiers.push({g,L})}}
  if(!war&&soldiers.length){for(const s of soldiers)scene.remove(s.g);soldiers.length=0}
  for(const s of soldiers){const L=s.L;if(phase==="day"||phase==="morning"){if(!L.path.length&&hash(cur*7+s.L.k)%2===0){const next=locs[(hash(cur+L.k*13)+Math.floor(t/20))%locs.length].id;const ids=route(L.here,next);L.path=ids.slice(1).map(id=>plateP(id));L.dest=next}const tgt=L.path[0];if(tgt){const dx=tgt.x-L.pos.x,dz=tgt.z-L.pos.z,d=Math.hypot(dx,dz);const mv=Math.min(d,L.speed*dt);if(d>0.01){L.pos.x+=dx/d*mv;L.pos.z+=dz/d*mv;s.g.rotation.y=Math.atan2(dx,dz)}if(d<=mv+0.05){L.path.shift();if(!L.path.length)L.here=L.dest}s.g.userData.arms[0].rotation.x=Math.sin(t*9+L.k)*0.6;s.g.userData.arms[1].rotation.x=-Math.sin(t*9+L.k)*0.6}else{s.g.userData.arms[0].rotation.x=-0.2;s.g.userData.arms[1].rotation.x=-0.2}}
   s.g.position.set(L.pos.x+Math.sin(L.k)*2,2,L.pos.z+Math.cos(L.k)*2)}
  groundMat.color.lerp(winter?new THREE.Color(0xd9dde0):famine?new THREE.Color(0x9a8a4a):groundBase,0.02);
  cropMat.color.lerp(new THREE.Color(winter?0x8a7a58:famine?0x9a8a3a:seasonIdx===0?0x5fa03a:seasonIdx===1?0x4f8a32:0xd0a63a),0.02);
  for(const gd of goods)gd.visible=!famine;
  const night=phase==="night"||phase==="title";
  if(now-lastPuff>140){lastPuff=now;for(const ch of chimneys)if((night||winter||phase==="evening")&&Math.random()<0.3)puff(ch)}
  for(const ch of chimneys){ch.smoke=ch.smoke.filter(s=>{const a=(now-s.userData.t0)/2600;if(a>=1){scene.remove(s);return false}s.position.y+=dt*3.5;s.position.x+=dt*0.8;s.scale.setScalar(1.5+a*4);s.material.opacity=0.35*(1-a);return true})}
  for(const w of windows)w.material.color.setHex(night||phase==="evening"?0xffc86a:0x222222);
  // HUD
  const alive=fr.at.filter(x=>x!=null).length,dead=D.citizens.filter((c,i)=>fr.at[i]==null&&(D.acts||[]).slice(0,cur).some(as=>as.some(a=>a.c===i&&a.kind==="death"))).length,gone=D.citizens.length-alive-dead;
  hud.season.textContent=cur?D.tickLabels[cur-1]:"the beginning";const ep=epochNow[0];hud.epoch.textContent=ep?({famine:"🌾",plague:"🤒",war:"⚔️",winter:"❄️",boom:"✨",fire:"🔥",flood:"🌊",festival:"🎉",reform:"📜",omen:"🌑"}[ep.kind]||"")+" "+ep.headline:"";hud.pop.textContent="👤 "+alive+"   ✝ "+dead+"   🎒 "+gone;
  if(phase==="evening"||phase==="night")narr="";if(window.__apCast)window.__apCast.season(cur,fr);hud.narr.innerHTML=narr;hud.narr.classList.toggle("show",!!narr&&watched<0);
 }
 else if(fr){figures.forEach((g,i)=>{const b=seat(i,cur);if(!b){g.visible=false;return}g.visible=true;const a=seat(i,prevHour)||b;const L=life[i];if(L.sprite&&now>L.spriteUntil)dropIcon(L);const f=dur?Math.min(1,(now-tStart)/dur):1;L.pos.x=a.x+(b.x-a.x)*f;L.pos.z=a.z+(b.z-a.z)*f;const walking=f<1&&Math.hypot(b.x-a.x,b.z-a.z)>0.5;if(walking)g.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);L.doing="talk";const bob=animate(L,g,t,walking);g.position.set(L.pos.x,2+bob,L.pos.z);const li=fr.lean[i];const ci=D.choices.findIndex(c=>c.id===li);if(li&&ci>=0)g.userData.mat.color.setHex([0xb3541e,0x2f6f8f,0x5d7a3a,0x8a3e6a,0x8a857a][ci%5]);g.userData.ring.visible=!!fr.committed[i]})}
 // light follows the day: dawn at the title, noon in the working day, dusk in the evening, dark at night
 const tod=CHRON?(phase==="title"?0.1:phase==="morning"?0.14+(prog-0.05)/0.15*0.1:phase==="day"?0.24+(prog-0.2)/0.58*0.3:phase==="evening"?0.54+(prog-0.78)/0.14*0.12:0.7+(prog-0.92)/0.08*0.2):null;
 applyFx(cur,dt,t,vig&&vig.night?0.66:tod);
 aimCamera(dtRaw,t);for(const l of placeLabels)l.visible=!vig&&watched<0;
 const sx=(Math.random()-0.5)*shake*2,sy=(Math.random()-0.5)*shake*2;camera.position.x+=sx;camera.position.y+=sy;if(performance.now()-userTouched<9000)controls.update();camera.position.x-=sx;camera.position.y-=sy;
 document.getElementById("fxlabel").textContent=fxLabel?"⛈ "+fxLabel:"";
 renderer.render(scene,camera);requestAnimationFrame(frame)}
window.__ap3dPick=(h,ms)=>pickEvents(h,ms);window.__ap3dCam={camera,controls,aim:()=>aimCamera(0.016,0)};window.__ap3dLife=life;window.__ap3dDebug=()=>({frames:frameCount,cam:camera.position.toArray().map(Math.round),tgt:controls.target.toArray().map(Math.round),touched:userTouched,vignettes:vignettes.map(v=>({k:v.a.kind,at:v.at,started:v.started})),vig:vig&&vig.a.kind,prog,phase,dur,seasonMs,cur,narr,modes:life.map(L=>L.mode+":"+L.doing).slice(0,8)});
frame();
addEventListener("resize",()=>{const W=host.clientWidth||900,H=Math.round(W*(CHRON?0.62:0.56));renderer.setSize(W,H);camera.aspect=W/H;camera.updateProjectionMatrix()});
window.__ap3d.setHour(window.__apHour||0,0);
</script>
`;
}
