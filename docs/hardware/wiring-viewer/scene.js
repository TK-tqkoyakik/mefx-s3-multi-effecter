import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function init(container, data) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xeef3f0);
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('role','img');
  renderer.domElement.setAttribute('aria-label','緑の基板、2本の黒いソケット、赤いESP32。USB左・アンテナ右の分解取り付け図');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
  camera.up.set(0,1,0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 30;
  controls.maxDistance = 430;
  controls.maxPolarAngle = Math.PI * .49;
  controls.target.set(-15,7,-8);
  scene.add(new THREE.HemisphereLight(0xffffff,0x586d60,2.5));
  const light = new THREE.DirectionalLight(0xffffff,3);
  light.position.set(-70,170,45);scene.add(light);
  const material = (color) => new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.15});
  const green = material('#216f43'), red = material('#bd303a'), black = material('#252a28');
  const silver = new THREE.MeshStandardMaterial({color:0xc7ceca,metalness:.65,roughness:.35});
  const gold = new THREE.MeshStandardMaterial({color:0xc6a858,metalness:.5,roughness:.4});
  const transform = ([x,y],z=0) => new THREE.Vector3(x-75,z,y-45);
  function box(group, x,y,z,w,h,d,mat) {const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);group.add(mesh);return mesh;}
  function label(group, value, x,y,z, size=4, color='#202624', background='#ffffff') {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;
    const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,1024,160);ctx.fillStyle=color;ctx.font='600 66px "Yu Gothic UI", Meiryo, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,512,80);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(size*6.4,size,1);sprite.position.set(x,y,z);group.add(sprite);return sprite;
  }
  const base = new THREE.Group();scene.add(base);
  const outline=new THREE.Shape();outline.moveTo(-75,-45);outline.lineTo(75,-45);outline.lineTo(75,45);outline.lineTo(-75,45);outline.closePath();
  for(const pad of data.pads.filter((p)=>p.drill[0]>0)){
    const hole=new THREE.Path();hole.absarc(pad.pos[0]-75,pad.pos[1]-45,pad.drill[0]/2,0,Math.PI*2,true);outline.holes.push(hole);
  }
  const geometry=new THREE.ExtrudeGeometry(outline,{depth:1.6,bevelEnabled:false});
  geometry.rotateX(Math.PI/2);
  const pcb=new THREE.Mesh(geometry,green);base.add(pcb);
  const trackMat=new THREE.LineBasicMaterial({color:0x399157});
  for(const t of data.tracks){const g=new THREE.BufferGeometry().setFromPoints([transform(t.start,.025),transform(t.end,.025)]);base.add(new THREE.Line(g,trackMat));}
  for(const p of data.pads){
    if(p.drill[0]>0){const mesh=new THREE.Mesh(new THREE.RingGeometry(p.drill[0]/2,Math.max(...p.size)/2,16),silver);mesh.rotation.x=-Math.PI/2;mesh.position.copy(transform(p.pos,.06));base.add(mesh);}
    else {const mesh=box(base,...[p.pos[0]-75,.12,p.pos[1]-45],p.size[0],.15,p.size[1],silver);mesh.rotation.y=p.rotation*Math.PI/180;}
  }
  for(const part of data.parts.filter((p)=>!['U3','U5'].includes(p.ref)&&!p.ref.startsWith('J')&&!p.ref.startsWith('H'))){
    const [x,z]=[part.pos[0]-75,part.pos[1]-45];
    const isIc=part.ref==='U2'||part.ref==='U1'||part.ref==='U4';
    const dims=part.ref==='U2'?[4.4,1.3,7.8]:part.ref==='U1'?[3.9,1.4,4.9]:part.ref==='U4'?[1.6,1.1,2.9]:part.ref.startsWith('C')?[1.7,.8,1.1]:[1.6,.5,.9];
    box(base,x,dims[1]/2+.2,z,...dims,isIc?black:part.ref.startsWith('C')?gold:black);
  }
  const u3=data.pads.filter((p)=>p.ref==='U3');
  const socketGroup=new THREE.Group();base.add(socketGroup);
  for(const z of [-40,-14.6]){
    box(socketGroup,-46.5,4.2,z,50,8,2.6,black);
  }
  for(const p of u3){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.44,.44,.1,10),gold);mesh.position.copy(transform(p.pos,8.25));socketGroup.add(mesh);}
  const esp=new THREE.Group();scene.add(esp);
  box(esp,-46.5,1,-27.3,57,1.2,28,red);
  box(esp,-38,3,-27.3,23.5,3.2,18,silver);
  box(esp,-22.5,3,-27.3,10,3.2,19,black);
  for(const z of [-34.3,-20.3]){
    box(esp,-72.8,3,z,7.3,4.5,8,silver);
    box(esp,-76.5,3,z,0.15,2.9,6,black);
  }
  for(const p of u3){box(esp,p.pos[0]-75,-1.5,p.pos[1]-45,.55,4,.55,gold);}
  label(esp,'ESP32 / USB ←',-47,7,-27,3.3,'#fff','#bd303a');
  label(scene,'基板の部品面',16,2,37,4,'#fff','#216f43');
  label(scene,'1×20 雌ソケット 2本',-46,10,-6,3.1);
  label(scene,'USB側',-84,12,-28,3.3);
  const guides=new THREE.Group();scene.add(guides);
  function dashedLine(pos,color){const g=new THREE.BufferGeometry().setFromPoints([transform(pos,8.3),transform(pos,25)]);const line=new THREE.Line(g,new THREE.LineDashedMaterial({color,dashSize:1,gapSize:.7,depthTest:false}));line.computeLineDistances();guides.add(line);return line;}
  const insertion=u3.filter((p)=>[1,20,21,40].includes(Number(p.number))).map((p)=>dashedLine(p.pos,0x20a8bc));
  let selectedPad=1;
  let activeLine;
  function select(n){selectedPad=n;if(activeLine){guides.remove(activeLine);activeLine.geometry.dispose();activeLine.material.dispose();}const s=data.signals.find((s)=>s.pad===n);if(s)activeLine=dashedLine(s.pos,s.color);updateGuides();render();}
  let lift=18;
  function updateGuides(){for(const line of [...insertion,...(activeLine?[activeLine]:[])]){const a=line.geometry.attributes.position;a.setY(1,9.8+lift);a.needsUpdate=true;line.computeLineDistances();line.visible=lift>1;}}
  function explode(value){lift=value;esp.position.y=9.8+lift;updateGuides();render();}
  let viewMode='oblique';
  function view(name){
    viewMode=name==='top'?'top':'oblique';
    // Flush drag inertia before restoring an exact, fully framed orientation.
    controls.enableDamping=false;controls.update();
    controls.target.set(-9,8,-2);
    const direction=new THREE.Vector3(0,1,viewMode==='top'?.0001:.82).normalize();
    const points=[];
    for(const x of [-75,75])for(const y of [-2,0])for(const z of [-45,45])points.push([x,y,z]);
    for(const x of [-80,-17])for(const y of [8,52])for(const z of [-42,-13])points.push([x,y,z]);
    points.push([-85,12,-28]);
    const fits=(distance)=>{
      camera.position.copy(controls.target).addScaledVector(direction,distance);
      camera.lookAt(controls.target);camera.updateMatrixWorld();
      for(const [x,y,z] of points){
        const p=new THREE.Vector3(x,y,z).project(camera);
        if(p.z<-1||p.z>1||Math.abs(p.x)>.90||Math.abs(p.y)>.86)return false;
      }
      return true;
    };
    let low=50,high=430;
    for(let i=0;i<18;i++){const middle=(low+high)/2;if(fits(middle))high=middle;else low=middle;}
    fits(high);
    controls.update();controls.enableDamping=true;render();
  }
  function resize(){const {width,height}=container.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();view(viewMode);}
  function render(){renderer.render(scene,camera);}
  const observer=new ResizeObserver(resize);observer.observe(container);
  controls.addEventListener('change',render);
  let animation;
  function frame(){animation=requestAnimationFrame(frame);if(container.offsetParent!==null){controls.update();render();}}
  explode(lift);view('oblique');resize();frame();
  return {explode,view,resize,select,renderer,camera,controls,scene, get selectedPad(){return selectedPad;}, dispose(){cancelAnimationFrame(animation);observer.disconnect();controls.dispose();renderer.dispose();}};
}
