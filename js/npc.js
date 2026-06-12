// npc.js — 10 villagers with daily schedules, wandering and dialogue
import * as THREE from 'three';
import { makeCharacter } from './character.js';

const NPC_DEFS = [
  { name: 'حاج رضا',  role: 'ریش‌سفید روستا', skin: 0xcf9a66, shirt: 0x6e6e6e, pants: 0x3c3c3c, hat: 0xd8d8d8,
    lines: ['سلام پسرم، روزگار چطور می‌گذره؟', 'قدیم‌ها این روستا پر از جمعیت بود...', 'مواظب محصولت باش، امسال بارون کم باریده.'] },
  { name: 'مشدی حسن', role: 'کشاورز', skin: 0xc28a55, shirt: 0x4f6b7d, pants: 0x4a3b2a, hat: 0xc9a85a,
    lines: ['گندم‌های امسال خوب قد کشیدن!', 'صبح زود کار کن که آفتاب نسوزونتت.', 'بیل و کلنگم رو ندیدی؟'] },
  { name: 'کبری خانم', role: 'نانوا', skin: 0xd9a06b, shirt: 0x8a4a5e, dress: 0x6e3548, scarf: 0xd8cdb4,
    lines: ['نون تازه از تنور درآوردم، بوش رو حس می‌کنی؟', 'اگه گندم آوردی برات آرد می‌کنم.', 'بچه‌ها باز توی میدون شلوغ کردن!'] },
  { name: 'اصغر آقا', role: 'چوپان', skin: 0xb87f4d, shirt: 0x5f5f48, pants: 0x3d3528, hat: 0x8a7a5a,
    lines: ['گوسفندها رو بردم چرا، الان برگشتم.', 'گرگ دیشب نزدیک ده اومده بود، مواظب باش!', 'هوای امروز برای چرا عالیه.'] },
  { name: 'فاطمه خانم', role: 'خیاط', skin: 0xdaa877, shirt: 0x4a6b8a, dress: 0x35506e, scarf: 0xe8e0d0,
    lines: ['پیرهنت پاره شده، بیار برات بدوزم.', 'دارم برای عروسی ده پارچه می‌دوزم.', 'نخ و سوزنم تموم شده، باید برم شهر.'] },
  { name: 'قاسم',     role: 'نجار', skin: 0xc28a55, shirt: 0x7d5a3c, pants: 0x4a3b2a,
    lines: ['اگه هیزم اضافه داری ازت می‌خرم!', 'دارم برای مسجد در چوبی می‌سازم.', 'صدای اره که میاد یعنی کار و بار خوبه.'] },
  { name: 'زهرا',     role: 'دختر روستا', skin: 0xe0b080, shirt: 0x8a6a9e, dress: 0x6a4a85, scarf: 0xd0c8e8,
    lines: ['داشتم از چشمه آب می‌آوردم.', 'گل‌های دشت امسال خیلی قشنگ شدن!', 'مادرم گفته زود برگردم خونه.'] },
  { name: 'ابراهیم',  role: 'آهنگر', skin: 0xa87545, shirt: 0x4d4d52, pants: 0x33333a,
    lines: ['داسِت کند شده؟ بیار تیزش کنم.', 'آتیش کوره از صبح روشنه.', 'بازوهام از پتک زدن درد می‌کنه.'] },
  { name: 'سکینه خانم', role: 'همسایه', skin: 0xd9a06b, shirt: 0x6e8a5a, dress: 0x4d6b3c, scarf: 0xc8d8b8,
    lines: ['مرغ‌هات رو غذا دادی؟ صداشون بلند شده!', 'برات ماست محلی آوردم، بعداً بیا بگیر.', 'دیشب خواب بارون دیدم، ان‌شاءالله خیره.'] },
  { name: 'علی کوچیکه', role: 'پسر بازیگوش', skin: 0xe0b080, shirt: 0xb85a3c, pants: 0x4a5a8a, scale: 0.72,
    lines: ['عمو کریم! بیا بازی!', 'من دیروز یه خرگوش دیدم، خیلی بزرگ بود!', 'مامانم گفته نرم سمت چاه...'] },
];

export function createNPCs(scene, world) {
  const npcs = [];
  const doors = world.npcDoors;

  NPC_DEFS.forEach((def, i) => {
    const char = makeCharacter(def);
    const home = doors[i % doors.length].clone();
    home.x += (i >= doors.length ? 1.5 : 0); // share houses if more NPCs than doors
    char.group.position.copy(home);
    scene.add(char.group);

    // each NPC gets personal spots
    const workSpots = [
      world.places.field.pos, world.places.well.pos, world.places.woodpile.pos,
      world.places.coop.pos, world.places.square.pos,
    ];
    const work = workSpots[i % workSpots.length].clone();
    work.x += (Math.random() - 0.5) * 4;
    work.z += (Math.random() - 0.5) * 4;
    const square = world.places.square.pos.clone();
    square.x += (Math.random() - 0.5) * 7;
    square.z += (Math.random() - 0.5) * 7;

    npcs.push({
      def, char, home, work, square,
      name: def.name,
      pos: char.group.position,
      target: null,
      wanderT: Math.random() * 5,
      offset: (i % 4) * 0.4,        // schedule offset so they don't move in lockstep
      speed: 1.6 + Math.random() * 0.7,
      heading: Math.random() * Math.PI * 2,
      talkCooldown: 0,
    });
  });

  return npcs;
}

function scheduleTarget(npc, hour) {
  const h = (hour + npc.offset) % 24;
  if (h < 7 || h >= 21.5) return { pos: npc.home, wander: 0 };       // sleep/home
  if (h < 9) return { pos: npc.square, wander: 3 };                   // morning at square
  if (h < 12.5) return { pos: npc.work, wander: 2.5 };                // work
  if (h < 14) return { pos: npc.home, wander: 1 };                    // lunch
  if (h < 18) return { pos: npc.work, wander: 2.5 };                  // work
  return { pos: npc.square, wander: 4 };                              // evening socialize
}

export function updateNPCs(npcs, world, player, dt, hour) {
  for (const npc of npcs) {
    const sched = scheduleTarget(npc, hour);
    npc.talkCooldown = Math.max(0, npc.talkCooldown - dt);

    const goingHome = sched.pos === npc.home;

    // already inside the house — stay hidden until the schedule says go out
    if (npc.inside) {
      if (!goingHome) {
        npc.inside = false;
        npc.char.group.visible = true;
        npc.pos.copy(npc.home);   // step out of the door
        npc.target = null;
      } else continue;
    }

    // reached the door — go inside
    if (goingHome && Math.hypot(npc.home.x - npc.pos.x, npc.home.z - npc.pos.z) < 0.9) {
      npc.inside = true;
      npc.char.group.visible = false;
      npc.char.setWalking(false);
      continue;
    }

    // pick wander point around scheduled spot occasionally
    npc.wanderT -= dt;
    if (!npc.target || npc.wanderT <= 0) {
      npc.wanderT = 4 + Math.random() * 6;
      npc.target = sched.pos.clone();
      if (sched.wander > 0) {
        npc.target.x += (Math.random() - 0.5) * sched.wander * 2;
        npc.target.z += (Math.random() - 0.5) * sched.wander * 2;
      }
    }

    // pause and face the player if very close (feels alive)
    const pd = Math.hypot(player.pos.x - npc.pos.x, player.pos.z - npc.pos.z);
    if (pd < 2.2) {
      npc.char.setWalking(false);
      npc.heading = Math.atan2(player.pos.x - npc.pos.x, player.pos.z - npc.pos.z);
    } else {
      const dx = npc.target.x - npc.pos.x, dz = npc.target.z - npc.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        npc.pos.x += dx / d * npc.speed * dt;
        npc.pos.z += dz / d * npc.speed * dt;
        npc.heading = Math.atan2(dx, dz);
        npc.char.setWalking(true);
        world.collide(npc.pos, 0.4);
      } else {
        npc.char.setWalking(false);
      }
    }

    let dh = npc.heading - npc.char.group.rotation.y;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    npc.char.group.rotation.y += dh * Math.min(1, dt * 8);
    npc.char.update(dt);
  }
}

export function nearestNPC(npcs, player, maxDist = 2.6) {
  let best = null, bd = maxDist;
  for (const npc of npcs) {
    if (npc.inside) continue;
    const d = Math.hypot(player.pos.x - npc.pos.x, player.pos.z - npc.pos.z);
    if (d < bd) { bd = d; best = npc; }
  }
  return best;
}

export function npcLine(npc) {
  const lines = npc.def.lines;
  return lines[(Math.random() * lines.length) | 0];
}
