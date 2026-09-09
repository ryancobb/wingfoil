import * as THREE from 'three';
import { clamp, rad } from '../physics.js';
import { ellipsoid, rod, tube, link, setLink, solveJoint } from './primitives.js';
import { wingPose, smoothAngle } from './wing-pose.js';
import { toon } from './toon.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export function createRig(scene) {
  const material = toon;
  const ink = material('#112e59'), suit = material('#087cb1'), seam = material('#66e0dc');
  const coral = material('#ff572b'), sand = material('#fff2bd'), skin = material('#db9a60');
  const carbon = material('#132b49');
  const root = new THREE.Group(); scene.add(root);
  const board = new THREE.Group(); root.add(board);

  // A thick, bevelled foil board, with a squared tail and rounded, rockered nose.
  const outline = new THREE.Shape();
  outline.moveTo(-.28, .76); outline.quadraticCurveTo(-.37, .71, -.365, .38);
  outline.bezierCurveTo(-.4, -.25, -.34, -.88, 0, -.98);
  outline.bezierCurveTo(.34, -.88, .4, -.25, .365, .38);
  outline.quadraticCurveTo(.37, .71, .28, .76); outline.lineTo(-.28, .76);
  const boardGeo = new THREE.ExtrudeGeometry(outline, { depth: .065, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .055, bevelThickness: .045, curveSegments: 18 });
  boardGeo.rotateX(Math.PI / 2); boardGeo.translate(0, .095, 0);
  const hull = new THREE.Mesh(boardGeo, [sand, coral]); board.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(.52, .025, 1.04), suit); deck.position.set(0, .149, .1); board.add(deck);
  for (let n = 0; n < 14; n++) rod(board, seam, [-.255, .164, -.39 + n * .071], [.255, .164, -.39 + n * .071], .003);
  const noseStripe = new THREE.Mesh(new THREE.BoxGeometry(.10, .007, .33), coral); noseStripe.position.set(0, .148, -.61); board.add(noseStripe);
  for (const z of [-.32, .33]) {
    tube(board, ink, [[-.15, .145, z], [-.09, .23, z - .015], [.03, .25, z - .025], [.09, .145, z]], .022, 12);
  }
  const mast = new THREE.Mesh(new THREE.BoxGeometry(.032, .82, .14), carbon); mast.position.set(0, -.37, .11); board.add(mast);
  rod(board, carbon, [0, -.78, -.28], [0, -.78, .58], .024);
  function foilWing(span, chord, z) {
    const points = [], indices = [];
    for (let i = 0; i <= 30; i++) {
      const x = (i / 30 - .5) * span, taper = Math.sqrt(Math.max(.01, 1 - (x / (span / 2)) ** 2));
      for (let j = 0; j <= 8; j++) {
        const u = j / 8;
        points.push(x, -.79 + Math.sin(u * Math.PI) * .028 + Math.pow(Math.abs(x / span), 2) * .11, z + (u - .35) * chord * taper + Math.abs(x) * .16);
        if (i < 30 && j < 8) { const a = i * 9 + j; indices.push(a, a + 9, a + 1, a + 1, a + 9, a + 10); }
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material('#182f48', { side: THREE.DoubleSide })); board.add(mesh); return mesh;
  }
  const frontFoil = foilWing(1.12, .21, -.17); foilWing(.48, .13, .49);

  // Torso cross-sections describe shoulders, chest, waist and hips instead of a pill.
  const body = new THREE.Group(); board.add(body);
  function torsoGeometry() {
    const rings = [[-.24, .15, .115], [-.12, .155, .125], [.10, .225, .145], [.22, .235, .125], [.29, .145, .10]];
    const pos = [], idx = [];
    for (let r = 0; r < rings.length; r++) for (let i = 0; i <= 20; i++) {
      const a = i / 20 * Math.PI * 2, [y, x, z] = rings[r]; pos.push(Math.cos(a) * x, y, Math.sin(a) * z);
      if (r < rings.length - 1 && i < 20) { const k = r * 21 + i; idx.push(k, k + 1, k + 21, k + 1, k + 22, k + 21); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
  }
  body.add(new THREE.Mesh(torsoGeometry(), suit));
  const vest = new THREE.Mesh(torsoGeometry(), coral); vest.scale.set(1.045, .82, 1.065); vest.position.y = .045; body.add(vest);
  rod(body, ink, [0, -.12, -.143], [0, .225, -.139], .012);
  for (const y of [-.1, .01, .12]) rod(body, sand, [-.16, y, -.13], [.16, y, -.13], .007);
  ellipsoid(body, ink, [0, -.27, 0], [.175, .15, .135]);
  rod(body, skin, [0, .23, 0], [0, .39, 0], .06);
  const head = new THREE.Group(); head.position.set(0, .48, -.01); body.add(head);
  ellipsoid(head, skin, [0, 0, 0], [.113, .147, .113]);
  ellipsoid(head, skin, [0, -.04, -.107], [.035, .042, .035]);
  ellipsoid(head, skin, [-.109, -.006, 0], [.027, .042, .025]);
  ellipsoid(head, skin, [.109, -.006, 0], [.027, .042, .025]);
  const helmet = ellipsoid(head, sand, [0, .072, .007], [.124, .094, .12]);
  for (const x of [-.055, 0, .055]) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(.014, .008, .055), ink); vent.position.set(x, .164 - Math.abs(x) * .19, -.005); head.add(vent);
  }
  tube(head, ink, [[-.113, .04, .0], [-.09, -.12, -.01], [0, -.145, -.02], [.09, -.12, -.01], [.113, .04, 0]], .007, 18);
  for (const x of [-.046, .046]) ellipsoid(head, ink, [x, .01, -.107], [.044, .028, .013]);
  rod(head, ink, [-.046, .01, -.117], [.046, .01, -.117], .007);

  const arms = [], legs = [];
  for (let i = 0; i < 2; i++) {
    const hand = ellipsoid(board, skin, [0, 0, 0], [.045, .066, .038]);
    arms.push({ upper: link(board, suit, .057), lower: link(board, suit, .043), joint: ellipsoid(board, suit, [0, 0, 0], [.056, .056, .056]), hand });
    const foot = ellipsoid(board, skin, [0, .18, 0], [.065, .048, .135]);
    legs.push({ upper: link(board, ink, .076), lower: link(board, ink, .055), joint: ellipsoid(board, ink, [0, 0, 0], [.071, .071, .071]), foot });
  }
  const leashGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 25 }, () => V()));
  const leash = new THREE.Line(leashGeo, new THREE.LineBasicMaterial({ color: '#122a34' })); board.add(leash);

  const wing = new THREE.Group(); root.add(wing);
  const halfSpan = 2.05, sections = 40, chordSteps = 12;
  function canopyPoint(u, v, time = 0, load = .7, flutter = 0) {
    const x = u * halfSpan, fullness = Math.pow(Math.max(0, 1 - u * u), .68);
    const leadingZ = -.85 + 1.25 * Math.pow(Math.abs(u), 1.7);
    const y = .16 - .30 * u * u + Math.sin(v * Math.PI) * (.14 + load * .07) * fullness;
    return [x, y + flutter * Math.pow(v, 4) * Math.sin(u * 25 + time * 19), leadingZ + v * (1.56 * fullness + .035)];
  }
  const leadingPoints = [];
  for (let i = 0; i <= 40; i++) leadingPoints.push(canopyPoint(i / 20 - 1, 0));
  const leading = tube(wing, coral, leadingPoints, .105, 64);
  // Tube cross-sections taper toward both wingtips.
  const leadCurve = new THREE.CatmullRomCurve3(leadingPoints.map(p => V(...p)));
  const leadAttr = leading.geometry.attributes.position;
  for (let i = 0; i <= 64; i++) {
    const center = leadCurve.getPointAt(i / 64), factor = 1 - .58 * Math.pow(Math.abs(i / 32 - 1), 1.5);
    for (let r = 0; r <= 7; r++) { const k = i * 8 + r; const p = V().fromBufferAttribute(leadAttr, k).sub(center).multiplyScalar(factor).add(center); leadAttr.setXYZ(k, p.x, p.y, p.z); }
  }
  leading.geometry.computeVertexNormals();
  const positions = [], colors = [], indices = [], windowIndices = [];
  const cream = new THREE.Color('#fff4c5'), gold = new THREE.Color('#ffd02e'), orange = new THREE.Color('#ff572b'), navy = new THREE.Color('#133869');
  for (let i = 0; i <= sections; i++) for (let j = 0; j <= chordSteps; j++) {
    const u = i / sections * 2 - 1, v = j / chordSteps;
    positions.push(...canopyPoint(u, v));
    const color = Math.abs(u) > .84 ? navy : v < .19 || Math.abs(u) < .07 ? orange : (Math.floor((u + 1) * 6) % 4 === 0 ? gold : cream);
    colors.push(color.r, color.g, color.b);
    if (i < sections && j < chordSteps) {
      const k = i * (chordSteps + 1) + j;
      const windowPanel = Math.abs(u) > .18 && Math.abs(u) < .44 && j >= 4 && j <= 7;
      (windowPanel ? windowIndices : indices).push(k, k + chordSteps + 1, k + 1, k + 1, k + chordSteps + 1, k + chordSteps + 2);
    }
  }
  const canopyGeo = new THREE.BufferGeometry();
  canopyGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); canopyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); canopyGeo.setIndex(indices); canopyGeo.computeVertexNormals();
  wing.add(new THREE.Mesh(canopyGeo, toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide })));
  const windowGeo = new THREE.BufferGeometry(); windowGeo.setAttribute('position', canopyGeo.attributes.position); windowGeo.setIndex(windowIndices); windowGeo.computeVertexNormals();
  const windows = new THREE.Mesh(windowGeo, material('#8cdded', { transparent: true, opacity: .38, side: THREE.DoubleSide, depthWrite: false }));
  windows.renderOrder = 2; wing.add(windows);
  const seamPoints = [];
  for (const u of [-.84, -.65, -.43, -.2, .2, .43, .65, .84]) {
    for (let j = 0; j < 12; j++) for (const v of [j / 12, (j + 1) / 12]) { const p = canopyPoint(u, v); p[1] += .006; seamPoints.push(...p); }
  }
  for (let i = 0; i < 40; i++) for (const u of [i / 20 - 1, (i + 1) / 20 - 1]) seamPoints.push(...canopyPoint(u, 1));
  const seamGeo = new THREE.BufferGeometry(); seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamPoints, 3));
  wing.add(new THREE.LineSegments(seamGeo, new THREE.LineBasicMaterial({ color: '#8f704e', transparent: true, opacity: .48 })));
  tube(wing, coral, [[0, .14, -.84], [0, .04, -.45], [0, -.015, .15], [0, .08, .73]], .06, 24);
  const grips = [V(0, -.19, -.37), V(0, -.19, .22)];
  for (const grip of grips) tube(wing, ink, [[0, .015, grip.z - .12], [0, -.19, grip.z - .10], [0, -.19, grip.z + .10], [0, .015, grip.z + .12]], .022, 12);
  const neutralGrip = V(0, -.02, -.98);
  tube(wing, ink, [[-.1, .12, -.86], [-.07, -.02, -.98], [.07, -.02, -.98], [.1, .12, -.86]], .022, 12);
  const telltaleGeo = new THREE.BufferGeometry(); telltaleGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(36), 3));
  const telltales = new THREE.LineSegments(telltaleGeo, new THREE.LineBasicMaterial({ color: '#d45237' })); root.add(telltales);

  const desiredWing = new THREE.Quaternion(), euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const target = V(), a = V(), b = V(), pole = V(), joint = V();
  const frontHand = V(), backHand = V();
  const shoulders = [V(), V()], handleOffsets = [V(), V()];
  const constrainedHand = V(), reachDelta = V(), releasedHand = V();
  let tack = -1, smoothTack = -1, yaw = 1.3, bank = -.94, flagAmount = 0, initialized = false;
  const diagnostics = {};
  return {
    root,
    update(sim, input, dt) {
      const t = sim.telemetry, pose = wingPose(sim, input, tack);
      tack = pose.tack;
      const ease = !initialized ? 1 : 1 - Math.exp(-dt * 7);
      const bodyEase = !initialized ? 1 : 1 - Math.exp(-dt * 4.5);
      smoothTack += (tack - smoothTack) * bodyEase;
      yaw = smoothAngle(yaw, pose.yaw, ease);
      bank += (pose.bank - bank) * bodyEase;
      flagAmount += ((input.depower ? 1 : 0) - flagAmount) * ease;
      root.position.set(sim.x, sim.y + .045, sim.z); root.rotation.y = -sim.heading;
      board.rotation.set(sim.pitch, 0, sim.roll);
      const pump = Math.sin(sim.pumpPhase / .65 * Math.PI);
      const load = clamp((t.wingLoad || 0) / 550, 0, 1);
      const crouch = .06 * pump + (sim.recovery > 0 ? .20 : 0);
      body.position.set(smoothTack * (.07 + load * .07), 1.19 - crouch, .035 + input.balance * .07);
      body.rotation.set(-input.balance * .07, smoothTack * Math.PI / 2, -sim.roll * .25);
      head.rotation.y = .15 * Math.sin(sim.heading) * (1 - flagAmount);
      const turnLift = (1 - Math.abs(smoothTack)) * .27;
      euler.set(.04 + pump * .08, yaw, bank, 'YXZ'); desiredWing.setFromEuler(euler);
      wing.quaternion.copy(desiredWing);
      target.set(-smoothTack * .28, 1.96 + turnLift + pump * .09, -.06);
      const scale = Math.sqrt(sim.settings.wing / 5);
      a.copy(neutralGrip).multiplyScalar(scale).applyQuaternion(desiredWing);
      b.set(-smoothTack * .55, 1.48, -.10).sub(a);
      target.lerp(b, flagAmount); wing.position.lerp(target, ease);
      wing.scale.setScalar(scale); frontFoil.scale.x = Math.sqrt(sim.settings.foil / .18);
      // Keep the oriented wing inside both arms' reach after board bank, pitch,
      // equipment scaling and grip changes. Translate the wing, never stretch limbs.
      handleOffsets[0].copy(grips[0]).lerp(neutralGrip, flagAmount).multiplyScalar(scale).applyQuaternion(wing.quaternion);
      handleOffsets[1].copy(grips[1]).multiplyScalar(scale).applyQuaternion(wing.quaternion);
      for (let i = 0; i < 2; i++) shoulders[i].set(body.position.x, 1.41 - crouch, i === 0 ? -.19 : .24).applyQuaternion(board.quaternion);
      releasedHand.set(-smoothTack * .25, .9 - crouch, .24).applyQuaternion(board.quaternion);
      for (let iteration = 0; iteration < 16; iteration++) for (let i = 0; i < 2; i++) {
        const coupling = i === 0 ? 1 : 1 - flagAmount;
        if (coupling < .001) continue;
        constrainedHand.copy(wing.position).add(handleOffsets[i]);
        if (i === 1) constrainedHand.lerp(releasedHand, flagAmount);
        reachDelta.subVectors(constrainedHand, shoulders[i]);
        const distance = reachDelta.length();
        if (distance > .73) wing.position.addScaledVector(reachDelta, -((distance - .73) / (distance * coupling)));
      }
      const flutter = (input.depower ? .045 : (t.alpha || 0) > 18 * rad || (t.alpha || 0) < 2 * rad ? .026 : .004);
      const pos = canopyGeo.attributes.position;
      for (let i = 0; i <= sections; i++) for (let j = 0; j <= chordSteps; j++) {
        const p = canopyPoint(i / sections * 2 - 1, j / chordSteps, sim.time, load, flutter);
        pos.setXYZ(i * (chordSteps + 1) + j, ...p);
      }
      pos.needsUpdate = true;
      root.updateMatrixWorld(true);
      // Handle coordinates come from the rendered wing, so the hands follow its full pose.
      frontHand.copy(grips[0]).lerp(neutralGrip, flagAmount);
      wing.localToWorld(frontHand); board.worldToLocal(frontHand);
      backHand.copy(grips[1]); wing.localToWorld(backHand); board.worldToLocal(backHand);
      backHand.lerp(V(-smoothTack * .25, .9 - crouch, .24), flagAmount);
      const armErrors = [];
      for (let i = 0; i < 2; i++) {
        a.set(body.position.x, 1.41 - crouch, i === 0 ? -.19 : .24);
        b.copy(i === 0 ? frontHand : backHand);
        pole.set(body.position.x - smoothTack * .22, 1.05 - crouch, i === 0 ? -.50 : .52);
        solveJoint(a, b, pole, .38, .36, joint);
        const arm = arms[i]; setLink(arm.upper, a, joint); setLink(arm.lower, joint, b); arm.joint.position.copy(joint); arm.hand.position.copy(b);
        arm.hand.quaternion.copy(wing.quaternion);
        armErrors.push(Math.max(0, a.distanceTo(b) - .74));
        a.set(body.position.x, .95 - crouch, i === 0 ? -.12 : .19);
        b.set(i === 0 ? -.07 : .10, .19, i === 0 ? -.34 : .36);
        pole.set(-smoothTack * .26, .51, i === 0 ? -.38 : .38);
        solveJoint(a, b, pole, .43, .43, joint);
        const leg = legs[i]; setLink(leg.upper, a, joint); setLink(leg.lower, joint, b); leg.joint.position.copy(joint); leg.foot.position.copy(b); leg.foot.rotation.y = -smoothTack * 1.0;
      }
      const leashPos = leashGeo.attributes.position;
      for (let i = 0; i < 25; i++) { const u = i / 24; leashPos.setXYZ(i, .1 + Math.sin(u * 14 * Math.PI) * .016, .17 + Math.sin(u * Math.PI) * .12, .36 + u * .38); }
      leashPos.needsUpdate = true;
      const stream = telltaleGeo.attributes.position;
      const flow = V(pose.flow.x, .05, pose.flow.z).normalize();
      for (let i = 0; i < 2; i++) {
        a.set(i ? 1.05 : -1.05, .2, .3).multiplyScalar(scale).applyQuaternion(wing.quaternion).add(wing.position);
        for (let j = 0; j < 3; j++) for (let end = 0; end < 2; end++) {
          const f = (j + end) / 3;
          b.copy(a).addScaledVector(flow, f * .35); b.y += Math.sin(sim.time * 15 + f * 9) * f * flutter;
          stream.setXYZ(i * 6 + j * 2 + end, b.x, b.y, b.z);
        }
      }
      stream.needsUpdate = true;
      Object.assign(diagnostics, { tack, yaw, bank, flagAmount, armReachError: Math.max(...armErrors), heading: pose.yaw, alpha: pose.alpha });
      initialized = true;
    },
    inspect: () => diagnostics,
  };
}
