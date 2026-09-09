import * as THREE from 'three';

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setClearColor('#afd5d3');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#b1d3d0', .0028);
  const camera = new THREE.PerspectiveCamera(49, 1, .1, 1800);
  scene.add(new THREE.HemisphereLight('#e9fbff', '#386a6c', 2.8));
  const sun = new THREE.DirectionalLight('#fff3d9', 3); sun.position.set(-80, 100, -80); scene.add(sun);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .65, ...extra });
  const dark = mat('#19323a'), white = mat('#f7f4de'), orange = mat('#ff814c'), skin = mat('#d6a382');
  const waterUniforms = { uTime: { value: 0 }, uChop: { value: .6 }, uEye: { value: new THREE.Vector3() } };
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600, 180, 180), new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: `uniform float uTime; uniform float uChop; varying vec3 vWorld;
      void main() { vec3 p=position; vec4 world=modelMatrix*vec4(p,1.);
      world.y=uChop*(.045*sin(world.x*.19+world.z*.11-uTime*1.3)+.025*sin(world.z*.43-uTime*1.8));
      vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform float uTime; uniform float uChop; uniform vec3 uEye; varying vec3 vWorld;
      void main(){ vec2 p=vWorld.xz; float t=uTime;
      float nx=.028*cos(p.x*.19+p.y*.11-t*1.3)+.035*cos(p.x*1.3+p.y*.7-t*1.7);
      float nz=.022*cos(p.y*.43-t*1.8)+.025*sin(p.y*1.6+p.x*.9-t*1.5);
      vec3 n=normalize(vec3(-nx,1.,-nz)); vec3 v=normalize(uEye-vWorld);
      float fres=pow(1.-max(dot(n,v),0.),3.);
      vec3 col=mix(vec3(.065,.40,.43),vec3(.57,.74,.73),fres);
      float bands=sin(p.x*.43+p.y*.64+sin(p.y*.17-t)*2.-t*1.4);
      float glint=pow(max(dot(reflect(normalize(vec3(.5,-1.,.5)),n),v),0.),180.);
      col+=vec3(.78,.86,.73)*glint*.9;
      col+=smoothstep(.90,1.,bands)*.043*(1.-fres)*exp(-length(uEye-vWorld)*.018);
      float fog=1.-exp(-length(uEye-vWorld)*.0028);
      gl_FragColor=vec4(mix(col,vec3(.69,.827,.816),fog),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`
  }));
  ocean.rotation.x = -Math.PI / 2; scene.add(ocean);
  // Low coastal silhouettes give scale without spending mobile GPU budget on terrain.
  const islandMat = mat('#587f79');
  for (let i = 0; i < 19; i++) {
    const g = new THREE.ConeGeometry(75 + Math.sin(i * 4) * 25, 50 + Math.sin(i * 3) * 32, 7);
    const m = new THREE.Mesh(g, islandMat);
    m.position.set(-650 + i * 80, -6, -520 - Math.sin(i) * 60); m.scale.z = .65; scene.add(m);
  }
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(19, 20, 12), new THREE.MeshBasicMaterial({ color: '#fff2ce', fog: false }));
  sunDisc.position.set(-370, 200, -900); scene.add(sunDisc);
  function ellipsoid(parent, material, pos, scale) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), material); m.position.set(...pos); m.scale.set(...scale); parent.add(m); return m;
  }
  function rod(parent, a, b, radius, material) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, d.length(), 8), material);
    m.position.copy(va.add(vb).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); parent.add(m); return m;
  }
  const rig = new THREE.Group(); scene.add(rig);
  const board = new THREE.Group(); rig.add(board);
  ellipsoid(board, white, [0, 0, 0], [.38, .085, .92]);
  ellipsoid(board, dark, [0, .067, .03], [.29, .024, .65]);
  ellipsoid(board, orange, [0, .07, -.65], [.22, .02, .17]);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(.035, .82, .105), dark); mast.position.set(0, -.43, .12); board.add(mast);
  ellipsoid(board, dark, [0, -.83, -.05], [.65, .025, .15]);
  rod(board, [0, -.82, -.25], [0, -.82, .57], .025, dark);
  ellipsoid(board, dark, [0, -.83, .53], [.27, .018, .08]);
  const rider = new THREE.Group(); board.add(rider);
  rod(rider, [-.15, .12, -.3], [-.25, .57, -.19], .073, dark);
  rod(rider, [-.25, .57, -.19], [-.06, .91, .03], .089, dark);
  rod(rider, [.15, .12, .35], [.28, .55, .2], .073, dark);
  rod(rider, [.28, .55, .2], [-.06, .91, .03], .089, dark);
  const torso = ellipsoid(rider, mat('#d1b757'), [-.06, 1.14, .015], [.23, .36, .14]); torso.rotation.z = -.12;
  ellipsoid(rider, skin, [-.035, 1.62, -.035], [.115, .14, .12]);
  ellipsoid(rider, dark, [-.04, 1.69, -.02], [.119, .075, .124]);
  rod(rider, [-.22, 1.34, -.05], [-.45, 1.43, -.35], .057, skin);
  rod(rider, [-.45, 1.43, -.35], [-.12, 1.67, -.53], .045, skin);
  rod(rider, [.14, 1.34, .06], [.37, 1.51, .07], .057, skin);
  rod(rider, [.37, 1.51, .07], [.08, 1.73, -.04], .045, skin);
  const wing = new THREE.Group(); wing.position.set(.02, 1.95, -.37); rig.add(wing);
  // Curved inflatable leading edge and a cambered, segmented canopy.
  const leading = [];
  for (let i = 0; i <= 24; i++) { const x = -2.05 + i / 24 * 4.1; leading.push(new THREE.Vector3(x, -.21 * x * x + .26, -.56 + .18 * x * x)); }
  const curve = new THREE.CatmullRomCurve3(leading);
  wing.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 36, .075, 8, false), orange));
  const positions = [], colors = [], indices = [];
  const c1 = new THREE.Color('#f7e8b4'), c2 = new THREE.Color('#f6834b'), c3 = new THREE.Color('#283f43');
  for (let i = 0; i <= 24; i++) {
    const x = -2.05 + i / 24 * 4.1, span = 1 - Math.pow(Math.abs(x) / 2.05, 1.7);
    for (let j = 0; j <= 8; j++) {
      const f = j / 8;
      positions.push(x, -.21 * x * x + .26 + Math.sin(f * Math.PI) * .18 * span, -.56 + .18 * x * x + f * (1.35 * span + .06));
      const c = Math.abs(x) > 1.62 ? c3 : j < 2 || Math.abs(x) < .18 ? c2 : c1; colors.push(c.r, c.g, c.b);
      if (i < 24 && j < 8) { const a = i * 9 + j; indices.push(a, a + 9, a + 1, a + 1, a + 9, a + 10); }
    }
  }
  const canopyGeo = new THREE.BufferGeometry(); canopyGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); canopyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); canopyGeo.setIndex(indices); canopyGeo.computeVertexNormals();
  wing.add(new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .82 })));
  rod(wing, [0, .26, -.56], [0, .18, .82], .055, orange);
  wing.rotation.set(.25, -.35, -.35);
  const wakeCount = 100, wakePos = new Float32Array(wakeCount * 3), wakeLife = new Float32Array(wakeCount);
  const wakeGeo = new THREE.BufferGeometry(); wakeGeo.setAttribute('position', new THREE.BufferAttribute(wakePos, 3));
  const wake = new THREE.Points(wakeGeo, new THREE.PointsMaterial({ color: '#e4f8e9', size: .12, transparent: true, opacity: .46, depthWrite: false })); scene.add(wake);
  const windPos = new Float32Array(65 * 6);
  const windGeo = new THREE.BufferGeometry(); windGeo.setAttribute('position', new THREE.BufferAttribute(windPos, 3));
  const windLines = new THREE.LineSegments(windGeo, new THREE.LineBasicMaterial({ color: '#e1f6ed', transparent: true, opacity: .23 })); scene.add(windLines);
  const gateGroup = new THREE.Group(); scene.add(gateGroup);
  for (const x of [-9, 9]) {
    ellipsoid(gateGroup, orange, [x, .3, 0], [.55, .65, .55]);
    rod(gateGroup, [x, .3, 0], [x, 3.4, 0], .032, white);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.05, .62), new THREE.MeshBasicMaterial({ color: '#ff975d', side: THREE.DoubleSide })); flag.position.set(x + .53, 3.07, 0); gateGroup.add(flag);
  }
  let mode = 0, wakeIndex = 0;
  const smoothTarget = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), desiredTarget = new THREE.Vector3();
  let initialized = false;
  function resize() { const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); resize();
  return {
    camera: () => { mode = (mode + 1) % 3; return ['Chase', 'Side', 'Close'][mode]; },
    render(sim, input, dt, gate, showWind) {
      const t = sim.telemetry;
      rig.position.set(sim.x, sim.y + .04, sim.z); rig.rotation.y = -sim.heading;
      board.rotation.x = sim.pitch; board.rotation.z = sim.roll;
      rider.rotation.z = -sim.roll * .4;
      wing.rotation.y = -.25 + (input.trim - .5) * 1.5;
      wing.rotation.z = -.35 + sim.roll * .3 + (input.depower ? -.75 : 0);
      wing.position.y = 1.95 + Math.sin(sim.pumpPhase / .65 * Math.PI) * .13;
      const f = new THREE.Vector3(Math.sin(sim.heading), 0, -Math.cos(sim.heading));
      const r = new THREE.Vector3(Math.cos(sim.heading), 0, Math.sin(sim.heading));
      const shortLandscape = container.clientHeight <= 570 && camera.aspect > 1;
      const back = mode === 2 ? 5.8 : mode === 1 ? 5 : shortLandscape ? 6.5 : 10.5;
      const side = mode === 1 ? (shortLandscape ? 6.5 : 10) : mode === 2 ? 1.9 : shortLandscape ? 2.6 : 4.1;
      desiredCamera.copy(rig.position).addScaledVector(f, -back).addScaledVector(r, side); desiredCamera.y = sim.y + (mode === 2 ? 2.8 : shortLandscape ? 3.1 : 4.6);
      desiredTarget.copy(rig.position).addScaledVector(f, mode === 2 ? 2 : .7); desiredTarget.y = sim.y + (container.clientHeight <= 620 && camera.aspect < 1 ? .9 : .3);
      const ease = initialized ? 1 - Math.exp(-dt * 3) : 1;
      camera.position.lerp(desiredCamera, ease); smoothTarget.lerp(desiredTarget, ease); camera.lookAt(smoothTarget); initialized = true;
      waterUniforms.uTime.value = sim.time; waterUniforms.uChop.value = sim.settings.chop; waterUniforms.uEye.value.copy(camera.position);
      ocean.position.x = Math.round(sim.x / 50) * 50; ocean.position.z = Math.round(sim.z / 50) * 50;
      if ((t.speed || 0) > .8 && dt > 0) {
        const i = wakeIndex++ % wakeCount; wakeLife[i] = 1;
        wakePos[i * 3] = sim.x - f.x * .9 + (Math.random() - .5) * .3;
        wakePos[i * 3 + 1] = .05; wakePos[i * 3 + 2] = sim.z - f.z * .9;
      }
      for (let i = 0; i < wakeCount; i++) { wakeLife[i] -= dt * .23; if (wakeLife[i] < 0) wakePos[i * 3 + 1] = -10; }
      wakeGeo.attributes.position.needsUpdate = true;
      windLines.visible = showWind;
      if (showWind) {
        for (let i = 0; i < 65; i++) {
          const x = sim.x + ((i * 17.37) % 70) - 35, z = sim.z + ((i * 11.71 + sim.time * (t.wind || 9)) % 65) - 32;
          windPos.set([x, .3 + (i % 6) * .48, z, x + (t.wx || 0) * .1, .32 + (i % 6) * .48, z + 1.6], i * 6);
        }
        windGeo.attributes.position.needsUpdate = true;
      }
      gateGroup.visible = !!gate;
      if (gate) { gateGroup.position.set(gate.x, 0, gate.z); gateGroup.rotation.y = -gate.heading; }
      renderer.render(scene, camera);
    }
  };
}
