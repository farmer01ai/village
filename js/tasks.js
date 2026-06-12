// tasks.js — farmer daily tasks: draw water, water/harvest crops, feed chickens, chop wood, eat, sleep
import * as THREE from 'three';

export const TASK_DEFS = {
  draw_water: {
    label: 'کشیدن آب از چاه', place: 'well', duration: 3,
    can: (p) => p.water >= 5 ? 'سطل پر است' : null,
    effect(p, w, G) { p.water = 5; p.energy = Math.max(0, p.energy - 2); return 'سطل پر از آب شد (۵ واحد)'; },
  },
  water_crops: {
    label: 'آبیاری گندم‌ها', place: 'field', duration: 5,
    can: (p, w) => p.water <= 0 ? 'آب نداری — اول از چاه آب بکش' : (w.cropCounts().dry === 0 ? 'بوته خشکی برای آبیاری نیست' : null),
    effect(p, w) {
      let watered = 0;
      for (const c of w.crops) {
        if (c.state === 0 && p.water > 0 && watered < p.water * 4) {
          c.state = 1; c.growth = 0; w.applyCropVisual(c); watered++;
        }
      }
      const used = Math.ceil(watered / 4);
      p.water = Math.max(0, p.water - used);
      p.energy = Math.max(0, p.energy - 6);
      return `${watered} بوته آبیاری شد`;
    },
  },
  harvest: {
    label: 'برداشت گندم', place: 'field', duration: 5,
    can: (p, w) => w.cropCounts().ready === 0 ? 'گندم رسیده‌ای برای برداشت نیست' : null,
    effect(p, w) {
      let n = 0;
      for (const c of w.crops) {
        if (c.state === 2 && n < 10) { c.state = 0; c.growth = 0; w.applyCropVisual(c); n++; }
      }
      p.wheat += n;
      p.energy = Math.max(0, p.energy - 8);
      return `${n} دسته گندم برداشت شد`;
    },
  },
  feed_chickens: {
    label: 'غذا دادن به مرغ‌ها', place: 'coop', duration: 3,
    can: (p, w) => p.wheat < 1 ? 'گندم نداری' : (w.chickenHunger > 80 ? 'مرغ‌ها سیر هستند' : null),
    effect(p, w) { p.wheat -= 1; w.chickenHunger = 100; p.energy = Math.max(0, p.energy - 2); return 'مرغ‌ها غذا خوردند'; },
  },
  chop_wood: {
    label: 'هیزم شکستن', place: 'woodpile', duration: 4,
    can: (p) => p.energy < 10 ? 'انرژی کافی نداری' : null,
    effect(p) { p.wood += 1; p.energy = Math.max(0, p.energy - 9); return 'یک هیزم آماده شد'; },
  },
  eat: {
    label: 'خوردن غذا', place: 'home', duration: 4,
    can: (p) => p.wheat < 2 ? 'برای پختن نان حداقل ۲ گندم لازم است' : null,
    effect(p) { p.wheat -= 2; p.hunger = Math.min(100, p.hunger + 45); return 'نان خوردی — سیر شدی'; },
  },
  sleep: {
    label: 'خوابیدن', place: 'home', duration: 5,
    can: (p, w, G) => (G.hour >= 6 && G.hour < 19) ? 'هنوز برای خواب زود است (بعد از ۱۹)' : null,
    effect(p, w, G) {
      G.sleepRequested = true;
      return 'خوابیدی تا صبح — انرژی کامل شد';
    },
  },
};

export class TaskSystem {
  constructor(player, world, npcs, G, ui) {
    this.player = player;
    this.world = world;
    this.npcs = npcs;
    this.G = G;
    this.ui = ui;
    this.active = null; // {id, t, duration}
  }

  /** availability map for AI + hints */
  availability() {
    const out = {};
    for (const [id, def] of Object.entries(TASK_DEFS)) {
      out[id] = TASK_DEFS[id].can(this.player, this.world, this.G) || 'ok';
    }
    return out;
  }

  /** start a task — assumes player is near the task's place; returns error string or null */
  start(id, onDone) {
    const def = TASK_DEFS[id];
    if (!def) { onDone?.('چنین کاری وجود ندارد'); return 'unknown task'; }
    const err = def.can(this.player, this.world, this.G);
    if (err) { onDone?.(err); return err; }
    const place = this.world.places[def.place];
    if (this.player.distanceTo(place.pos) > 3.2) { onDone?.('خیلی از محل کار دوری'); return 'too far'; }
    this.player.busy = true;
    this.active = { id, t: 0, duration: def.duration, onDone };
    this.ui.showProgress(def.label);
    return null;
  }

  update(dt) {
    if (!this.active) return;
    this.active.t += dt;
    this.ui.setProgress(this.active.t / this.active.duration);
    if (this.active.t >= this.active.duration) {
      const def = TASK_DEFS[this.active.id];
      const result = def.effect(this.player, this.world, this.G);
      this.ui.hideProgress();
      this.ui.message(result);
      this.player.busy = false;
      const cb = this.active.onDone;
      this.active = null;
      cb?.(result);
    }
  }

  /** contextual task for the place the player is standing near */
  contextualTask() {
    const { name, dist } = this.player.nearestPlace();
    if (dist > 3.0) return null;
    const order = Object.entries(TASK_DEFS).filter(([, d]) => d.place === name);
    if (!order.length) return null;
    // prefer a task that is currently possible
    for (const [id, def] of order) {
      if (!def.can(this.player, this.world, this.G)) return { id, def };
    }
    return { id: order[0][0], def: order[0][1] };
  }
}
