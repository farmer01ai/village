// player.js — third-person player controller (manual + AI navigation)
import * as THREE from 'three';
import { makeCharacter } from './character.js';

const WALK = 3.4, RUN = 6.4;

export class Player {
  constructor(scene, world, camera, domElement) {
    this.world = world;
    this.camera = camera;
    this.dom = domElement;

    this.char = makeCharacter({ skin: 0xd9a06b, shirt: 0x5e7247, pants: 0x4a3b2a, hat: 0xc9a85a });
    this.char.group.position.copy(world.places.home.pos);
    this.char.group.position.x += 2;
    scene.add(this.char.group);

    this.pos = this.char.group.position;
    this.heading = 0;          // character facing
    this.camYaw = Math.PI;     // camera orbit
    this.camPitch = 0.32;
    this.keys = {};
    this.aiControlled = false;
    this.navTarget = null;     // {pos, cb}
    this.busy = false;         // performing a task — freeze movement

    // stats
    this.energy = 100;
    this.hunger = 100;
    this.water = 0;            // bucket units (max 5)
    this.wheat = 2;
    this.wood = 0;

    window.addEventListener('keydown', e => { this.keys[e.code] = true; });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== this.dom) return;
      this.camYaw -= e.movementX * 0.0026;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + e.movementY * 0.0022, -0.15, 1.1);
    });
  }

  setNavTarget(pos, cb) {
    this.navTarget = { pos: pos.clone(), cb };
  }
  clearNav() { this.navTarget = null; }

  update(dt, hoursPerSec) {
    const speedScale = this.energy < 12 ? 0.5 : 1;
    let moving = false, running = false;

    if (this.busy) {
      this.char.setWalking(false);
    } else if (this.navTarget) {
      // AI / scripted navigation
      const t = this.navTarget.pos;
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7) {
        const cb = this.navTarget.cb;
        this.navTarget = null;
        if (cb) cb();
      } else {
        const sp = (d > 8 ? RUN : WALK) * speedScale;
        this.pos.x += dx / d * sp * dt;
        this.pos.z += dz / d * sp * dt;
        this.heading = Math.atan2(dx, dz);
        moving = true; running = sp > WALK;
      }
    } else if (!this.aiControlled) {
      // manual WASD relative to camera yaw
      let ix = 0, iz = 0;
      if (this.keys['KeyW']) iz += 1;
      if (this.keys['KeyS']) iz -= 1;
      if (this.keys['KeyA']) ix += 1;
      if (this.keys['KeyD']) ix -= 1;
      if (ix || iz) {
        const len = Math.hypot(ix, iz);
        ix /= len; iz /= len;
        running = !!this.keys['ShiftLeft'] && this.energy > 5;
        const sp = (running ? RUN : WALK) * speedScale;
        const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
        const wx = iz * sin + ix * cos;
        const wz = iz * cos - ix * sin;
        this.pos.x += wx * sp * dt;
        this.pos.z += wz * sp * dt;
        this.heading = Math.atan2(wx, wz);
        moving = true;
      }
    }

    this.world.collide(this.pos);
    this.char.setWalking(moving, running ? 1.5 : 1);
    // smooth turn
    let dh = this.heading - this.char.group.rotation.y;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.char.group.rotation.y += dh * Math.min(1, dt * 12);
    this.char.update(dt);

    // stat drain
    this.hunger = Math.max(0, this.hunger - dt * hoursPerSec * 3.2);
    if (moving) this.energy = Math.max(0, this.energy - dt * hoursPerSec * (running ? 7 : 2.5));
    if (this.hunger <= 0) this.energy = Math.max(0, this.energy - dt * hoursPerSec * 5);

    // camera follow-orbit
    const camDist = 6.2, camH = 2.2;
    const cx = this.pos.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * camDist;
    const cz = this.pos.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * camDist;
    const cy = this.pos.y + camH + Math.sin(this.camPitch) * camDist;
    this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 8));
    this.camera.lookAt(this.pos.x, this.pos.y + 1.4, this.pos.z);
  }

  distanceTo(v) {
    return Math.hypot(v.x - this.pos.x, v.z - this.pos.z);
  }

  nearestPlace() {
    let best = null, bd = Infinity;
    for (const [name, p] of Object.entries(this.world.places)) {
      const d = this.distanceTo(p.pos);
      if (d < bd) { bd = d; best = name; }
    }
    return { name: best, dist: bd };
  }
}
