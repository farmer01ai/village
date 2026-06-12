// world.js — village environment: terrain, houses, farm, well, trees, lighting, day/night
import * as THREE from 'three';
import { makeChicken, makeCow, makeSheep } from './character.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- textures
function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function noisyFill(ctx, s, base, vary, count = 2600, dotSize = 3) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < count; i++) {
    const [r, g, b] = vary();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, dotSize, dotSize);
  }
}

function grassTex() {
  return canvasTexture(256, (ctx, s) => {
    noisyFill(ctx, s, '#5d7a36', () => {
      const v = Math.random();
      return v < 0.5 ? [82 + Math.random() * 25 | 0, 112 + Math.random() * 30 | 0, 45 + Math.random() * 18 | 0]
                     : [70 + Math.random() * 20 | 0, 95 + Math.random() * 25 | 0, 38 + Math.random() * 15 | 0];
    }, 4000, 2);
  }, 24);
}
function dirtTex(rep = 4) {
  return canvasTexture(256, (ctx, s) => {
    noisyFill(ctx, s, '#6e5230', () => [95 + Math.random() * 35 | 0, 70 + Math.random() * 25 | 0, 40 + Math.random() * 18 | 0], 3000, 3);
  }, rep);
}
function plasterTex(base = '#d8cdb4') {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1200; i++) {
      const v = 195 + Math.random() * 35 | 0;
      ctx.fillStyle = `rgba(${v},${v - 12},${v - 35},0.35)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 4, 4);
    }
    // subtle cracks
    ctx.strokeStyle = 'rgba(120,105,80,0.25)';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 40; y += Math.random() * 25; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, 2);
}
function woodTex() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) {
      ctx.fillStyle = `rgb(${100 + Math.random() * 30 | 0},${72 + Math.random() * 22 | 0},${40 + Math.random() * 14 | 0})`;
      ctx.fillRect(0, y, s, 30);
      ctx.fillStyle = 'rgba(50,32,16,0.5)';
      ctx.fillRect(0, y + 30, s, 2);
    }
    ctx.strokeStyle = 'rgba(60,40,20,0.35)';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      const y = Math.random() * s;
      ctx.moveTo(0, y); ctx.bezierCurveTo(s * 0.3, y + 6, s * 0.7, y - 6, s, y);
      ctx.stroke();
    }
  }, 1);
}
function roofTex(color = '#9a4a30') {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);
    const th = 24;
    for (let y = 0; y < s; y += th) {
      for (let x = (y / th) % 2 ? 16 : 0; x < s; x += 32) {
        const sh = Math.random() * 24 | 0;
        ctx.fillStyle = `rgba(${120 + sh},${58 + sh / 2 | 0},${38},1)`;
        ctx.fillRect(x, y, 30, th - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, y + th - 4, 30, 2);
      }
    }
  }, 3);
}
function stoneTex() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#8d8a82';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      const v = 110 + Math.random() * 60 | 0;
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 12 + Math.random() * 22, 9 + Math.random() * 14, Math.random() * 3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,40,38,0.4)';
      ctx.stroke();
    }
  }, 2);
}

function std(map, opts = {}) {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0.0, ...opts });
}

// ---------------------------------------------------------------- world
export function createWorld(scene) {
  const world = {
    obstacles: [],          // {x,z,r} circle colliders
    bounds: 46,
    places: {},             // name -> {pos: Vector3, label}
    crops: [],
    chickens: [],
    chickenHunger: 100,     // 0 = starving, 100 = fed
    nightLights: [],        // lights/emissives toggled at night
    windowMats: [],
    houses: [],
  };

  const texWood = woodTex();
  const texStone = stoneTex();

  // ---------- ground ----------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160, 32, 32),
    std(grassTex())
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // gentle hills at edges (visual border)
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x4d6630, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * TAU + Math.random() * 0.2;
    const r = 58 + Math.random() * 14;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(10 + Math.random() * 12, 12, 9), hillMat);
    hill.position.set(Math.cos(ang) * r, -4 - Math.random() * 2, Math.sin(ang) * r);
    hill.scale.y = 0.55;
    hill.receiveShadow = true;
    scene.add(hill);
  }

  // ---------- dirt paths ----------
  const pathMat = std(dirtTex(6), { polygonOffset: true, polygonOffsetFactor: -1 });
  function addPath(x1, z1, x2, z2, w = 2.4) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, w), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = -Math.atan2(dz, dx);
    p.position.set((x1 + x2) / 2, 0.02, (z1 + z2) / 2);
    p.receiveShadow = true;
    scene.add(p);
  }
  addPath(0, 0, 0, 26);      // square to north
  addPath(0, 0, -26, 8);     // to player home
  addPath(0, 0, 16, 12);     // to field
  addPath(0, 0, -20, -13);   // to coop
  addPath(0, 0, 13, -15);    // to woodpile
  addPath(0, 26, 22, 30);
  addPath(0, 26, -20, 30);

  // ---------- houses ----------
  function makeHouse(x, z, rotY, { wallColor = '#d8cdb4', roofColor = '#9a4a30', w = 6, d = 5, h = 3 } = {}) {
    const house = new THREE.Group();
    const wallMat = std(plasterTex(wallColor));

    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    walls.position.y = h / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    house.add(walls);

    // roof — triangular prism
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.5, 0);
    shape.lineTo(w / 2 + 0.5, 0);
    shape.lineTo(0, h * 0.62);
    shape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.8, bevelEnabled: false });
    const roof = new THREE.Mesh(roofGeo, std(roofTex(roofColor)));
    roof.position.set(0, h, -(d + 0.8) / 2);
    roof.castShadow = true;
    house.add(roof);

    // door
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.1, 0.12), std(texWood));
    door.position.set(0, 1.05, d / 2 + 0.05);
    house.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshStandardMaterial({ color: 0xbbaa55, metalness: 0.7, roughness: 0.3 }));
    knob.position.set(0.35, 1.0, d / 2 + 0.13);
    house.add(knob);

    // windows (emissive at night)
    const winMat = new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0xffc870, emissiveIntensity: 0 });
    world.windowMats.push(winMat);
    for (const sx of [-1, 1]) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.1), std(texWood));
      frame.position.set(sx * w / 3.2, 1.7, d / 2 + 0.03);
      house.add(frame);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.06), winMat);
      pane.position.set(sx * w / 3.2, 1.7, d / 2 + 0.08);
      house.add(pane);
    }
    // side window
    const sidePane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.8), winMat);
    sidePane.position.set(w / 2 + 0.04, 1.7, 0);
    house.add(sidePane);

    // chimney
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), std(texStone));
    chim.position.set(w / 4, h + 1.0, -d / 5);
    chim.castShadow = true;
    house.add(chim);

    house.position.set(x, 0, z);
    house.rotation.y = rotY;
    scene.add(house);

    world.obstacles.push({ x, z, r: Math.max(w, d) / 2 + 0.6 });
    // door world position
    const doorPos = new THREE.Vector3(0, 0, d / 2 + 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(new THREE.Vector3(x, 0, z));
    world.houses.push({ x, z, doorPos });
    return { house, doorPos };
  }

  // player home (south-west)
  const home = makeHouse(-26, 10, Math.PI / 2.2, { wallColor: '#e0d6bd', roofColor: '#8a4028' });
  world.places.home = { pos: home.doorPos, label: 'خانه کریم' };

  // NPC houses around the village
  const houseSpecs = [
    [-12, 30, Math.PI,        '#d8cdb4', '#9a4a30'],
    [-2, 33, Math.PI,         '#cfc3a6', '#7d4a3a'],
    [9, 31, Math.PI + 0.3,    '#ddd2b8', '#9a4a30'],
    [22, 26, -Math.PI / 1.6,  '#d2c5a4', '#864a30'],
    [-24, -4, Math.PI / 2,    '#d8cdb4', '#7d4a3a'],
    [26, 4, -Math.PI / 2,     '#e0d6bd', '#9a4a30'],
    [-15, -22, 0.3,           '#cfc3a6', '#864a30'],
  ];
  const npcDoors = [];
  for (const [hx, hz, rot, wc, rc] of houseSpecs) {
    const hh = makeHouse(hx, hz, rot, { wallColor: wc, roofColor: rc, w: 5.4, d: 4.6 });
    npcDoors.push(hh.doorPos);
  }
  world.npcDoors = npcDoors;

  // ---------- village square & well ----------
  const squareTile = new THREE.Mesh(new THREE.CircleGeometry(6.5, 28), std(stoneTex(), { polygonOffset: true, polygonOffsetFactor: -1 }));
  squareTile.rotation.x = -Math.PI / 2;
  squareTile.position.set(0, 0.03, 0);
  squareTile.receiveShadow = true;
  scene.add(squareTile);
  world.places.square = { pos: new THREE.Vector3(3.5, 0, 3.5), label: 'میدان روستا' };

  // well
  const well = new THREE.Group();
  const wellBase = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 1.0, 14), std(texStone));
  wellBase.position.y = 0.5;
  wellBase.castShadow = true;
  well.add(wellBase);
  const wellHole = new THREE.Mesh(new THREE.CircleGeometry(0.85, 14), new THREE.MeshStandardMaterial({ color: 0x0a1a2a }));
  wellHole.rotation.x = -Math.PI / 2;
  wellHole.position.y = 1.01;
  well.add(wellHole);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 0.14), std(texWood));
    post.position.set(sx * 1.0, 1.7, 0);
    post.castShadow = true;
    well.add(post);
  }
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 8), std(texWood));
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.y = 2.35;
  well.add(crossbar);
  const wellRoof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.9, 4), std(roofTex('#7d4a3a')));
  wellRoof.rotation.y = Math.PI / 4;
  wellRoof.position.y = 3.0;
  wellRoof.castShadow = true;
  well.add(wellRoof);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9), new THREE.MeshStandardMaterial({ color: 0xbfa97a }));
  rope.position.y = 1.85;
  well.add(rope);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.22, 10, 1, true), std(texWood, { side: THREE.DoubleSide }));
  bucket.position.y = 1.35;
  well.add(bucket);
  well.position.set(0, 0, 0);
  scene.add(well);
  world.obstacles.push({ x: 0, z: 0, r: 1.6 });
  world.places.well = { pos: new THREE.Vector3(2.2, 0, 0), label: 'چاه آب' };

  // benches at the square
  for (const [bx, bz, br] of [[-4.5, 3, 0.6], [4.5, -3.5, -2.2]]) {
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.45), std(texWood));
    seat.position.y = 0.45;
    seat.castShadow = true;
    bench.add(seat);
    for (const sx of [-0.7, 0.7]) {
      const legM = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.4), std(texWood));
      legM.position.set(sx, 0.22, 0);
      bench.add(legM);
    }
    bench.position.set(bx, 0, bz);
    bench.rotation.y = br;
    scene.add(bench);
  }

  // ---------- farm field ----------
  const FIELD = { x: 20, z: 16, w: 18, d: 13 };
  const soil = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.w, FIELD.d), std(dirtTex(5), { polygonOffset: true, polygonOffsetFactor: -1 }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(FIELD.x, 0.025, FIELD.z);
  soil.receiveShadow = true;
  scene.add(soil);
  world.places.field = { pos: new THREE.Vector3(FIELD.x - FIELD.w / 2 - 1.5, 0, FIELD.z), label: 'مزرعه گندم' };

  // soil row mounds
  const rowMat = new THREE.MeshStandardMaterial({ color: 0x5a4226, roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const row = new THREE.Mesh(new THREE.BoxGeometry(FIELD.w - 1.6, 0.12, 0.7), rowMat);
    row.position.set(FIELD.x, 0.06, FIELD.z - FIELD.d / 2 + 1.4 + i * 2.0);
    row.receiveShadow = true;
    scene.add(row);
  }

  // wheat crops — states: dry(0) -> growing(1) -> ready(2)
  const wheatGreen = new THREE.MeshStandardMaterial({ color: 0x6a8f3c, roughness: 0.9 });
  const wheatGold = new THREE.MeshStandardMaterial({ color: 0xd9b24f, roughness: 0.85 });
  function makeWheatPlant() {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 1, 4), wheatGreen);
      stem.position.set((Math.random() - 0.5) * 0.3, 0.5, (Math.random() - 0.5) * 0.3);
      stem.rotation.z = (Math.random() - 0.5) * 0.22;
      g.add(stem);
      const headG = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), wheatGreen);
      headG.position.set(stem.position.x, 1.05, stem.position.z);
      g.add(headG);
    }
    return g;
  }
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 8; c++) {
      const plant = makeWheatPlant();
      const px = FIELD.x - FIELD.w / 2 + 1.8 + c * 2.0;
      const pz = FIELD.z - FIELD.d / 2 + 1.4 + r * 2.0;
      plant.position.set(px, 0.1, pz);
      const state = Math.random() < 0.45 ? 0 : (Math.random() < 0.5 ? 1 : 2);
      const crop = { mesh: plant, state, growth: state === 1 ? Math.random() * 0.7 : 0 };
      scene.add(plant);
      world.crops.push(crop);
      applyCropVisual(crop);
    }
  }
  function applyCropVisual(crop) {
    const s = crop.state === 0 ? 0.35 : crop.state === 1 ? 0.45 + crop.growth * 0.45 : 1.0;
    crop.mesh.scale.setScalar(s);
    const golden = crop.state === 2;
    crop.mesh.traverse(o => {
      if (o.isMesh) o.material = golden ? wheatGold : wheatGreen;
    });
  }
  world.applyCropVisual = applyCropVisual;

  // fence around field
  function fenceLine(x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const n = Math.floor(len / 2);
    const dir = new THREE.Vector3(dx / len, 0, dz / len);
    for (let i = 0; i <= n; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), std(texWood));
      post.position.set(x1 + dir.x * i * 2, 0.5, z1 + dir.z * i * 2);
      post.castShadow = true;
      scene.add(post);
    }
    for (const h of [0.45, 0.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.05), std(texWood));
      rail.position.set((x1 + x2) / 2, h, (z1 + z2) / 2);
      rail.rotation.y = -Math.atan2(dz, dx);
      scene.add(rail);
    }
  }
  const fx1 = FIELD.x - FIELD.w / 2, fx2 = FIELD.x + FIELD.w / 2;
  const fz1 = FIELD.z - FIELD.d / 2, fz2 = FIELD.z + FIELD.d / 2;
  fenceLine(fx1, fz1, fx2, fz1);
  fenceLine(fx2, fz1, fx2, fz2);
  fenceLine(fx1, fz2, fx2, fz2);
  fenceLine(fx1, fz1, fx1, fz1 + 3.5); // gate gap on west side

  // ---------- chicken coop ----------
  const COOP = { x: -22, z: -14 };
  const coopHouse = new THREE.Group();
  const coopBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.0), std(texWood));
  coopBody.position.y = 1.0;
  coopBody.castShadow = true;
  coopHouse.add(coopBody);
  const coopRoof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.12, 2.4), std(roofTex('#6a4a30')));
  coopRoof.position.y = 1.9;
  coopRoof.rotation.z = 0.12;
  coopHouse.add(coopRoof);
  const coopDoor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.05), new THREE.MeshStandardMaterial({ color: 0x21150c }));
  coopDoor.position.set(0, 0.55, 1.03);
  coopHouse.add(coopDoor);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.2), std(texWood));
  ramp.position.set(0, 0.18, 1.6);
  ramp.rotation.x = 0.32;
  coopHouse.add(ramp);
  coopHouse.position.set(COOP.x, 0.3, COOP.z);
  scene.add(coopHouse);
  world.obstacles.push({ x: COOP.x, z: COOP.z, r: 1.8 });
  // coop yard fence
  fenceLine(COOP.x - 4, COOP.z - 3.5, COOP.x + 4, COOP.z - 3.5);
  fenceLine(COOP.x - 4, COOP.z + 3.5, COOP.x + 4, COOP.z + 3.5);
  fenceLine(COOP.x - 4, COOP.z - 3.5, COOP.x - 4, COOP.z + 3.5);
  world.places.coop = { pos: new THREE.Vector3(COOP.x + 5, 0, COOP.z), label: 'مرغدانی' };

  // chickens
  for (let i = 0; i < 5; i++) {
    const ch = makeChicken();
    ch.group.position.set(COOP.x + (Math.random() - 0.5) * 5, 0, COOP.z + (Math.random() - 0.5) * 4);
    ch.group.rotation.y = Math.random() * TAU;
    scene.add(ch.group);
    world.chickens.push({ ...ch, t: Math.random() * 10, tx: ch.group.position.x, tz: ch.group.position.z, peck: 0 });
  }
  world.coopArea = { x: COOP.x, z: COOP.z, w: 7.5, d: 6.5 };

  // ---------- woodpile ----------
  const WOOD = { x: 16, z: -16 };
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.55, 12), std(texWood));
  stump.position.set(WOOD.x, 0.27, WOOD.z);
  stump.castShadow = true;
  scene.add(stump);
  // axe on the stump
  const axe = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.8, 6), std(texWood));
  handle.rotation.z = 0.7;
  axe.add(handle);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.04), new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.8, roughness: 0.35 }));
  blade.position.set(-0.27, 0.3, 0);
  axe.add(blade);
  axe.position.set(WOOD.x, 0.6, WOOD.z);
  scene.add(axe);
  // log stack
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 4 - layer; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 9), std(texWood));
      log.rotation.x = Math.PI / 2;
      log.position.set(WOOD.x + 1.6, 0.17 + layer * 0.3, WOOD.z + i * 0.36 - 0.6 + layer * 0.17);
      log.castShadow = true;
      scene.add(log);
    }
  }
  world.obstacles.push({ x: WOOD.x + 1, z: WOOD.z, r: 1.5 });
  world.places.woodpile = { pos: new THREE.Vector3(WOOD.x - 1.5, 0, WOOD.z), label: 'محل هیزم‌شکنی' };

  // ---------- pasture (cows & sheep) ----------
  const PASTURE = { x: 33, z: -9, w: 12, d: 10 };
  fenceLine(PASTURE.x - PASTURE.w / 2, PASTURE.z - PASTURE.d / 2, PASTURE.x + PASTURE.w / 2, PASTURE.z - PASTURE.d / 2);
  fenceLine(PASTURE.x - PASTURE.w / 2, PASTURE.z + PASTURE.d / 2, PASTURE.x + PASTURE.w / 2, PASTURE.z + PASTURE.d / 2);
  fenceLine(PASTURE.x + PASTURE.w / 2, PASTURE.z - PASTURE.d / 2, PASTURE.x + PASTURE.w / 2, PASTURE.z + PASTURE.d / 2);
  fenceLine(PASTURE.x - PASTURE.w / 2, PASTURE.z + PASTURE.d / 2, PASTURE.x - PASTURE.w / 2, PASTURE.z + 1.5); // gate gap
  world.places.pasture = { pos: new THREE.Vector3(PASTURE.x - PASTURE.w / 2 - 1.2, 0, PASTURE.z - 1), label: 'چراگاه دام‌ها' };
  world.pastureArea = PASTURE;

  // water trough
  const trough = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.6), std(texWood));
  trough.position.set(PASTURE.x + PASTURE.w / 2 - 1.2, 0.2, PASTURE.z);
  trough.castShadow = true;
  scene.add(trough);
  const troughWater = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.45), new THREE.MeshStandardMaterial({ color: 0x3a6b8a, roughness: 0.2 }));
  troughWater.position.set(PASTURE.x + PASTURE.w / 2 - 1.2, 0.36, PASTURE.z);
  scene.add(troughWater);

  world.animals = [];
  function addAnimal(maker, speed) {
    const a = maker();
    a.group.position.set(
      PASTURE.x + (Math.random() - 0.5) * (PASTURE.w - 2),
      0,
      PASTURE.z + (Math.random() - 0.5) * (PASTURE.d - 2)
    );
    a.group.rotation.y = Math.random() * TAU;
    scene.add(a.group);
    world.animals.push({
      ...a, speed,
      t: Math.random() * 4, graze: Math.random() * 3,
      tx: a.group.position.x, tz: a.group.position.z,
    });
  }
  for (let i = 0; i < 3; i++) addAnimal(makeCow, 0.6);
  for (let i = 0; i < 5; i++) addAnimal(makeSheep, 0.8);

  // ---------- trees ----------
  const foliageMats = [0x3f6b2a, 0x4a7a33, 0x35602a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  const trunkMat = std(texWood);
  function addTree(x, z, s = 1) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.3 * s, 2.4 * s, 7), trunkMat);
    trunk.position.y = 1.2 * s;
    trunk.castShadow = true;
    t.add(trunk);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry((0.9 + Math.random() * 0.5) * s, 9, 7), foliageMats[i % 3]);
      f.position.set((Math.random() - 0.5) * 1.2 * s, (2.4 + Math.random() * 1.3) * s, (Math.random() - 0.5) * 1.2 * s);
      f.castShadow = true;
      t.add(f);
    }
    t.position.set(x, 0, z);
    scene.add(t);
    world.obstacles.push({ x, z, r: 0.5 * s });
  }
  const treeSpots = [];
  for (let i = 0; i < 38; i++) {
    let x, z, ok = false, tries = 0;
    while (!ok && tries++ < 30) {
      x = (Math.random() - 0.5) * 88;
      z = (Math.random() - 0.5) * 88;
      ok = Math.hypot(x, z) > 12 &&
        !(x > fx1 - 3 && x < fx2 + 3 && z > fz1 - 3 && z < fz2 + 3) &&
        !world.obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.r + 3.5) &&
        !treeSpots.some(t => Math.hypot(x - t[0], z - t[1]) < 4);
    }
    if (ok) { treeSpots.push([x, z]); addTree(x, z, 0.8 + Math.random() * 0.7); }
  }
  // bushes
  for (let i = 0; i < 25; i++) {
    const x = (Math.random() - 0.5) * 85, z = (Math.random() - 0.5) * 85;
    if (Math.hypot(x, z) < 10 || world.obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.r + 1.5)) continue;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.4 + Math.random() * 0.4, 7, 6), foliageMats[(Math.random() * 3) | 0]);
    b.position.set(x, 0.3, z);
    b.scale.y = 0.7;
    b.castShadow = true;
    scene.add(b);
  }

  // ---------- lamp posts ----------
  const lampSpots = [[-3, 6], [5, -4], [-2, 24], [18, 8]];
  for (const [lx, lz] of lampSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x2c2c30, metalness: 0.5, roughness: 0.5 }));
    pole.position.set(lx, 1.6, lz);
    pole.castShadow = true;
    scene.add(pole);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x332b18, emissive: 0xffc870, emissiveIntensity: 0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), lampMat);
    bulb.position.set(lx, 3.25, lz);
    scene.add(bulb);
    const light = new THREE.PointLight(0xffc070, 0, 14, 1.8);
    light.position.set(lx, 3.2, lz);
    scene.add(light);
    world.nightLights.push({ light, mat: lampMat });
    world.obstacles.push({ x: lx, z: lz, r: 0.3 });
  }

  // ---------- lighting & sky ----------
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a6b42, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffeedd, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0);
  scene.add(moon);

  scene.fog = new THREE.Fog(0x87ceeb, 60, 140);

  const skyCols = {
    night: new THREE.Color(0x0b1228),
    dawn: new THREE.Color(0xe8946a),
    day: new THREE.Color(0x87ceeb),
    dusk: new THREE.Color(0xd97a4a),
  };
  const tmpCol = new THREE.Color();

  world.updateEnvironment = function (hour) {
    // sun path: rises 6, sets 19
    const dayT = (hour - 6) / 13; // 0..1 across daylight
    const sunAng = dayT * Math.PI;
    const up = Math.sin(sunAng);
    sun.position.set(Math.cos(sunAng) * 70, Math.max(up, 0.02) * 80, 30);
    sun.intensity = THREE.MathUtils.clamp(up * 2.0, 0, 1.7);
    // warm color at low sun
    sun.color.setHSL(0.1 + up * 0.04, 0.5 - up * 0.3, 0.6 + up * 0.15);

    const night = hour < 5.5 || hour > 19.5;
    moon.intensity = night ? 0.22 : 0;
    moon.position.set(-40, 60, -30);
    hemi.intensity = 0.12 + THREE.MathUtils.clamp(up, 0, 1) * 0.55;

    // sky color blend
    if (hour >= 6 && hour <= 8) tmpCol.lerpColors(skyCols.dawn, skyCols.day, (hour - 6) / 2);
    else if (hour > 8 && hour < 17.5) tmpCol.copy(skyCols.day);
    else if (hour >= 17.5 && hour <= 19.5) tmpCol.lerpColors(skyCols.day, skyCols.dusk, (hour - 17.5) / 2);
    else if (hour > 19.5 && hour <= 21) tmpCol.lerpColors(skyCols.dusk, skyCols.night, (hour - 19.5) / 1.5);
    else if (hour >= 4.5 && hour < 6) tmpCol.lerpColors(skyCols.night, skyCols.dawn, (hour - 4.5) / 1.5);
    else tmpCol.copy(skyCols.night);
    scene.background = tmpCol.clone();
    scene.fog.color.copy(tmpCol);

    // lights & windows
    const lampsOn = hour < 6.2 || hour > 18.8;
    for (const { light, mat } of world.nightLights) {
      light.intensity = lampsOn ? 1.6 : 0;
      mat.emissiveIntensity = lampsOn ? 1.4 : 0;
    }
    for (const m of world.windowMats) m.emissiveIntensity = lampsOn ? 0.9 : 0;
  };

  // crop growth + chicken behavior
  world.tick = function (dt, hoursPerSec) {
    for (const crop of world.crops) {
      if (crop.state === 1) {
        crop.growth += dt * hoursPerSec / 6; // ~6 game-hours to grow
        if (crop.growth >= 1) { crop.state = 2; crop.growth = 0; }
        applyCropVisual(crop);
      }
    }
    world.chickenHunger = Math.max(0, world.chickenHunger - dt * hoursPerSec * 6);
    for (const ch of world.chickens) {
      ch.t -= dt;
      if (ch.t <= 0) {
        ch.t = 2 + Math.random() * 4;
        ch.tx = world.coopArea.x + (Math.random() - 0.5) * world.coopArea.w;
        ch.tz = world.coopArea.z + (Math.random() - 0.5) * world.coopArea.d;
        ch.peck = Math.random() < 0.5 ? 1.2 : 0;
      }
      const dx = ch.tx - ch.group.position.x, dz = ch.tz - ch.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.15 && ch.peck <= 0) {
        ch.group.position.x += dx / d * dt * 0.8;
        ch.group.position.z += dz / d * dt * 0.8;
        ch.group.rotation.y = Math.atan2(dx, dz);
        ch.group.position.y = Math.abs(Math.sin(performance.now() / 90)) * 0.04;
      }
      if (ch.peck > 0) {
        ch.peck -= dt;
        ch.headPivot.rotation.x = Math.abs(Math.sin(performance.now() / 130)) * 0.9;
      } else ch.headPivot.rotation.x *= 0.8;
    }

    // cows & sheep — slow wander + grazing inside the pasture
    const P = world.pastureArea;
    for (const a of world.animals) {
      a.t -= dt;
      if (a.t <= 0) {
        a.t = 4 + Math.random() * 6;
        a.graze = Math.random() < 0.65 ? 2.5 + Math.random() * 3 : 0;
        a.tx = P.x + (Math.random() - 0.5) * (P.w - 2.2);
        a.tz = P.z + (Math.random() - 0.5) * (P.d - 2.2);
      }
      if (a.graze > 0) {
        a.graze -= dt;
        a.headPivot.rotation.x = Math.min(0.75, a.headPivot.rotation.x + dt * 1.5);
      } else {
        a.headPivot.rotation.x = Math.max(0, a.headPivot.rotation.x - dt * 1.5);
        const dx = a.tx - a.group.position.x, dz = a.tz - a.group.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          a.group.position.x += dx / d * a.speed * dt;
          a.group.position.z += dz / d * a.speed * dt;
          const want = Math.atan2(dx, dz);
          let dh = want - a.group.rotation.y;
          while (dh > Math.PI) dh -= TAU;
          while (dh < -Math.PI) dh += TAU;
          a.group.rotation.y += dh * Math.min(1, dt * 3);
        }
      }
    }
  };

  // helpers
  world.collide = function (pos, radius = 0.45) {
    for (const o of world.obstacles) {
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + radius;
      if (d < min && d > 0.0001) {
        pos.x = o.x + dx / d * min;
        pos.z = o.z + dz / d * min;
      }
    }
    const b = world.bounds;
    pos.x = THREE.MathUtils.clamp(pos.x, -b, b);
    pos.z = THREE.MathUtils.clamp(pos.z, -b, b);
  };

  world.cropCounts = function () {
    let dry = 0, growing = 0, ready = 0;
    for (const c of world.crops) {
      if (c.state === 0) dry++; else if (c.state === 1) growing++; else ready++;
    }
    return { dry, growing, ready };
  };

  return world;
}
