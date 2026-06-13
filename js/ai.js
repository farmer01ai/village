// ai.js — autonomous control of the farmer via the OpenRouter API (free models).
// The user pastes an API key in the panel; each decision cycle sends the game
// state and receives one JSON action, which is executed in the world.
import { TASK_DEFS } from './tasks.js';
import { nearestNPC, npcLine } from './npc.js';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `You are Karim (کریم), a hard-working farmer living in a small Iranian village. You control him in a 3D life-simulation game. You receive the current game state as JSON and must choose exactly ONE next action.

Your goals, in priority order:
1. Survive: keep energy and hunger above 25. Eat when hungry (needs 2 wheat, at home). Sleep at night (after 19:00, at home) to restore energy.
2. Run the farm like a real villager's day: draw water from the well, water dry crops, harvest ready wheat, feed the chickens (especially if chicken_hunger is low), chop firewood.
3. Live socially: occasionally greet villagers (talk_to) when near them in the morning or evening, like a real person would. Don't talk to the same person repeatedly.

Available actions:
- move_to: target must be one of the place names in "places".
- do_task: target must be a task id from "tasks". You must already be at (or it will auto-walk to) the task's place.
- talk_to: target must be an NPC name from "npcs_nearby" (only works if someone is within ~10m).
- wait: pause for "seconds" seconds (use rarely, e.g. resting briefly).

Rules:
- Plan a sensible chain: e.g. if crops are dry and you have no water, first do_task draw_water, then do_task water_crops.
- If a task availability says anything other than "ok", fix the precondition first instead of retrying it.
- At night (>= 19:00) wrap up and go home to eat/sleep.
- Keep "reason" to one short sentence in Persian.`;

const ACTION_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['move_to', 'do_task', 'talk_to', 'wait'] },
    target: { type: 'string', description: 'place name | task id | npc name | "" for wait' },
    seconds: { type: 'integer', enum: [0, 5, 10, 15, 30] },
    reason: { type: 'string' },
  },
  required: ['action', 'target', 'seconds', 'reason'],
  additionalProperties: false,
};

export class AIController {
  constructor(G) {
    this.G = G;            // { player, world, npcs, tasks, ui, getHour }
    this.running = false;
    this.history = [];     // recent {action, result}
    this.lastResult = 'بازی تازه شروع شده';
    this._abort = null;
  }

  start(apiKey, model) {
    if (this.running) return;
    this.apiKey = apiKey;
    this.model = model;
    this.running = true;
    this.G.player.aiControlled = true;
    this.G.ui.aiLog('سیستم', 'کنترل خودکار فعال شد', 'act');
    this.loop();
  }

  stop(reason) {
    this.running = false;
    this.G.player.aiControlled = false;
    this.G.player.clearNav();
    this._abort?.abort();
    this.G.ui.aiLog('سیستم', reason || 'کنترل خودکار متوقف شد', 'err');
    this.G.ui.setAIActive(false);
  }

  buildState() {
    const { player, world, npcs } = this.G;
    const counts = world.cropCounts();
    const near = npcs
      .filter(n => !n.inside)
      .map(n => ({ name: n.name, dist: +Math.hypot(n.pos.x - player.pos.x, n.pos.z - player.pos.z).toFixed(1) }))
      .filter(n => n.dist < 12)
      .slice(0, 5);
    const np = player.nearestPlace();
    const avail = this.G.tasks.availability();
    return {
      time: `${String(Math.floor(this.G.getHour())).padStart(2, '0')}:${String(Math.floor((this.G.getHour() % 1) * 60)).padStart(2, '0')}`,
      stats: {
        energy: Math.round(player.energy),
        hunger: Math.round(player.hunger),
        water_in_bucket: player.water,
        wheat: player.wheat,
        firewood: player.wood,
      },
      location: { nearest_place: np.name, distance: +np.dist.toFixed(1) },
      places: Object.fromEntries(Object.entries(this.G.world.places).map(([k, v]) => [k, v.label])),
      farm: { dry_crops: counts.dry, growing_crops: counts.growing, ready_to_harvest: counts.ready },
      chicken_hunger: Math.round(world.chickenHunger),
      tasks: Object.fromEntries(Object.entries(TASK_DEFS).map(([id, d]) => [id, { what: d.label, where: d.place, availability: avail[id] }])),
      npcs_nearby: near,
      last_action_result: this.lastResult,
      recent_actions: this.history.slice(-6),
    };
  }

  async loop() {
    while (this.running) {
      let decision;
      try {
        decision = await this.decide();
      } catch (e) {
        if (!this.running) return;
        this.stop('خطای API: ' + (e.message || e));
        return;
      }
      if (!this.running) return;
      this.G.ui.aiLog(decision.action + (decision.target ? ' → ' + decision.target : ''), decision.reason, 'act');
      const result = await this.execute(decision);
      if (!this.running) return;
      this.lastResult = result;
      this.history.push({ action: `${decision.action}:${decision.target}`, result });
      if (this.history.length > 12) this.history.shift();
      this.G.ui.aiLog('نتیجه', result, 'res');
      await sleep(800);
    }
  }

  async decide() {
    this._abort = new AbortController();
    const res = await fetch(API_URL, {
      method: 'POST',
      signal: this._abort.signal,
      headers: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Village Life',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 300,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + '\n\nYou must return ONLY valid JSON matching this schema, without any markdown formatting:\n' + JSON.stringify(ACTION_SCHEMA) },
          { role: 'user', content: 'Current game state:\n' + JSON.stringify(this.buildState(), null, 1) + '\n\nChoose the next action.' }
        ]
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    let text = data.choices?.[0]?.message?.content || '{}';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
        text = text.substring(start, end + 1);
    }
    return JSON.parse(text);
  }

  /** execute one action; resolves with a result string */
  execute(d) {
    const { player, world, tasks, npcs, ui } = this.G;
    return new Promise(resolve => {
      const timeout = setTimeout(() => { player.clearNav(); resolve('عملیات طولانی شد و رها شد'); }, 45000);
      const done = (msg) => { clearTimeout(timeout); resolve(msg); };

      switch (d.action) {
        case 'move_to': {
          const place = world.places[d.target];
          if (!place) return done(`مکان «${d.target}» وجود ندارد`);
          player.setNavTarget(place.pos, () => done(`به ${place.label} رسیدی`));
          break;
        }
        case 'do_task': {
          const def = TASK_DEFS[d.target];
          if (!def) return done(`کار «${d.target}» وجود ندارد`);
          const place = world.places[def.place];
          const begin = () => {
            const err = tasks.start(d.target, (result) => done(result));
            if (err) done(err);
          };
          if (player.distanceTo(place.pos) > 3.0) {
            player.setNavTarget(place.pos, begin);
          } else begin();
          break;
        }
        case 'talk_to': {
          const npc = npcs.find(n => n.name === d.target);
          if (!npc) return done(`کسی به نام «${d.target}» اینجا نیست`);
          if (npc.inside) return done(`${npc.name} داخل خانه‌اش است و در دسترس نیست`);
          const goTalk = () => {
            const line = npcLine(npc);
            ui.showDialogue(npc.name, line);
            setTimeout(() => { ui.hideDialogue(); done(`${npc.name} گفت: «${line}»`); }, 3500);
          };
          if (Math.hypot(npc.pos.x - player.pos.x, npc.pos.z - player.pos.z) > 2.4) {
            player.setNavTarget(npc.pos, goTalk);
          } else goTalk();
          break;
        }
        case 'wait': {
          const s = Math.min(30, Math.max(1, d.seconds || 5));
          setTimeout(() => done(`${s} ثانیه استراحت کردی`), s * 1000);
          break;
        }
        default:
          done('دستور نامعتبر');
      }
    });
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
