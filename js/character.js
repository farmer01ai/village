// character.js — procedural human character builder + walk animation
import * as THREE from 'three';

function lambert(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...opts });
}

/**
 * Build a humanoid character.
 * opts: { skin, shirt, pants, shoes, hair, hat, dress, scale }
 * returns { group, parts, setWalking(bool), update(dt) }
 */
export function makeCharacter(opts = {}) {
  const skin  = opts.skin  ?? 0xd9a06b;
  const shirt = opts.shirt ?? 0x6b7d4f;
  const pants = opts.pants ?? 0x4a3b2a;
  const shoes = opts.shoes ?? 0x2b2118;
  const hair  = opts.hair  ?? 0x2a1c10;
  const scale = opts.scale ?? 1;

  const g = new THREE.Group();
  const matSkin = lambert(skin);
  const matShirt = lambert(shirt);
  const matPants = lambert(pants);
  const matShoes = lambert(shoes);
  const matHair = lambert(hair);

  // --- torso ---
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), matShirt);
  torso.position.y = 1.06;
  torso.castShadow = true;
  g.add(torso);

  // hips
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.25), matPants);
  hips.position.y = 0.68;
  hips.castShadow = true;
  g.add(hips);

  // --- head ---
  const headPivot = new THREE.Group();
  headPivot.position.y = 1.42;
  g.add(headPivot);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.28), matSkin);
  head.position.y = 0.18;
  head.castShadow = true;
  headPivot.add(head);

  // hair cap
  const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.3), matHair);
  hairMesh.position.set(0, 0.32, -0.01);
  headPivot.add(hairMesh);
  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.08), matHair);
  hairBack.position.set(0, 0.2, -0.13);
  headPivot.add(hairBack);

  // eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1208 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.02), eyeMat);
    eye.position.set(sx * 0.07, 0.2, 0.145);
    headPivot.add(eye);
  }
  // nose
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.05), matSkin);
  nose.position.set(0, 0.13, 0.15);
  headPivot.add(nose);

  // straw hat (farmers)
  if (opts.hat) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.03, 14), lambert(opts.hat));
    brim.position.y = 0.36;
    headPivot.add(brim);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.14, 12), lambert(opts.hat));
    top.position.y = 0.43;
    headPivot.add(top);
  }
  // headscarf for women
  if (opts.scarf) {
    const sc = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.32), lambert(opts.scarf));
    sc.position.set(0, 0.26, -0.02);
    headPivot.add(sc);
  }

  // --- arms (pivot at shoulder) ---
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.3, 1.32, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.14), matShirt);
    upper.position.y = -0.16;
    upper.castShadow = true;
    pivot.add(upper);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.3, 0.12), matSkin);
    lower.position.y = -0.47;
    lower.castShadow = true;
    pivot.add(lower);
    g.add(pivot);
    return pivot;
  }
  const lArm = makeArm(-1);
  const rArm = makeArm(1);

  // --- legs (pivot at hip) ---
  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.62, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.18), matPants);
    leg.position.y = -0.26;
    leg.castShadow = true;
    pivot.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.26), matShoes);
    shoe.position.set(0, -0.56, 0.04);
    shoe.castShadow = true;
    pivot.add(shoe);
    g.add(pivot);
    return pivot;
  }
  const lLeg = makeLeg(-1);
  const rLeg = makeLeg(1);

  // long dress for women — covers legs
  if (opts.dress) {
    const dressMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 0.66, 10), lambert(opts.dress));
    dressMesh.position.y = 0.42;
    dressMesh.castShadow = true;
    g.add(dressMesh);
  }

  g.scale.setScalar(scale);

  const state = { walking: false, t: Math.random() * 10, speedFactor: 1 };

  return {
    group: g,
    parts: { head: headPivot, torso, lArm, rArm, lLeg, rLeg },
    setWalking(v, speedFactor = 1) { state.walking = v; state.speedFactor = speedFactor; },
    update(dt) {
      if (state.walking) {
        state.t += dt * 7 * state.speedFactor;
        const a = Math.sin(state.t) * 0.65;
        lLeg.rotation.x = a;
        rLeg.rotation.x = -a;
        lArm.rotation.x = -a * 0.8;
        rArm.rotation.x = a * 0.8;
        g.position.y = Math.abs(Math.sin(state.t)) * 0.03;
      } else {
        // settle to rest pose
        for (const p of [lLeg, rLeg, lArm, rArm]) p.rotation.x *= 0.85;
        g.position.y *= 0.85;
        // idle breathing
        state.t += dt;
        torso.scale.y = 1 + Math.sin(state.t * 2) * 0.008;
      }
    },
  };
}

/** cow — holstein style with patches */
export function makeCow() {
  const g = new THREE.Group();
  const white = lambert(0xefe9dc);
  const patch = lambert(0x4a3526);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.8, 1.45), white);
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);
  // brown patches
  for (const [px, py, pz, s] of [[-0.36, 1.1, 0.3, 0.45], [0.36, 0.95, -0.35, 0.5], [-0.34, 0.85, -0.15, 0.35]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, s, s * 1.2), patch);
    p.position.set(px, py, pz);
    g.add(p);
  }
  // head (pivot so it can graze)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.25, 0.75);
  g.add(headPivot);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.42), white);
  head.position.set(0, 0.05, 0.2);
  head.castShadow = true;
  headPivot.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.16), lambert(0xd9a3a0));
  snout.position.set(0, -0.05, 0.46);
  headPivot.add(snout);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), white);
    ear.position.set(sx * 0.26, 0.18, 0.18);
    headPivot.add(ear);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 6), lambert(0xd8cdb4));
    horn.position.set(sx * 0.14, 0.3, 0.14);
    horn.rotation.z = -sx * 0.5;
    headPivot.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035), new THREE.MeshBasicMaterial({ color: 0x1a1208 }));
    eye.position.set(sx * 0.16, 0.12, 0.4);
    headPivot.add(eye);
  }
  // legs
  for (const [sx, sz] of [[-0.25, 0.5], [0.25, 0.5], [-0.25, -0.5], [0.25, -0.5]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), white);
    leg.position.set(sx, 0.31, sz);
    leg.castShadow = true;
    g.add(leg);
  }
  // udder + tail
  const udder = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7), lambert(0xe0b0ac));
  udder.position.set(0, 0.62, -0.35);
  g.add(udder);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.6, 5), white);
  tail.position.set(0, 1.05, -0.76);
  tail.rotation.x = 0.25;
  g.add(tail);
  return { group: g, headPivot };
}

/** sheep — fluffy wool body */
export function makeSheep() {
  const g = new THREE.Group();
  const wool = lambert(0xe8e2d4);
  wool.roughness = 1;
  const dark = lambert(0x2e2620);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), wool);
  body.scale.set(1, 0.9, 1.3);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  // extra wool lumps
  for (let i = 0; i < 5; i++) {
    const lump = new THREE.Mesh(new THREE.SphereGeometry(0.16 + Math.random() * 0.08, 7, 6), wool);
    lump.position.set((Math.random() - 0.5) * 0.5, 0.78 + Math.random() * 0.12, (Math.random() - 0.5) * 0.8);
    g.add(lump);
  }
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.78, 0.5);
  g.add(headPivot);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.3), dark);
  head.position.set(0, 0, 0.12);
  headPivot.add(head);
  const woolCap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6), wool);
  woolCap.position.set(0, 0.14, 0.05);
  headPivot.add(woolCap);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.14), dark);
    ear.position.set(sx * 0.14, 0.06, 0.08);
    headPivot.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    eye.position.set(sx * 0.08, 0.04, 0.26);
    headPivot.add(eye);
  }
  for (const [sx, sz] of [[-0.16, 0.3], [0.16, 0.3], [-0.16, -0.3], [0.16, -0.3]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.4, 6), dark);
    leg.position.set(sx, 0.2, sz);
    g.add(leg);
  }
  return { group: g, headPivot };
}

/** small chicken */
export function makeChicken() {
  const g = new THREE.Group();
  const white = lambert(0xf2efe6);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), white);
  body.scale.set(1, 0.85, 1.25);
  body.position.y = 0.2;
  body.castShadow = true;
  g.add(body);
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.3, 0.16);
  g.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 7), white);
  head.position.set(0, 0.08, 0.04);
  headPivot.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 6), lambert(0xe0a000));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.08, 0.13);
  headPivot.add(beak);
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), lambert(0xcc2222));
  comb.position.set(0, 0.17, 0.03);
  headPivot.add(comb);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 6), white);
  tail.rotation.x = -Math.PI / 3;
  tail.position.set(0, 0.28, -0.2);
  g.add(tail);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 5), lambert(0xe0a000));
    leg.position.set(sx * 0.05, 0.07, 0);
    g.add(leg);
  }
  return { group: g, headPivot };
}
