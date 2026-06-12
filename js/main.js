// main.js — bootstrap, game loop, UI wiring
import * as THREE from 'three';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { createNPCs, updateNPCs, nearestNPC, npcLine } from './npc.js';
import { TaskSystem, TASK_DEFS } from './tasks.js';
import { AIController } from './ai.js';

// ---------------- renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 300);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------- time ----------------
const DAY_LENGTH_SEC = 480;                 // one full game day = 8 real minutes
const HOURS_PER_SEC = 24 / DAY_LENGTH_SEC;
let gameHour = 7.0;
let dayNumber = 1;

// ---------------- UI helpers ----------------
const $ = id => document.getElementById(id);
const ui = {
  message(text, dur = 3000) {
    const el = $('msg');
    el.textContent = text;
    el.style.opacity = 1;
    clearTimeout(ui._mt);
    ui._mt = setTimeout(() => { el.style.opacity = 0; }, dur);
  },
  showHint(text) { const el = $('hint'); el.textContent = text; el.style.display = 'block'; },
  hideHint() { $('hint').style.display = 'none'; },
  showProgress(label) { $('progresslabel').textContent = label + '...'; $('progresswrap').style.display = 'block'; },
  setProgress(f) { $('progressbar').firstElementChild.style.width = Math.min(100, f * 100) + '%'; },
  hideProgress() { $('progresswrap').style.display = 'none'; },
  showDialogue(name, text) {
    const d = $('dialogue');
    d.querySelector('.name').textContent = name;
    d.querySelector('.text').textContent = text;
    d.style.display = 'block';
  },
  hideDialogue() { $('dialogue').style.display = 'none'; },
  aiLog(title, text, cls) {
    const log = $('ai-log');
    const e = document.createElement('div');
    e.className = 'e';
    e.innerHTML = `<span class="${cls}">${title}</span> — ${text}`;
    log.prepend(e);
    while (log.children.length > 40) log.lastChild.remove();
  },
  setAIActive(on) {
    const btn = $('ai-start');
    btn.textContent = on ? '⏹ توقف کنترل خودکار' : '▶ شروع کنترل خودکار';
    btn.classList.toggle('active', on);
    $('ai-status').textContent = on
      ? 'فعال — هوش مصنوعی شخصیت را کنترل می‌کند'
      : 'غیرفعال — شخصیت را خودتان کنترل می‌کنید';
  },
};

// ---------------- build game ----------------
const world = createWorld(scene);
const player = new Player(scene, world, camera, renderer.domElement);
const npcs = createNPCs(scene, world);

const G = {
  player, world, npcs, ui,
  get hour() { return gameHour; },
  getHour: () => gameHour,
  sleepRequested: false,
};
const tasks = new TaskSystem(player, world, npcs, G, ui);
G.tasks = tasks;
const ai = new AIController(G);

// ---------------- interaction (E key) ----------------
let dialogueTimer = null;
addEventListener('keydown', e => {
  if (e.code === 'KeyE' && !player.aiControlled && !player.busy) {
    const npc = nearestNPC(npcs, player);
    if (npc) {
      const line = npcLine(npc);
      ui.showDialogue(npc.name + ' — ' + npc.def.role, line);
      clearTimeout(dialogueTimer);
      dialogueTimer = setTimeout(() => ui.hideDialogue(), 4000);
      return;
    }
    const ctx = tasks.contextualTask();
    if (ctx) tasks.start(ctx.id);
  }
  if (e.code === 'KeyT') {
    const p = $('ai-panel');
    const visible = p.style.display === 'block';
    p.style.display = visible ? 'none' : 'block';
    if (!visible) document.exitPointerLock?.();
  }
});

// ---------------- AI panel ----------------
$('ai-toggle').onclick = () => {
  const p = $('ai-panel');
  p.style.display = p.style.display === 'block' ? 'none' : 'block';
  if (p.style.display === 'block') document.exitPointerLock?.();
};
$('ai-key').value = localStorage.getItem('village_api_key') || '';
$('ai-model').value = localStorage.getItem('village_ai_model') || 'claude-opus-4-8';
$('ai-start').onclick = () => {
  if (ai.running) { ai.stop(); return; }
  const key = $('ai-key').value.trim();
  if (!key) { ui.aiLog('خطا', 'ابتدا کلید API را وارد کنید', 'err'); return; }
  localStorage.setItem('village_api_key', key);
  localStorage.setItem('village_ai_model', $('ai-model').value);
  ui.setAIActive(true);
  ai.start(key, $('ai-model').value);
};

// ---------------- start screen / pointer lock ----------------
let started = false;
$('start-btn').onclick = () => {
  $('start-screen').style.display = 'none';
  started = true;
  renderer.domElement.requestPointerLock?.();
};
renderer.domElement.addEventListener('click', () => {
  if (started && !ai.running && $('ai-panel').style.display !== 'block') {
    renderer.domElement.requestPointerLock?.();
  }
});

// ---------------- sleep transition ----------------
let sleeping = 0;
function handleSleep() {
  if (!G.sleepRequested) return;
  G.sleepRequested = false;
  sleeping = 2.0; // fade duration
  player.energy = 100;
  player.hunger = Math.max(30, player.hunger - 15);
  dayNumber += 1;
  gameHour = 6.0;
  // Karim goes inside his house for the night
  const door = world.places.home.pos;
  player.pos.set(door.x, 0, door.z);
  ui.message('کریم وارد خانه‌اش شد و تا صبح استراحت کرد 🌙', 4000);
}

// ---------------- HUD ----------------
const DAY_PARTS = [[5, 'سحر'], [7, 'صبح'], [12, 'ظهر'], [15, 'عصر'], [19, 'غروب'], [21, 'شب']];
function partOfDay(h) {
  let label = 'شب';
  for (const [t, l] of DAY_PARTS) if (h >= t) label = l;
  return label;
}
const faDigits = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
function updateHUD() {
  const hh = String(Math.floor(gameHour)).padStart(2, '0');
  const mm = String(Math.floor((gameHour % 1) * 60)).padStart(2, '0');
  $('clock').textContent = `${hh}:${mm}`;
  $('daylabel').textContent = `روز ${faDigits(dayNumber)} — ${partOfDay(gameHour)}`;
  $('energybar').firstElementChild.style.width = player.energy + '%';
  $('hungerbar').firstElementChild.style.width = player.hunger + '%';
  $('inv-water').textContent = faDigits(player.water);
  $('inv-wheat').textContent = faDigits(player.wheat);
  $('inv-wood').textContent = faDigits(player.wood);
}

function updateHint() {
  if (player.aiControlled || player.busy) { ui.hideHint(); return; }
  const npc = nearestNPC(npcs, player);
  if (npc) { ui.showHint(`E — صحبت با ${npc.name}`); return; }
  const ctx = tasks.contextualTask();
  if (ctx) {
    const err = TASK_DEFS[ctx.id].can(player, world, G);
    ui.showHint(err ? `${ctx.def.label}: ${err}` : `E — ${ctx.def.label}`);
    return;
  }
  ui.hideHint();
}

// debug handle (console only)
window.__village = { G, ai, setHour: h => { gameHour = h; }, getHour: () => gameHour };

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let hudT = 0;

function animate() {
  requestAnimationFrame(animate);
  step(Math.min(clock.getDelta(), 0.1));
}
// keep the simulation (NPCs, AI mode, time) running while the tab is in background;
// browsers throttle timers there, so catch up with fixed sub-steps
setInterval(() => {
  if (!document.hidden) return;
  let elapsed = Math.min(clock.getDelta(), 3);
  while (elapsed > 0) { step(Math.min(elapsed, 0.1)); elapsed -= 0.1; }
}, 250);

function step(dt) {
  if (!started) { renderer.render(scene, camera); return; }

  // time advance (freeze during sleep fade)
  if (sleeping > 0) {
    sleeping -= dt;
    renderer.toneMappingExposure = Math.max(0.02, Math.abs(sleeping - 1.0)) * 1.05;
    // hidden inside the house during the dark part of the fade
    player.char.group.visible = sleeping < 0.5 || sleeping > 1.5;
  } else {
    player.char.group.visible = true;
    renderer.toneMappingExposure = 1.05;
    gameHour += dt * HOURS_PER_SEC;
    if (gameHour >= 24) { gameHour -= 24; dayNumber += 1; }
  }

  world.updateEnvironment(gameHour);
  world.tick(dt, HOURS_PER_SEC);
  player.update(dt, HOURS_PER_SEC);
  updateNPCs(npcs, world, player, dt, gameHour);
  tasks.update(dt);
  handleSleep();

  hudT -= dt;
  if (hudT <= 0) { hudT = 0.2; updateHUD(); updateHint(); }

  renderer.render(scene, camera);
}
animate();
