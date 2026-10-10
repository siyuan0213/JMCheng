
/* ============================================================
   招式联合引擎 v1
   —— 用「成功率」取代硬币拼点；相邻招式适配度决定后续命中率
   ============================================================ */
(function () {
"use strict";

function D() { return window.DATA || (typeof DATA !== "undefined" ? DATA : null); }
function gS() { try { return typeof S !== "undefined" ? S : null; } catch (e) { return null; } }

function move(id) { var d = D(); return d && d.moves ? d.moves[id] : null; }
function mtype(id) { var m = move(id); return m ? m.type : "拳"; }
function typeInfo(t) { var d = D(); return (d && d.moveTypes && d.moveTypes[t]) || { cls: "melee", glyph: "?", vec: [1, 0, 0] }; }

/* 适配度：两个招式之间（0~1） */
function affinity(t1, t2) {
  var d = D();
  if (!d || !d.affinity) return 1;
  var row = d.affinity[t1];
  if (!row) return 0.5;
  var v = row[t2];
  return typeof v === "number" ? v : 0.5;
}

/* 单位在某招式上的熟练加成（速度与意志都会略微提高上限） */
function proficiency(u, id) {
  if (!u) return 0;
  var spd = u.speed || 8, sp = (u.sp || 0);
  return Math.round(spd * 0.25 + sp * 0.08);
}

/* 单个招式的成功率（%）。
   prevId: 上一个招式（null 表示这是第一招）
   enemy:  目标（用于对方的闪避/虚招影响）
   isEnemy: 是否敌方在出手（敌方没有连段加成） */
function hitChance(u, prevId, id, enemy, isEnemy) {
  var d = D(), m = move(id);
  if (!m) return { pct: 0, parts: {} };
  var cfg = (d && d.combo) || { firstAcc: 100, baseBonus: 6, aoePenalty: 0.12 };
  var base, aff = 1, affPct;
  if (!prevId) {
    base = cfg.firstAcc;
    affPct = null;
  } else {
    aff = affinity(mtype(prevId), m.type);
    // 适配度直接决定这一招能保住多少成功率
    base = 30 + aff * 62;
    affPct = Math.round(aff * 100);
  }
  var acc = (m.acc !== undefined ? m.acc : 85) - 100;
  var prof = proficiency(u, id);
  var pct = base + acc + prof + (cfg.baseBonus || 0);
  if (m.aoe) pct -= Math.round((cfg.aoePenalty || 0.12) * 100 * 0.25);
  // 目标身上的削弱/闪避
  var pen = 0;
  if (enemy) {
    if (enemy.dodgeReady) pen += Math.round(enemy.dodgeReady * 100 * 0.5);
    if (enemy.weakNext) pen += 12;
    (enemy.buffs || []).forEach(function (b) { if (b.stat === "def" && b.mult < 1) pen += 4; });
  }
  pct = Math.round(pct - pen);
  if (!prevId) pct = cfg.firstAcc;        // 首招必中
  pct = Math.max(8, Math.min(99, pct));
  if (!prevId) pct = 100;
  return { pct: pct, aff: aff, affPct: affPct, prof: prof, pen: pen, type: m.type, cls: typeInfo(m.type).cls };
}

/* 预览整条连段 */
function previewCombo(u, chain, enemy, isEnemy) {
  chain = chain || [];
  var steps = [], prev = null, cum = 100, totalPower = 0, breakAt = -1, shield = 0, dodge = 0;
  for (var i = 0; i < chain.length; i++) {
    var id = chain[i], m = move(id);
    if (!m) continue;
    var h = hitChance(u, prev, id, enemy, isEnemy);
    cum = cum * (h.pct / 100);
    steps.push({
      id: id, name: m.name, type: m.type, cls: h.cls, glyph: typeInfo(m.type).glyph,
      pct: h.pct, cum: Math.round(cum), aff: h.aff, affPct: h.affPct,
      power: m.power, text: m.desc, index: i
    });
    if (m.shield) shield += m.shield;
    if (m.dodge) dodge = Math.max(dodge, m.dodge);
    totalPower += m.power;
    if (breakAt < 0 && h.pct < 45) breakAt = i;
    prev = id;
  }
  return { steps: steps, cum: Math.round(cum), totalPower: totalPower, breakAt: breakAt,
           shield: shield, dodge: dodge, expected: Math.round(cum / 100 * totalPower * 100) / 100 };
}

/* 结算一次连段。返回逐招结果与总伤害（伤害由外部套用，便于复用） */
function resolveCombo(u, chain, enemy, isEnemy) {
  chain = chain || [];
  var out = { steps: [], landed: 0, broke: false, totalPower: 0, shield: 0, dodge: 0, aoe: false, crit: 0, pierce: 0 };
  var prev = null;
  for (var i = 0; i < chain.length; i++) {
    var id = chain[i], m = move(id);
    if (!m) continue;
    var h = hitChance(u, prev, id, enemy, isEnemy);
    var roll = Math.random() * 100;
    var ok = roll < h.pct;
    var st = { id: id, name: m.name, type: m.type, glyph: typeInfo(m.type).glyph, cls: h.cls,
               pct: h.pct, roll: Math.round(roll), ok: ok, affPct: h.affPct, power: m.power };
    if (m.aoe) out.aoe = true;
    if (!ok) {
      st.note = "断招";
      out.steps.push(st);
      out.broke = true;
      break;                    // 断招：后续招式不再出手
    }
    out.landed++;
    out.totalPower += m.power;
    if (m.shield) { out.shield += m.shield; st.note = "护盾 +" + Math.round(m.shield * 100) + "%"; }
    if (m.dodge) { out.dodge = Math.max(out.dodge, m.dodge); st.note = "闪避就绪"; }
    if (m.weak) { st.note = "对手下一击命中下降"; }
    if (m.crit) out.crit = Math.max(out.crit, m.crit);
    if (m.pierce) out.pierce = Math.max(out.pierce, m.pierce);
    out.steps.push(st);
    prev = id;
  }
  if (out.landed >= 3) out.bonus = 1.25;
  else if (out.landed === 2) out.bonus = 1.12;
  else out.bonus = 1.0;
  return out;
}

/* 单招伤害（由游戏侧套用护盾/防御） */
function moveDamage(u, m, enemy, isEnemy) {
  var atkLv = (u && u.atkLevel) || 6;
  var dLv = (enemy && enemy.defLevel) || 3;
  var per = atkLv * (m.power || 1) * 2.2;
  per = per - dLv * 0.55;
  var pen = m.pierce || 0;
  if (pen) per += dLv * pen;
  return Math.max(1, Math.round(per));
}

/* 敌方连段：按自身招式池随机串 2~3 招，偏向同类以保持适配 */
/* 敌人连段：2~4 段，尽量不重复，难度越高段数越多 */
function enemyCombo(u) {
  var pool = ((u && u.moves && u.moves.length) ? u.moves : ["m_jab"]).slice();
  var n = 2;
  var r = Math.random();
  if (r > 0.55) n = 3;
  if (r > 0.88) n = 4;
  /* 敌方整体强度越高，越容易多打一段 */
  if (u && (u.atkLevel || 0) >= 14 && Math.random() < 0.35) n = Math.min(4, n + 1);
  var chain = [];
  var prev = null, used = {};
  for (var i = 0; i < n; i++) {
    var best = null, bestScore = -1e9;
    /* 候选次数随池子大小增加，让「没用过的招式」有足够机会被选上 */
    var tries = Math.max(8, pool.length * 3);
    for (var k = 0; k < tries; k++) {
      var cand = pool[Math.floor(Math.random() * pool.length)];
      var aff = prev ? affinity(mtype(prev), mtype(cand)) : 0.8;
      var score = aff * 1.0 + Math.random() * 0.45;
      if (!used[cand]) score += 0.55;              /* 优先没用过的，减少无谓重复 */
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    if (!best) best = pool[Math.floor(Math.random() * pool.length)];
    chain.push(best);
    used[best] = true;
    prev = best;
  }
  return chain;
}

/* 招式列表（按单位兵装/自定义） */
function unitMoves(u) {
  var d = D();
  if (!d) return ["m_jab"];
  if (u && u.moves && u.moves.length) return u.moves;
  var wid = (u && u.weapon && u.weapon.id) || "fist_bare";
  return d.weaponMoves[wid] || d.weaponMoves.fist_bare || ["m_jab"];
}

window.HengCombo = {
  move: move, mtype: mtype, typeInfo: typeInfo, affinity: affinity, proficiency: proficiency,
  hitChance: hitChance, preview: previewCombo, resolve: resolveCombo, damage: moveDamage,
  unitMoves: unitMoves, enemyCombo: enemyCombo
};
})();
