
(function () {
"use strict";
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const el = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const SAVE_KEY = "heng_rpg_save_v1";
const CODEX_KEY = "heng_rpg_codex_v1";
const RANKS = [
{ at: 0, name: "见习成员" },
{ at: 2, name: "正式成员" },
{ at: 4, name: "列员" },
{ at: 6, name: "首镇肖" },
{ at: 8, name: "分舵执事" },
{ at: 10, name: "恒之技法教习" },
{ at: 12, name: "恒永者" }
];
const KIND_LABEL = { slash:"斩", pierce:"贯", crit:"刃", true:"真", multi:"连",
void:"虚", shield:"守", drain:"噬", healself:"祭" };
let S = null, B = null;
let D_ = null; 
let advanceHint = null;
let UI = { screen: "title", selectedChapter: 0 };
let queue = [];
let toastTimer = null;
let quoteTimer = null;
function toast(msg) {
const t = el("toast");
t.textContent = msg;
t.classList.add("on");
clearTimeout(toastTimer);
toastTimer = setTimeout(() => t.classList.remove("on"), 2200);
}
function openModal(title, html) {
el("modalTitle").textContent = tr(title);
el("modalBody").innerHTML = html;
el("modal").classList.add("on");
try { localizeDom(el("modalBody")); } catch (e) {}
}
function closeModal() { el("modal").classList.remove("on"); }
function show(screen) {
UI.screen = screen;
$$(".screen").forEach((s) => s.classList.remove("active"));
const node = el("scr-" + screen);
if (node) node.classList.add("active");
try { localizeDom(node || document.body); } catch (e) {}
}
function baseStats(st) {
const oa = ((DATA.origins[st.origin] || {}).stats) || {};
const sa = ((DATA.schools[st.school] || {}).bonus) || {};
const ta = ((DATA.oaths[st.oath] || {}).bonus) || {};
const lvl = st.level - 1;
const sp = st.spent || {};
return {
hp: 100 + (oa.hp||0) + (sa.hp||0) + (sp.hpBonus||0) + lvl * 9,
atk: 12 + (oa.atk||0) + (sa.atk||0) + (ta.atk||0) + lvl * 2 + (sp.atk||0),
def: 6 + (oa.def||0) + (sa.def||0) + (ta.def||0) + lvl * 1 + (sp.def||0),
spd: 8 + (oa.spd||0) + (sa.spd||0) + (ta.spd||0) + lvl * 1 + (sp.spd||0),
will:10 + (oa.will||0) + (sa.will||0) + (ta.will||0) + lvl * 2 + (sp.will||0)
};
}
function expNeeded(level) { return Math.round(58 * Math.pow(level, 1.42)); }
function currentRank() {
const done = Object.values(S.chapters || {}).filter((c) => c.done).length;
let r = "见习成员";
RANKS.forEach((x) => { if (done >= x.at) r = x.name; });
return r;
}
function gainExp(amount, lines) {
setTimeout(() => { try { refreshQuests(true); } catch (e) {} }, 10);
S.exp += amount;
lines.push(["l-sys", "获得经验 " + amount + " 点。"]);
let ups = 0;
while (S.exp >= expNeeded(S.level) && S.level < MAX_LEVEL) {
S.exp -= expNeeded(S.level);
S.level++;
S.points += 2;
ups++;
}
if (ups) {
try { syncHero(); } catch (e) {}
const bs = baseStats(S);
S.hp = bs.hp;
lines.push(["l-crit", "等级提升至 Lv." + S.level + "（+" + ups * 2 + " 潜能点），生命已完全恢复。"]);
const fresh = checkUnlocks(S.level);
if (fresh.length) {
lines.push(["l-sys", "新解锁技能：" + fresh.map((id) => DATA.abilities[id].name).join("、") +
" —— 到「技能」面板换装。"]);
}
}
}
function applyAward(aw, lines, onlyMax) {
if (!aw) return;
const _dc = (typeof diffConf === "function") ? diffConf() : { exp:1, honor:1 };
if (aw.exp && _dc.exp !== 1) aw = Object.assign({}, aw, { exp: Math.round(aw.exp * _dc.exp) });
if (aw.honor && _dc.honor !== 1) aw = Object.assign({}, aw, { honor: Math.round(aw.honor * _dc.honor) });
const label = { atk:"力量", def:"防御", spd:"速度", will:"意志" };
if (aw.exp) gainExp(aw.exp, lines);
["atk","def","spd","will"].forEach((k) => {
if (aw[k]) {
S.spent[k] = (S.spent[k] || 0) + aw[k];
lines.push(["l-sys", label[k] + " +" + aw[k] + "。"]);
}
});
if (aw.hp) {
S.spent.hpBonus = (S.spent.hpBonus || 0) + aw.hp;
if (onlyMax) S.hp = Math.min(S.hp, baseStats(S).hp);
else S.hp += aw.hp;
lines.push(["l-sys", "生命上限 +" + aw.hp + "。"]);
}
if (aw.unlockCodex) markCodex(aw.unlockCodex);
if (aw.honor) {
S.honor = (S.honor || 0) + aw.honor;
lines.push(["l-crit", "获得功勋 " + aw.honor + "。"]);
}
if (aw.items) {
aw.items.forEach((it) => {
gainItem(it[0], it[1]);
const d = DATA.items.find((x) => x.id === it[0]);
lines.push(["l-sys", "获得道具：" + (d ? d.name : it[0]) + " ×" + it[1]]);
});
}
if (aw.mat) {
Object.keys(aw.mat).forEach((k) => {
gainMat(k, aw.mat[k]);
lines.push(["l-sys", "获得素材：" + DATA.materials[k].name + " ×" + aw.mat[k]]);
});
}
if (aw.weapons) {
S.weapons = S.weapons || [];
aw.weapons.forEach((w) => {
if (S.weapons.indexOf(w) < 0) S.weapons.push(w);
const d = DATA.weapons.find((x) => x.id === w);
lines.push(["l-crit", "解锁兵装：" + (d ? d.name : w)]);
});
}
}
const SLOTS_KEY = "heng_rpg_slots_v1";
const SLOTS_META = "heng_rpg_slots_meta_v1";
const ACTIVE_SLOT = "heng_rpg_active_slot";
const SLOT_COUNT = 6;
function readJSON(k, d) {
try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; }
}
function writeJSON(k, v) {
try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
}
function slotData() { const o = readJSON(SLOTS_KEY, {}); return (o && typeof o === "object") ? o : {}; }
function slotMeta() { const o = readJSON(SLOTS_META, {}); return (o && typeof o === "object") ? o : {}; }
function activeSlot() {
try { const v = localStorage.getItem(ACTIVE_SLOT); return v === null ? null : v; } catch (e) { return null; }
}
function setActiveSlot(k) {
try { if (k === null) localStorage.removeItem(ACTIVE_SLOT); else localStorage.setItem(ACTIVE_SLOT, String(k)); } catch (e) {}
}
function metaOf(obj) {
if (!obj || typeof obj !== "object") return null;
return {
name: obj.name || "无名",
level: obj.level || 1,
at: obj.__savedAt || Date.now(),
chapter: obj.chapterIndex || 0,
difficulty: obj.difficulty || "normal",
honor: obj.honor || 0
};
}
function migrateLegacySave() {
let legacy = null;
try { const raw = localStorage.getItem(SAVE_KEY); legacy = raw ? JSON.parse(raw) : null; } catch (e) { legacy = null; }
if (!legacy) return;
const data = slotData(), meta = slotMeta();
if (!data["1"]) {
data["1"] = legacy;
meta["1"] = metaOf(legacy);
writeJSON(SLOTS_KEY, data);
writeJSON(SLOTS_META, meta);
setActiveSlot("1");
}
try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}
function slotList() {
const data = slotData(), meta = slotMeta();
const out = [];
for (let i = 1; i <= SLOT_COUNT; i++) {
const k = String(i);
const d = data[k] || null;
out.push({ key: k, has: !!d, meta: d ? (meta[k] || metaOf(d)) : null });
}
return out;
}
function loadLegacy() {
try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function newestSlot() {
const list = slotList().filter((s) => s.has && s.meta);
if (!list.length) {
const legacy = loadLegacy();
return legacy ? { key: "legacy", has: true, meta: metaOf(legacy) } : null;
}
list.sort((a, b) => ((b.meta.at || 0) - (a.meta.at || 0)) || (Number(b.key) - Number(a.key)));
return list[0];
}
function saveToSlot(key, silent) {
if (!S) return false;
S.__savedAt = Date.now();
const data = slotData(), meta = slotMeta();
data[String(key)] = S;
meta[String(key)] = metaOf(S);
const ok1 = writeJSON(SLOTS_KEY, data);
const ok2 = writeJSON(SLOTS_META, meta);
setActiveSlot(String(key));
writeJSON(SAVE_KEY, S); 
const ok = ok1 && ok2;
if (!silent) {
if (ok) toast("已保存到 " + key + " 号位 · " + fmtTime(S.__savedAt));
else toast("存档失败：浏览器存储空间可能已满");
}
return ok;
}
function loadFromSlot(key) {
if (key === "legacy") return loadLegacy();
return slotData()[String(key)] || null;
}
function deleteSlot(key) {
const data = slotData(), meta = slotMeta();
delete data[String(key)];
delete meta[String(key)];
writeJSON(SLOTS_KEY, data);
writeJSON(SLOTS_META, meta);
if (activeSlot() === String(key)) setActiveSlot(null);
}
function fmtTime(ts) {
if (!ts) return "—";
const d = new Date(ts);
const p = (n) => (n < 10 ? "0" + n : String(n));
return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
" " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function saveGame(silent) {
if (!S) return;
let key = activeSlot();
if (!key) key = "1";
saveToSlot(key, silent);
}
function loadGame() {
const s = newestSlot();
if (!s) return null;
return loadFromSlot(s.key);
}
function hasSave() {
if (slotList().some((x) => x.has)) return true;
return !!localStorage.getItem(SAVE_KEY);
}
function loadCodex() {
try { return JSON.parse(localStorage.getItem(CODEX_KEY)) || {}; } catch (e) { return {}; }
}
function markCodex(id) {
if (!id) return;
const c = loadCodex();
if (!c[id]) {
c[id] = 1;
try { localStorage.setItem(CODEX_KEY, JSON.stringify(c)); } catch (e) {}
toast("典藏室解锁：" + codexTitle(id));
}
}
function codexTitle(id) {
const d = DATA.codex.find((x) => x.id === id);
if (d) return d.title;
const e = DATA.ever.find((x) => x.id === id);
return e ? e.no + " · " + e.name : id;
}
function newState(name, origin, school, oath) {
const st = { name: name || "无名者", origin: origin, school: school, oath: oath,
level: 1, exp: 0, points: 0, spent: { atk:0, def:0, spd:0, will:0, hpBonus:0 },
hp: 0, honor: 1200, equipped: null, mode: "story", unlocked: 1,
summonId: null,
weapons: [], weaponOf: {}, bag: {}, pulls: 0,
arena: { tier: 0, streak: 0, wins: 0 },
chapters: {}, chapterIndex: 0, stage: 0 };
st.allies = starterAllies();
st.squad = [st.allies[0].id];
try {
const h = heroAlly();
if (h) { st.allies.unshift(h); st.squad.unshift(h.id); invalidateAllyIndex(); }
} catch (e) {}
st.dev = false;
st.animSpeed = "fast";
st.bossWins = {};
st.bossBest = {};
st.music = true;
st.sfx = true;
st.musicVol = 0.7;
st.sfxVol = 0.8;
st.textSpeed = 26;
st.tutDone = false;
st.quests = {}; 
st.mats = {}; 
st.questCounters = { battles:0, kills:0, killsByTag:{}, bossWins:0, arenaWins:0, fullHp:0 };
st.drops = 0;
st.difficulty = "normal";
st.hardUnlocked = false;
st.trueUnlocked = false;
st.assistSeen = {};
st.hp = baseStats(st).hp;
return st;
}
function chapterState(i) {
if (!S.chapters[i]) S.chapters[i] = { stages: 0, done: false };
return S.chapters[i];
}
function alliedList() {
return Object.keys(S.allied || {}).filter((k) => S.allied[k]);
}
const QUOTES = [
"「原作者：JMiaoC（玖喵瓷思源）」",
"「我想当一个凡人，可世间的压力不容许我当一个凡人。」",
"「命无法改变，你我也无法改变。」",
"「曼波，哈基米曼波」",
"「躲在后面的飞起来了，因为挡在前面的人在装逼（bushi」",
];
function rotateQuotes() {
let i = 0;
const node = el("titleQuote");
if (quoteTimer) clearInterval(quoteTimer);
quoteTimer = setInterval(() => {
i = (i + 1) % QUOTES.length;
node.style.opacity = 0;
setTimeout(() => { node.textContent = QUOTES[i]; node.style.opacity = 1; }, 320);
}, 4300);
}
function initCreate() {
el("inpName").value = pick(["凌霜", "陈无名", "纪恒", "苏未眠", "燕长庚"]);
updateOriginDesc(); updateSchoolDesc();
}
function updateOriginDesc() { el("originDesc").textContent = DATA.origins[el("inpOrigin").value].desc; }
function updateSchoolDesc() { el("schoolDesc").textContent = DATA.schools[el("inpSchool").value].desc; }
function renderMap() {
setTimeout(armHudStrip, 60);
try { renderQuestStrip(); } catch (e) {}
try { refreshDifficultyButton(); } catch (e) {}
equipList();
const list = el("chapterList");
list.innerHTML = "";
DATA.chapters.forEach((ch, i) => {
const cs = chapterState(i);
const locked = i >= (S.unlocked || 1);
const div = document.createElement("div");
div.className = "ch-item" + (i === UI.selectedChapter ? " sel" : "") +
(locked ? " locked" : "") + (cs.done ? " done" : "");
div.innerHTML = '<span class="ch-idx">' + (cs.done ? "✓" : (locked ? "锁" : ch.order)) + "</span>" +
'<div class="ch-info"><div class="ch-name">' + (locked ? "？？？" : ch.name) + "</div>" +
'<div class="ch-sub">' + (locked ? "尚未解锁" : ch.no + " · " + ch.subtitle) + "</div></div>";
if (!locked) div.onclick = () => { UI.selectedChapter = i; renderMap(); };
list.appendChild(div);
});
renderChapterView();
renderHud();
}
function renderChapterView() {
const i = UI.selectedChapter;
const ch = DATA.chapters[i];
const cs = chapterState(i);
const locked = i >= (S.unlocked || 1);
el("chNo").textContent = tr(ch.no);
el("chTitle").textContent = locked ? "？？？" : tr(ch.name);
el("chMeta").textContent = locked ? "——" :
tr(ch.subtitle) + " ｜ " + tr(ch.era) + " ｜ " + tr("敌对势力：") + tr(ch.enemy.name);
el("chDesc").innerHTML = locked
? "<em>该传尚未解锁。先把前一传走完。</em>"
: tr(ch.desc).replace(/\n/g, "<br>") + "<br><br><em>" +
(cs.done ? tr("已通关。") : tr("当前进度：") + cs.stages + " / " + ch.stages.length + " " + tr("幕")) + "</em>";
const strip = el("stageStrip");
strip.innerHTML = "";
ch.stages.forEach((st, j) => {
const d = document.createElement("span");
let cls = "stage-dot";
if (j < cs.stages) cls += " done";
else if (j === cs.stages && !cs.done) cls += " now";
d.className = cls;
d.textContent = (st.type === "battle" ? "⚔ " : "") + tr(st.title);
strip.appendChild(d);
});
const btn = el("btnEnter");
const canReplay = !locked && cs.done && i >= DATA.chapters.length - 1;
btn.disabled = locked;
btn.textContent = locked ? "未 解 锁"
: (cs.done ? (i === DATA.chapters.length - 1 ? "重 看 终 局" : "已 通 关") : (cs.stages === 0 ? "开 始 这 一 传" : "推 进 剧 情"));
if (!restartRowEl) {
restartRowEl = document.createElement("div");
restartRowEl.id = "chRestartRow";
restartRowEl.className = "set-row set-btns";
restartRowEl.style.marginTop = "10px";
if (btn.parentNode) btn.parentNode.insertBefore(restartRowEl, btn.nextSibling);
}
restartRowEl.innerHTML = "";
if (i === DATA.chapters.length - 1) {
const tier = nextRestartTier();
if (tier) {
const nm = DATA.difficulties[tier].name;
const rb = document.createElement("button");
rb.className = "btn btn-primary";
rb.id = "btnRestartMain";
rb.textContent = isEn() ? "Restart Mainline (" + tr(nm) + ")" : "重 启 主 线（" + nm + "）";
rb.onclick = () => switchDifficulty(tier);
restartRowEl.appendChild(rb);
const hint = document.createElement("span");
hint.style.cssText = "font-size:12px;color:#ff9d84;align-self:center";
hint.textContent = isEn() ? "Cannot go back to a lower difficulty" : "重启后无法回到更低难度";
restartRowEl.appendChild(hint);
}
}
const al = alliedList().map((id) => {
const e = DATA.ever.find((x) => x.id === id);
return e ? tr(e.no) + " " + tr(e.name) : id;
});
if (!locked && ch.unlock) {
const chips = al.length
? al.map((x) => '<span class="chip hot">' + x + "</span>").join("")
: "<span class='chip'>" + tr("暂无 —— 走完第一传之后，会在这里看到他们的名字") + "</span>";
el("unlockNote").innerHTML =
"<div style='flex:1 1 100%'>" + tr("本传题记：") +
"<span style='color:var(--gold2)'>" + tr(ch.unlock) + "</span></div>" +
'<div class="chip-line">' +
'<span class="chip-label">' + tr("已结缘的恒永者") + '</span>' + chips +
"</div>";
} else {
el("unlockNote").innerHTML = "";
}
try {
if (isEn()) ["chapterList","chNo","chTitle","chMeta","chDesc","stageStrip","unlockNote"]
.forEach(function (id) { const n = el(id); if (n) localizeDom(n); });
} catch (e) {}
}
function armHudStrip() {
const strip = document.querySelector(".hud-right");
if (!strip) return;
if (strip.scrollWidth <= strip.clientWidth + 4) {
strip.classList.remove("nudge");
return;
}
let seen = false;
try { seen = !!sessionStorage.getItem("hudStripSeen"); } catch (e) {}
if (!seen) strip.classList.add("nudge");
const atEnd = () => strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 6;
strip.ontouchstart = strip.onpointerdown = function () {
strip.classList.remove("nudge");
try { sessionStorage.setItem("hudStripSeen", "1"); } catch (e) {}
};
strip.onscroll = function () { strip.classList.toggle("at-end", atEnd()); };
strip.classList.toggle("at-end", atEnd());
}
function duelPowerRatio(a, b) {
const A = a.power || 6, B = b.power || 6;
return A / (A + B); 
}
function duelOdds(a, b) {
const pA = Math.max(0.05, Math.min(0.95, duelPowerRatio(a, b)));
const mk = (p) => {
const t = Math.max(0, Math.min(1, (0.50 - p) / 0.24)); 
return Math.round((2 + t * 8) * 10) / 10;
};
return { a: mk(pA), b: mk(1 - pA), pA: pA };
}
function pickTwoDuelists() {
const R = DATA.duelRoster || [];
if (R.length < 2) return null;
const i = Math.floor(Math.random() * R.length);
let j = Math.floor(Math.random() * R.length);
let guard = 0;
while (j === i && guard++ < 50) j = Math.floor(Math.random() * R.length);
if (j === i) return null;
return [R[i], R[j]];
}
function makeDuelFighter(d) {
const st = DATA.duelStats(d);
return {
def: d, name: d.name, no: d.no || "", tag: d.tag || "",
power: d.power || 6,
hp: st.maxHp, maxHp: st.maxHp, atk: st.atk, defLevel: st.defLevel, speed: st.speed,
pool: (d.pool || []).filter((m) => DATA.moves[m]),
shield: 0, dodgeReady: 0, bleed: 0, bleedDmg: 0
};
}
function openDuel() {
if (!S) { toast("先建一份档案。"); return; }
D_ = {
phase: "bet", 
pair: null, a: null, b: null, odds: null,
bet: 0, round: 0, log: [], winner: null, side: null, settled: false
};
newDuelMatch();
renderDuel();
}
function newDuelMatch() {
const pair = pickTwoDuelists();
if (!pair) { toast("斗蛐蛐名册为空。"); return; }
D_.pair = pair;
D_.a = makeDuelFighter(pair[0]);
D_.b = makeDuelFighter(pair[1]);
D_.odds = duelOdds(pair[0], pair[1]);
D_.phase = "bet";
D_.bet = D_.bet && D_.bet >= 10 ? D_.bet : 10;
D_.round = 0;
D_.log = [];
D_.winner = null;
D_.side = null;
D_.settled = false;
renderDuel();
}
function duelLog(cls, text) {
if (!D_) return;
D_.log.push({ cls: cls, text: text });
if (D_.log.length > 200) D_.log.shift();
}
function duelSideOdds(side) {
if (!D_ || !D_.odds) return 2;
return side === "a" ? D_.odds.a : D_.odds.b;
}
function duelChooseSide(side) {
if (!D_ || D_.phase !== "bet") return;
D_.side = side;
renderDuel();
}
function duelBetAdd(delta) {
if (!D_ || D_.phase !== "bet") return;
const next = Math.max(10, (D_.bet || 0) + delta);
if (next > (S.honor || 0)) { toast("功勋不足，最多押 " + (S.honor || 0) + "。"); return; }
D_.bet = next;
renderDuel();
}
function duelBetMax() {
if (!D_ || D_.phase !== "bet") return;
D_.bet = Math.max(10, Math.floor((S.honor || 0) / 10) * 10);
renderDuel();
}
function duelStartFight() {
if (!D_ || D_.phase !== "bet") return;
if (!D_.side) { toast("先选你要押哪一位。"); return; }
if ((D_.bet || 0) < 10) { toast("至少押 10 功勋。"); return; }
if ((S.honor || 0) < D_.bet) { toast("功勋不足。"); return; }
D_.phase = "fight";
D_.round = 0;
D_.log = [];
S.honor = Math.max(0, (S.honor || 0) - D_.bet);
D_.staked = true;
duelLog("l-sys", "—— 已扣除押注 " + D_.bet + " 功勋。你押的是【" + D_[D_.side].name +
"】，倍率 ×" + duelSideOdds(D_.side).toFixed(1) + "。");
duelLog("l-sys", "—— 开打。");
refreshHonor();
renderDuel();
}
const LANG_KEY = "heng_rpg_lang_v1";
let langPref = null;
function loadLangPref() {
try {
const v = localStorage.getItem(LANG_KEY);
if (v && DATA.langCodes.indexOf(v) >= 0) return v;
} catch (e) {}
return null;
}
const PAGE_LANG = (function () {
try {
const p = (typeof location !== "undefined" && location && location.pathname) || "";
return /index\.en\.html$/i.test(p) ? "en" : "zh";
} catch (e) { return "zh"; }
})();
function curLang() {
try { if (typeof DATA !== "undefined" && DATA.forcedLang) return DATA.forcedLang; } catch (e) {}
return PAGE_LANG;
}
try {
DATA.langGetter = function () { return curLang(); };
} catch (e) {}
function isEn() { return curLang() === "en"; }
function tr(s) {
if (!isEn()) return s;
if (s == null) return s;
const k = String(s);
const es = DATA.enStory;
if (es && Object.prototype.hasOwnProperty.call(es, k)) return es[k];
return (typeof DATA.t === "function") ? DATA.t(k) : k;
}
let enPhraseKeys = null;
function enPhraseList() {
if (enPhraseKeys) return enPhraseKeys;
const d = DATA.en || {};
enPhraseKeys = Object.keys(d)
.filter(function (k) { return k.length >= 2 && /[\u4e00-\u9fff]/.test(k); })
.sort(function (a, b) { return b.length - a.length; });
return enPhraseKeys;
}
function localizeDom(root) {
if (!isEn()) return 0;
const d = DATA.en || {};
let n = 0;
const norm = function (x) { return String(x).replace(/[\s\u3000]+/g, ""); };
let exact = null; 
let dynKeys = null; 
function buildIndex() {
exact = {};
dynKeys = [];
for (const k in d) {
if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
const nk = norm(k);
if (!nk) continue;
exact[nk] = d[k];
if (/[0-9]/.test(k)) dynKeys.push(k);
}
dynKeys.sort(function (a, b) { return norm(b).length - norm(a).length; });
}
function dynRewrite(raw) {
if (!dynKeys) return null;
const nr = norm(raw);
for (let i = 0; i < dynKeys.length; i++) {
const k = dynKeys[i];
const tpl = norm(k);
const parts = tpl.split(/[0-9]+/);
if (parts.length < 2) continue;
let re = "^";
for (let t = 0; t < parts.length; t++) {
if (t > 0) re += "[0-9]*";
re += parts[t].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
re += "$";
try {
if (new RegExp(re).test(nr)) {
const nums = nr.match(/[0-9]+/g) || [];
let en = d[k];
let idx = 0;
en = en.replace(/[0-9]+/g, function () { return nums[idx++] !== undefined ? nums[idx - 1] : ""; });
return en;
}
} catch (e) {}
}
return null;
}
const fix = function (txt) {
if (txt == null) return null;
const raw = String(txt);
const k = raw.trim();
if (!k) return null;
if (!/[\u4e00-\u9fff]/.test(k)) return null;
if (!exact) buildIndex();
const nk = norm(k);
if (Object.prototype.hasOwnProperty.call(exact, nk)) { n++; return exact[nk]; }
const dyn = dynRewrite(k);
if (dyn !== null) { n++; return dyn; }
return null;
};
const walk = function (node) {
if (!node) return;
if (node.nodeType === 3) {
const v = fix(node.nodeValue);
if (v !== null) node.nodeValue = v;
return;
}
if (node.nodeType !== 1) return;
["placeholder", "title", "aria-label"].forEach(function (a) {
const raw = node.getAttribute && node.getAttribute(a);
if (raw) { const v = fix(raw); if (v !== null) node.setAttribute(a, v); }
});
if (node.tagName === "INPUT" && node.type === "button") {
const v = fix(node.value); if (v !== null) node.value = v;
}
const kids = node.childNodes;
if (kids) for (let i = 0; i < kids.length; i++) walk(kids[i]);
};
walk(root || document.body);
return n;
}
function relocalize() {
try { if (typeof DATA.applyEnOverlay === "function") DATA.applyEnOverlay(); } catch (e) {}
try { renderHud(); } catch (e) {}
try { if (window.HengFx && window.HengFx.buildAudioDock) window.HengFx.buildAudioDock(); } catch (e) {}
try { renderMap(); } catch (e) {}
try { localizeDom(document.body); } catch (e) {}
}
function setLang(code) {
if (DATA.langCodes.indexOf(code) < 0) return;
if (code === curLang()) return;
try { localStorage.removeItem(LANG_KEY); } catch (e) {}
location.href = (code === "en") ? "index.en.html" : "index.html";
}
function setTextSpeed(v) {
const n = Math.max(0, parseInt(v, 10) || 0);
if (S) { S.textSpeed = n; saveGame(true); }
try {
document.querySelectorAll("#dockPanel [data-textspeed]").forEach(function (x) {
x.classList.toggle("btn-primary", String(n) === x.getAttribute("data-textspeed"));
});
} catch (e) {}
return n;
}
try { window.setTextSpeed = setTextSpeed; } catch (e) {}
function refreshHonor() {
try { renderHud(); } catch (e) {}
try { saveGame(true); } catch (e) {}
}
function duelNextRound() {
if (!D_ || D_.phase !== "fight") return;
const A = D_.a, B = D_.b;
if (A.hp <= 0 || B.hp <= 0) return;
D_.round++;
const r = D_.round;
let first = A, second = B;
if (B.speed > A.speed || (B.speed === A.speed && Math.random() < 0.5)) { first = B; second = A; }
duelLog("l-sys", "—— 第 " + r + " 回合。");
duelStrike(first, second, r);
if (second.hp > 0 && first.hp > 0) duelStrike(second, first, r);
[A, B].forEach((f) => {
if (f.bleed > 0 && f.hp > 0) {
const d = Math.max(1, Math.round(f.bleedDmg));
f.hp = Math.max(0, f.hp - d);
duelLog("l-dead", "　　" + f.name + " 因流血损失 " + d + " 点。");
f.bleed--;
}
if (f.shield > 0) f.shield = Math.round(f.shield * 0.82); 
});
if (A.hp <= 0 || B.hp <= 0 || r >= 40) {
D_.phase = "over";
if (A.hp <= 0 && B.hp <= 0) D_.winner = A.hp >= B.hp ? "a" : "b";
else if (A.hp <= 0) D_.winner = "b";
else if (B.hp <= 0) D_.winner = "a";
else D_.winner = A.hp >= B.hp ? "a" : "b"; 
duelSettle();
}
renderDuel();
}
function duelStrike(atkF, defF, round) {
const pool = atkF.pool.length ? atkF.pool : ["e_claw"];
const mid = pool[Math.floor(Math.random() * pool.length)];
const m = DATA.moves[mid] || { name:"撕咬", power:1.0, acc:96, type:"刃" };
if (m.weak) defF.weakNext = 1;
if (m.shield) {
const cap = defF.maxHp * 0.20;
atkF.shield = Math.min(cap, (atkF.shield || 0) + atkF.maxHp * m.shield);
duelLog("l-heal", "　　【" + atkF.name + "】" + m.name + "：护盾 +" + Math.round(atkF.maxHp * m.shield) + "。");
return;
}
if (!m.power) {
if (m.heal) {
const h = Math.round(atkF.maxHp * m.heal);
atkF.hp = Math.min(atkF.maxHp, atkF.hp + h);
duelLog("l-heal", "　　【" + atkF.name + "】" + m.name + "：回复 " + h + " 点。");
} else {
duelLog("l-heal", "　　【" + atkF.name + "】" + m.name + "。");
}
return;
}
let acc = m.acc === undefined ? 90 : m.acc;
if (defF.dodgeReady > 0) { acc -= 30; }
if (atkF.weakNext) { acc -= 25; atkF.weakNext = 0; }
const roll = Math.random() * 100;
if (roll > acc) {
duelLog("l-dead", "　　【" + atkF.name + "】" + m.name + "（" + m.type + "）掷出 " + Math.round(roll) + " → 失手。");
return;
}
let dmg = (atkF.atk * (m.power || 1) * 1.55) - defF.defLevel * 0.5;
if (m.pierce) dmg += defF.defLevel * m.pierce * 0.5;
if (m.multi && m.multi > 1) dmg *= 1 + (m.multi - 1) * 0.7;
dmg = Math.max(1, Math.round(dmg));
if (defF.dodgeReady > 0) { dmg = Math.round(dmg * (1 - defF.dodgeReady)); defF.dodgeReady = 0; }
if (defF.shield > 0) {
const cut = Math.min(defF.shield, dmg);
defF.shield -= cut; dmg -= cut;
}
defF.hp = Math.max(0, defF.hp - dmg);
duelLog("l-hit", "　　【" + atkF.name + "】" + m.name + "（" + m.type + "）→ " + defF.name + " 受 " +
dmg + " 点" + (m.multi && m.multi > 1 ? "（" + m.multi + " 段）" : "") + "。");
if (m.bleed) { defF.bleed = 2; defF.bleedDmg = Math.max(2, dmg * 0.22); }
if (m.dodge) { atkF.dodgeReady = m.dodge; }
}
function duelSettle() {
if (!D_ || !D_.side) return;
const odds = duelSideOdds(D_.side);
const win = D_.winner === D_.side;
const gross = Math.round(D_.bet * odds); 
D_.oddsUsed = odds;
D_.gross = gross;
if (D_.settled) return; 
D_.settled = true;
if (win) {
D_.payout = gross - D_.bet; 
S.honor = (S.honor || 0) + gross; 
duelLog("l-crit", "—— 你押的【" + D_[D_.side].name + "】赢了。返 " + D_.bet +
" + 赢得 " + D_.payout + "，共 +" + gross + " 功勋（押 " + D_.bet +
" × " + odds.toFixed(1) + "）。");
} else {
D_.payout = -D_.bet;
duelLog("l-dead", "—— 你押的【" + D_[D_.side].name + "】输了。押注 " + D_.bet +
" 功勋已扣（押 " + D_.bet + " × " + odds.toFixed(1) + "）。");
}
refreshHonor();
try {
if (win) toast("押中！+" + gross + " 功勋（本金 " + D_.bet + " 返还 + 赢得 " + D_.payout + "）");
else toast("押错，" + D_.bet + " 功勋已扣。");
} catch (e) {}
try {
setTimeout(function () {
try { if (typeof D_ !== "undefined" && D_ && D_.phase === "over") newDuelMatch(); } catch (e2) {}
}, 1400);
} catch (e) {}
}
const SP_SQUAD_CAP = 8;
let restartRowEl = null; 
function spDone() { return (S && S.specialBoss) || null; }
function spUnlocked(b) {
return chaptersCleared() >= (b.unlockChapters || 12);
}
function spAllyId(b) { return "sp_" + b.id; }
function spHasReward(b) {
return (S.allies || []).some((a) => a.id === spAllyId(b) || (a.spBoss && a.spBoss === b.id));
}
function openSpecialBosses() {
if (!S) { toast("先建一份档案。"); return; }
const done = spDone();
let html = "<p style='color:var(--muted)'>" + (DATA.specialBossNote || "") + "</p>";
html += "<div class='stat-grid'>" +
box("已通关传记", chaptersCleared() + " / " + DATA.chapters.length) +
box("特殊角色", done ? "已获得（另一位已关闭）" : "尚未获得") +
box("编队上限", SP_SQUAD_CAP + " 人（仅此战）") +
box("当前功勋", S.honor || 0) +
"</div>";
if (done) {
const got = DATA.specialBosses.find((b) => b.id === done);
html += "<p style='color:var(--gold2)'>你已经选择并击败了 <b>" + (got ? got.name : done) +
"</b>。另一位全功率形态已经永久关闭。</p>";
}
html += "<h4>两位全功率形态</h4><div class='codex-grid'>";
DATA.specialBosses.forEach(function (b) {
const unlock = spUnlocked(b);
const locked = !!done && done !== b.id;
const got = spHasReward(b);
const e = DATA.enemies[b.enemy] || {};
html += "<div class='codex-card" + ((!unlock || locked) ? " locked" : "") + "' data-spboss='" + b.id + "'>" +
"<div class='cc-name' style='color:" + b.color + "'>" + b.glyph + " " + b.name + "</div>" +
"<div class='cc-sub'>" + b.form + " ｜ 全功率</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + (b.intro || "") + "</div>" +
"<div class='cc-sub' style='color:var(--gold2)'>击败奖励：" + b.reward.name +
(got ? "（已获得）" : "") + "</div>" +
"<div class='cc-sub'>" +
(!unlock ? "需通关 " + (b.unlockChapters || 12) + " 传"
: locked ? "已关闭（你选了另一位）"
: "点击 → 进入选角") + "</div></div>";
});
html += "</div>";
openModal("特殊 BOSS · 全功率形态", html);
$$("#modalBody [data-spboss]").forEach(function (c) {
c.onclick = function () {
const id = c.getAttribute("data-spboss");
const b = DATA.specialBosses.find((x) => x.id === id);
if (!b) return;
if (!spUnlocked(b)) { toast("需要通关 " + (b.unlockChapters || 12) + " 传。"); return; }
if (done && done !== b.id) { toast("这一位已经永久关闭了。"); return; }
if (spHasReward(b)) { toast("你已经击败过他，并获得了对应的特殊角色。"); return; }
openSpSquad(b.id);
};
});
}
function openSpSquad(bossId) {
const b = DATA.specialBosses.find((x) => x.id === bossId);
if (!b) return;

S.spSquad = (S.spSquad || []).filter((id) => allyById(id)).slice(0, SP_SQUAD_CAP);
if (!S.spSquad.length) S.spSquad = (S.squad || []).slice(0, SP_SQUAD_CAP);
if (!Array.isArray(S.spDraft)) S.spDraft = S.spSquad.slice();
const draft = S.spDraft;
const allies = S.allies || [];
let html = "<p style='color:var(--muted)'>这一战你的<b>编队上限临时扩到 " + SP_SQUAD_CAP +
" 人</b>。选出你要带上会台的人——选完就会开战，<b>开战后另一位全功率形态将永久关闭</b>。</p>";
html += "<div class='stat-grid'>" +
box("对手", b.short) +
box("已选", draft.length + " / " + SP_SQUAD_CAP) +
box("本次可带", SP_SQUAD_CAP + " 人") +
box("名册人数", allies.length) +
"</div>";
html += "<h4>选择出战成员</h4><div class='codex-grid'>";
allies.forEach(function (a) {
const on = draft.indexOf(a.id) >= 0;
const st = allyStats(a);
const ji = jobInfo(jobOfAlly(a));
html += "<div class='codex-card" + (on ? " hot" : "") + "' data-sppick='" + a.id + "'>" +
"<div class='cc-name' style='" + nameStyle(a) + "'>" + a.name + (on ? " ◆" : "") + "</div>" +
"<div class='cc-sub'>" + ji.glyph + " " + ji.name + " ｜ Lv." + (a.level || 1) + "</div>" +
"<div class='cc-sub'>生命 " + st.hp + " ｜ 力量 " + st.atk + " ｜ 速度 " + st.spd + "</div>" +
"</div>";
});
html += "</div>";
html += "<div class='set-row set-btns' style='margin-top:12px'>" +
"<button class='btn' data-spact='all'>全 选</button>" +
"<button class='btn' data-spact='clear'>全 不 选</button>" +
"<button class='btn' data-spact='squad'>用 原 编 队</button>" +
"<button class='btn btn-primary' data-spact='go'>进 入 会 台</button>" +
"<button class='btn btn-ghost' data-spact='back'>返 回</button>" +
"</div>";
html += "<p style='color:#ff9d84;margin-top:8px'>注意：进入会台后，另一位全功率形态会被永久关闭，且无法反悔。</p>";
openModal("特殊 BOSS · 选角", html);
$$("#modalBody [data-sppick]").forEach(function (c) {
c.onclick = function () {
const id = c.getAttribute("data-sppick");
const i = S.spDraft.indexOf(id);
if (i >= 0) S.spDraft.splice(i, 1);
else {
if (S.spDraft.length >= SP_SQUAD_CAP) { toast("最多带 " + SP_SQUAD_CAP + " 人。"); return; }
S.spDraft.push(id);
}
openSpSquad(bossId);
};
});
$$("#modalBody [data-spact]").forEach(function (btn2) {
btn2.onclick = function () {
const a = btn2.getAttribute("data-spact");
if (a === "all") { S.spDraft = (S.allies || []).slice(0, SP_SQUAD_CAP).map((x) => x.id); openSpSquad(bossId); }
else if (a === "clear") { S.spDraft = []; openSpSquad(bossId); }
else if (a === "squad") { S.spDraft = (S.squad || []).slice(0, SP_SQUAD_CAP); openSpSquad(bossId); }
else if (a === "back") { S.spDraft = null; openSpecialBosses(); }
else if (a === "go") {
if (!S.spDraft.length) { toast("至少要带一个人。"); return; }
askConfirm("确认挑战",
"确定挑战【" + b.name + "】？<br><br>进入后另一位将永久关闭，无法反悔。",
"进 入 会 台",
function () {
S.spSquad = (S.spDraft || []).slice(0, SP_SQUAD_CAP);
S.spDraft = null;
startSpecialBoss(bossId);
}, true);
}
};
});
}
function startSpecialBoss(bossId, draftSquad) {
const b = DATA.specialBosses.find((x) => x.id === bossId);
if (!b) return;
if (spDone() && spDone() !== bossId) { toast("另一位已经关闭了。"); return; }
const e = DATA.enemies[b.enemy];
if (!e) { toast("BOSS 数据缺失。"); return; }

let clean = (S.spSquad || []).filter((id) => allyById(id)).slice(0, SP_SQUAD_CAP);
if (!clean.length) clean = (S.squad || []).filter((id) => allyById(id)).slice(0, SP_SQUAD_CAP);
if (!clean.length) {
toast("这一战需要至少 1 名可用成员。先去「编队」安排上场的人。");
return;
}
S.spSquad = clean.slice();
S.specialBoss = bossId; 
S.spActive = true; 
closeModal();
try {
const stage = {
type: "battle", boss: true, bossId: b.enemy, spBoss: bossId,
squadOverride: clean.slice(),
title: "全力 · " + b.short,
enemy: b.enemy, enemyKeys: [b.enemy],
enemyScale: 1,
award: { exp: 1200, honor: 5000 },
intro: b.intro,
win: "会台安静下来了。他没有再站起来。",
lose: b.lose || { text: "你被抬下去了。" }
};
startBattle(stage);
if (B) {
B.boss = true;
B.bossId = b.enemy;
B.spBoss = bossId;
B.noItem = true;
B.noHeal = true;

const isSiyuan = (bossId === "siyuan_godking");
const bossHp = isSiyuan ? Math.round(2600 + S.level * 620) : Math.round(1500 + S.level * 420);
(B.enemies || []).forEach(function (en) {
en.maxHp = bossHp;
en.hp = bossHp;
en.atkLevel = Math.round((isSiyuan ? 22 : 16) + S.level * (isSiyuan ? 1.95 : 1.5));
en.defLevel = Math.round((isSiyuan ? 15 : 11) + S.level * (isSiyuan ? 1.45 : 1.1));
en.speed = Math.round((isSiyuan ? 18 : 15) + S.level * (isSiyuan ? 0.55 : 0.45));
en.isBoss = true;
en.dmgMul = isSiyuan ? 1.75 : 1.45;

if (isSiyuan) {
en.coins = Math.min(8, (en.coins || 4) + 2);
en.shield = Math.round(bossHp * 0.15);
}
if (b.pool && b.pool.length) en.moves = b.pool.filter((m) => DATA.moves[m]);
});
renderBattle();
logLine("l-boss", "【" + b.name + "】封印全开。这一战你的编队扩到 " + SP_SQUAD_CAP + " 人，但另一方已经被你关上了门。");
}
if (!B || !B.enemies || !B.enemies.length || (typeof UI === "undefined" || UI.screen !== "battle")) {
throw new Error("战斗场景没有建立（B=" + (B ? "有" : "无") +
" 敌人=" + (B && B.enemies ? B.enemies.length : 0) + "）");
}
} catch (err) {
if (S) {
S.spActive = false;
S.specialBoss = null;
saveGame(true);
}
try { renderMap(); show("map"); } catch (e2) {}
toast("进入全力战斗时出错：" + (err && err.message ? err.message : err));
}
}
function grantSpReward(bossId) {
const b = DATA.specialBosses.find((x) => x.id === bossId);
if (!b) return;
if (spHasReward(b)) return;
const r = b.reward;
S.allies = S.allies || [];
S.allies.push({
id: spAllyId(b), name: r.name,
tier: r.rarity || "relic", rarity: r.rarity || "relic",
level: Math.max(1, S.level), glyph: r.glyph,

color: r.color || "#c9ced8",
base: r.base || 150, atkBonus: r.atkBonus || 0,
bwShine: !!r.bwShine, 
hpBonus: r.hpBonus || 0, speedBonus: r.speedBonus || 0, defBonus: r.defBonus || 0,
coins: r.coins || 0, sp: r.sp || 20,
weaponId: r.weaponId || "orb_void", job: r.job || "mage",
loadout: null, summonId: null, note: r.note || "特殊角色",
spBoss: b.id, spPower: r.power || "∞",
hp: null, sp: 20
});
invalidateAllyIndex();
S.honor = (S.honor || 0) + 8000;
saveGame(true);
toast("获得特殊角色：" + r.name + "（战力 " + (r.power || "∞") + "）");
openModal("获得特殊角色",
"<p>你击败了 <b style='color:" + b.color + "'>" + b.name + "</b>。</p>" +
"<p>他站了起来，走到你这一边。</p>" +
"<div class='stat-grid'>" + box("角色", r.name) + box("战力", r.power || "∞") +
box("职业", (DATA.jobs[r.job] || {}).name || "—") +
box("兵装", (DATA.weapons.find((w) => w.id === r.weaponId) || {}).name || "—") + "</div>" +
"<p style='color:var(--gold2)'>另一位全功率形态已永久关闭。特殊角色只能拥有一个。</p>" +
"<p style='color:var(--muted)'>他已经加入名册，可以在「编队」里带上场。</p>");
}
function onModalOpen() {
try { const m = el("modal"); return !!(m && m.classList && m.classList.contains("on")); }
catch (e) { return false; }
}
function duelHpBar(f) {
const pct = Math.max(0, Math.min(100, Math.round(f.hp / f.maxHp * 100)));
return '<div class="duel-hp"><i style="width:' + pct + '%"></i></div>' +
'<div class="duel-hpn">' + Math.round(f.hp) + " / " + f.maxHp + "</div>";
}
function duelCardHTML(f, side) {
const picked = D_.side === side;
const odds = duelSideOdds(side);
return '<div class="duel-card' + (picked ? " picked" : "") + (D_.winner === side ? " won" : "") +
(D_.phase === "over" && D_.winner && D_.winner !== side ? " lost" : "") +
'" data-duelside="' + side + '">' +
'<div class="duel-role">' + (side === "a" ? "左位" : "右位") + "</div>" +
'<div class="duel-name">' + f.name + "</div>" +
'<div class="duel-tag">' + (f.no ? f.no + " · " : "") + f.tag + "</div>" +
'<div class="duel-power">实力刻度 <b>' + f.power.toFixed(1) + "</b></div>" +
duelHpBar(f) +
'<div class="duel-odds">押它 → 倍率 <b>×' + odds.toFixed(1) + "</b></div>" +
(picked ? '<div class="duel-pick">◆ 你押了这位</div>' : "") +
"</div>";
}
function renderDuel() {
if (!D_) return;
if (!el("modalBody")) return;
const A = D_.a, B = D_.b;
let html = "";
if (D_.phase === "bet") {
html += "<p style='color:var(--muted)'>系统随机抽了两位剧情角色自动对打。" +
"开打前你可以下赌——<b>10 功勋起押，10 功勋一加</b>，" +
"押中按倍率拿功勋，押错扣除押注。</p>";
html += "<div class='duel-arena'>" + duelCardHTML(A, "a") +
"<div class='duel-vs'>对<br>打</div>" + duelCardHTML(B, "b") + "</div>";
html += "<div class='stat-grid'>" +
box("当前功勋", S.honor || 0) +
box("押注", D_.bet) +
box("押哪边", D_.side ? D_[D_.side].name : "未选") +
box("命中可得", D_.side ? Math.round(D_.bet * duelSideOdds(D_.side)) : "—") +
"</div>";
html += "<h4>下赌</h4><div class='duel-bet'>" +
"<button class='btn btn-tiny' data-duelbet='-10'>− 10</button>" +
"<button class='btn btn-tiny' data-duelbet='10'>＋ 10</button>" +
"<button class='btn btn-tiny' data-duelbet='-100'>− 100</button>" +
"<button class='btn btn-tiny' data-duelbet='100'>＋ 100</button>" +
"<button class='btn btn-tiny' data-duelbet='max'>全 押</button>" +
"<button class='btn btn-tiny' data-duelbet='reset'>重 置</button>" +
"</div>";
html += "<div class='set-row set-btns' style='margin-top:12px'>" +
"<button class='btn btn-primary' data-duelact='fight'" +
(D_.side ? "" : " disabled") + ">开 始 观 战</button>" +
"<button class='btn' data-duelact='new'>换 一 批（100 功勋）</button>" +
"<button class='btn btn-ghost' data-duelact='close'>关 闭</button>" +
"</div>";
if (!D_.side) html += "<p style='color:var(--gold2)'>先点上面两位中的一位，选择你要押谁。</p>";
} else {
html += "<div class='duel-arena'>" + duelCardHTML(A, "a") +
"<div class='duel-vs'>第<br>" + D_.round + "<br>回</div>" + duelCardHTML(B, "b") + "</div>";
html += "<div class='stat-grid'>" +
box("你押", D_.side ? D_[D_.side].name : "—") +
box("押注（已扣）", D_.bet) +
box("倍率", "×" + duelSideOdds(D_.side).toFixed(1)) +
box("当前功勋", S.honor || 0) +
"</div>";
if (D_.phase === "fight" && !D_.settled) {
html += "<p style='color:var(--gold2)'>已从功勋中扣除押注 <b>" + D_.bet +
"</b> 点。赢了会返还本金并按倍率发放。</p>";
}
html += "<h4>战况</h4><div class='duel-log' id='duelLog'></div>";
if (D_.phase === "fight") {
html += "<div class='set-row set-btns' style='margin-top:10px'>" +
"<button class='btn btn-primary' data-duelact='next'>下 一 回 合</button>" +
"<button class='btn btn-ghost' data-duelact='auto'>自 动 打 完</button>" +
"</div>";
} else {
const won = D_.winner === D_.side;
html += "<h4 style='color:" + (won ? "var(--ok)" : "#ff9d84") + "'>" +
(won ? "你赢了" : "你输了") + "</h4>";
html += "<p>赢家是 <b class='k'>" + D_[D_.winner].name + "</b>。</p>";
if (won) {
html += "<p>返还本金 <b>" + D_.bet + "</b> + 赢得 <b style='color:var(--ok)'>" +
D_.payout + "</b>，共入账 <b style='color:var(--ok)'>+" + (D_.gross || 0) +
"</b> 功勋（押 " + D_.bet + " × " + (D_.oddsUsed || 2).toFixed(1) + "）。</p>";
} else {
html += "<p>押注 <b style='color:#ff9d84'>" + D_.bet + "</b> 功勋已扣除（押 " +
D_.bet + " × " + (D_.oddsUsed || 2).toFixed(1) + "）。</p>";
}
html += "<p>现在持有功勋：<b class='k'>" + (S.honor || 0) + "</b></p>";
html += "<div class='set-row set-btns' style='margin-top:10px'>" +
"<button class='btn btn-primary' data-duelact='again'>再 来 一 场</button>" +
"<button class='btn' data-duelact='new'>换 一 批（100 功勋）</button>" +
"<button class='btn btn-ghost' data-duelact='close'>关 闭</button>" +
"</div>";
}
}
if (!onModalOpen()) openModal("斗蛐蛐", "");
el("modalTitle").textContent = "斗蛐蛐";
el("modalBody").innerHTML =
"<p style='color:var(--muted)'>斗蛐蛐 —— 押注用的是功勋，赌的是剧情角色之间的胜负。</p>" + html;
const lg = el("duelLog");
if (lg) {
lg.innerHTML = D_.log.map(function (l) {
const col = l.cls === "l-crit" ? "var(--gold2)"
: l.cls === "l-dead" ? "#ff9d84"
: l.cls === "l-hit" ? "var(--cyan)"
: l.cls === "l-heal" ? "var(--ok)" : "var(--muted)";
return "<p style='color:" + col + "'>" + l.text + "</p>";
}).join("");
lg.scrollTop = lg.scrollHeight;
}
$$("#modalBody [data-duelside]").forEach(function (c) {
c.onclick = function () {
if (D_.phase !== "bet") return;
duelChooseSide(c.getAttribute("data-duelside"));
};
});
$$("#modalBody [data-duelbet]").forEach(function (b) {
b.onclick = function () {
const v = b.getAttribute("data-duelbet");
if (v === "max") duelBetMax();
else if (v === "reset") { D_.bet = 10; renderDuel(); }
else duelBetAdd(parseInt(v, 10) || 10);
};
});
$$("#modalBody [data-duelact]").forEach(function (b) {
b.onclick = function () {
const a = b.getAttribute("data-duelact");
if (a === "fight") duelStartFight();
else if (a === "next") duelNextRound();
else if (a === "auto") { let g = 0; while (D_ && D_.phase === "fight" && g++ < 60) duelNextRound(); }
else if (a === "again") { D_.phase = "bet"; D_.a = makeDuelFighter(D_.pair[0]); D_.b = makeDuelFighter(D_.pair[1]); D_.round = 0; D_.log = []; D_.winner = null; renderDuel(); }
else if (a === "new") {
if ((S.honor || 0) < 100) { toast("功勋不足（换一批需要 100）。"); return; }
S.honor -= 100;
refreshHonor();
saveGame(true);
toast("换一批：−100 功勋");
newDuelMatch();
}
else if (a === "close") closeModal();
};
});
}
function dayKey(ts) {
const d = ts ? new Date(ts) : new Date();
const p = (n) => (n < 10 ? "0" + n : String(n));
return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}
function msUntilReset() {
const d = new Date();
const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
return next.getTime() - d.getTime();
}
function fmtDur(ms) {
const s = Math.max(0, Math.floor(ms / 1000));
const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
return h + " 小时 " + (m < 10 ? "0" + m : m) + " 分";
}
const COMMISSION_POOL = [
{ kind:"killTag", key:"cult", title:"清点邪教据点", brief:"据点周围的邪教成员，一个不留。",
need:()=> 6 + Math.floor(Math.random()*5) },
{ kind:"arenaWins", title:"无垠厅的账", brief:"在无垠厅赢几场。连胜有额外加成。",
need:()=> 3 + Math.floor(Math.random()*3) },
{ kind:"battleWin", title:"例行巡防", brief:"随便打几场，让分部知道你还活着。",
need:()=> 3 + Math.floor(Math.random()*2) },
{ kind:"materials", title:"素材回收", brief:"把战场上剩下的东西带回来，什么都收。",
need:()=> 8 + Math.floor(Math.random()*8) },
{ kind:"killAny", title:"压制行动", brief:"压住一片区域，直到它们不敢再冒头。",
need:()=> 8 + Math.floor(Math.random()*6) },
{ kind:"bossWin", title:"上会台", brief:"去会台打赢一位恒永者。第一次可能不太好看。",
need:()=> 1 },
{ kind:"arenaBattle", title:"指定战场 · 演武场", brief:"去无垠厅第一层打一场。", need:()=>1, tier:0 },
{ kind:"arenaBattle", title:"指定战场 · 异界裂隙", brief:"去无垠厅第二层打一场。", need:()=>1, tier:1 },
{ kind:"arenaBattle", title:"指定战场 · 骸域外围", brief:"去无垠厅第三层打一场。", need:()=>1, tier:2 }
];
function rollCommissions() {
const pool = COMMISSION_POOL.slice();
const total = DATA.recruit.costTen;
const base = Math.floor(total / 6);
const rem = total - base * 6;
const out = [];
for (let i = 0; i < 6; i++) {
const idx = Math.floor(Math.random() * pool.length);
const t = pool.splice(idx, 1)[0] || COMMISSION_POOL[0];
out.push({
id: "c" + i, kind: t.kind, key: t.key || null,
title: t.title, brief: t.brief,
need: t.need(), tier: (t.tier === undefined ? null : t.tier),
arenaDiff: (t.kind === "arenaBattle" ? (ARENA_DIFFS[Math.floor(Math.random() * 2)].id) : null),
honor: base + (i < rem ? 1 : 0),
exp: Math.round(80 + t.need() * 14)
});
}
return out;
}
function ensureCommissions() {
if (!S) return;
const today = dayKey();
if (S.commissionDay !== today || !Array.isArray(S.commissions) || S.commissions.length !== 6) {
S.commissionDay = today;
S.commissions = rollCommissions();
S.commissionClaimed = {};
S.commissionBase = null;
saveGame(true);
}
}
function commissionBaseline() {
const c = S.questCounters || {};
return {
kills: c.kills || 0,
cult: (c.killsByTag || {}).cult || 0,
battles: c.battles || 0,
arenaWins: c.arenaWins || 0,
bossWins: c.bossWins || 0,
mats: totalMats(),
arenaCleared: Object.assign({}, S.arenaCleared || {}),
day: S.commissionDay
};
}
function ensureBaseline() {
if (!S) return;
if (!S.commissionBase || S.commissionBase.day !== S.commissionDay) {
S.commissionBase = commissionBaseline();
saveGame(true);
}
}
function commissionProgress(cm) {
ensureBaseline();
const b = S.commissionBase || commissionBaseline();
const c = S.questCounters || {};
switch (cm.kind) {
case "killTag": return Math.max(0, ((c.killsByTag || {}).cult || 0) - (b.cult || 0));
case "killAny": return Math.max(0, (c.kills || 0) - (b.kills || 0));
case "battleWin": return Math.max(0, (c.battles || 0) - (b.battles || 0));
case "arenaWins": return Math.max(0, (c.arenaWins || 0) - (b.arenaWins || 0));
case "bossWin": return Math.max(0, (c.bossWins || 0) - (b.bossWins || 0));
case "materials": return Math.max(0, totalMats() - (b.mats || 0));
case "arenaBattle": {
const id = arenaClearKey(cm.tier || 0, cm.arenaDiff || "normal");
const now = (S.arenaCleared || {})[id] || 0;
const was = (b.arenaCleared || {})[id] || 0;
return Math.max(0, now - was);
}
default: return 0;
}
}
function commissionReady(cm) { return commissionProgress(cm) >= cm.need; }
function claimCommission(id) {
const cm = (S.commissions || []).find((x) => x.id === id);
if (!cm) return;
if ((S.commissionClaimed || {})[id]) { toast("这条已经交付过了。"); return; }
if (!commissionReady(cm)) { toast("条件还没满足。"); return; }
S.commissionClaimed = S.commissionClaimed || {};
S.commissionClaimed[id] = true;
S.honor = (S.honor || 0) + cm.honor;
const lines = [];
gainExp(cm.exp, lines);
saveGame(true);
toast("委托完成：+" + cm.honor + " 功勋 · +" + cm.exp + " 经验");
openCommissions();
}
function commissionHonorLeft() {
const claimed = S.commissionClaimed || {};
return (S.commissions || []).reduce((a, x) => a + (claimed[x.id] ? 0 : x.honor), 0);
}
function openCommissions() {
if (!S) { toast("先建一份档案。"); return; }
ensureCommissions();
ensureBaseline();
const claimed = S.commissionClaimed || {};
const allItems = (S.commissions || []).map((cm) => {
const have = commissionProgress(cm);
const pct = Math.min(100, Math.round(have / cm.need * 100));
const ok = have >= cm.need;
const got = !!claimed[cm.id];
let acts = "";
if (cm.kind === "arenaBattle") acts += "<button class='btn btn-tiny btn-primary' data-cmgo='" + cm.tier + "' data-cmdiff='" + (cm.arenaDiff || "normal") + "'>前 往 无 垠 厅</button>";
if (cm.kind === "bossWin") acts += "<button class='btn btn-tiny' data-cmboss='1'>去 会 台</button>";
if (ok && !got) acts += "<button class='btn btn-tiny btn-primary' data-cmclaim='" + cm.id + "'>交 付</button>";
const html = "<div class='cm" + (got ? " claimed" : (ok ? " ready" : "")) + "'>" +
"<div class='cm-top'><span class='cm-name'>" + cm.title + "</span>" +
"<span class='cm-honor'>+" + cm.honor + "</span></div>" +
"<div class='cm-brief'>" + cm.brief + "</div>" +
"<div class='qbar'><i style='width:" + pct + "%'></i></div>" +
"<div class='cm-sub'>" + have + " / " + cm.need + "　·　经验 +" + cm.exp +
(got ? "　·　已交付" : "") + "</div>" +
(acts ? "<div class='cm-act'>" + acts + "</div>" : "") +
"</div>";
return { id: cm.id, got: got, html: html };
});
const cards = allItems.filter((x) => !x.got).map((x) => x.html).join("");
const doneCards = allItems.filter((x) => x.got).map((x) => x.html).join("");
openModal("委托 · 每日任务",
"<div class='cm-head'>" +
"<span>每天 <b class='k'>6</b> 条，全部完成可得 <b class='k'>" + DATA.recruit.costTen +
"</b> 功勋（正好一个十连），另有经验。</span>" +
"<span class='cm-timer'>距离刷新 <b id='cmTimer'>" + fmtDur(msUntilReset()) + "</b></span>" +
"</div>" +
"<div class='stat-grid'>" +
"<div class='stat-box'><div class='s-name'>已交付</div><div class='s-val'>" +
Object.keys(claimed).length + " / 6</div></div>" +
"<div class='stat-box'><div class='s-name'>今天还可领</div><div class='s-val'>" + commissionHonorLeft() + "</div></div>" +
"<div class='stat-box'><div class='s-name'>刷新日</div><div class='s-val'>" + S.commissionDay + "</div></div>" +
"</div>" +
"<h4>进行中的委托</h4>" +
(cards ? "<div class='cm-grid'>" + cards + "</div>"
: "<p class='muted'>今天的委托都交付完了。明天 0 点刷新。</p>") +
(doneCards ? "<h4>已完成（不再计入奖励）</h4><div class='cm-grid cm-done'>" + doneCards + "</div>" : "") +
"<p style='color:var(--muted);margin-top:12px'>刷新时间按你设备的本地时间，每天 0 点重置。未交付的委托会作废；进度从当天第一次打开这个面板时开始计算。</p>");
const tick = setInterval(() => {
const t = el("cmTimer");
if (!t) { clearInterval(tick); return; }
t.textContent = fmtDur(msUntilReset());
}, 1000);
$$("#modalBody [data-cmclaim]").forEach((b) => { b.onclick = () => claimCommission(b.getAttribute("data-cmclaim")); });
$$("#modalBody [data-cmgo]").forEach((b) => {
b.onclick = () => {
const t = parseInt(b.getAttribute("data-cmgo"), 10);
const df = b.getAttribute("data-cmdiff") || "normal";
closeModal();
openArena(isNaN(t) ? 0 : t, df);
};
});
$$("#modalBody [data-cmboss]").forEach((b) => { b.onclick = () => { closeModal(); openBosses(); }; });
}
const MyMusic = { list: [], idx: -1, audio: null, volume: 0.7, loop: true, duckGame: true };
function myMusicEl() {
if (!MyMusic.audio) {
const a = new Audio();
a.preload = "auto";
a.addEventListener("ended", function () {
if (MyMusic.list.length <= 1 && !MyMusic.loop) return;
myMusicNext();
});
a.addEventListener("error", function () { toast("这首放不了（格式可能不被支持）。"); });
MyMusic.audio = a;
}
return MyMusic.audio;
}
function myMusicPlay(i) {
if (!MyMusic.list.length) { toast("还没有添加音乐。"); return; }
const n = MyMusic.list.length;
MyMusic.idx = ((i % n) + n) % n;
const t = MyMusic.list[MyMusic.idx];
const a = myMusicEl();
try {
a.src = t.url;
a.volume = MyMusic.volume;
a.loop = MyMusic.loop && n === 1;
const pr = a.play();
if (pr && pr.catch) pr.catch(function () {});
} catch (e) { toast("播放失败：" + (e && e.message ? e.message : e)); }
if (MyMusic.duckGame && window.HengAudio && window.HengAudio.stop) {
try { window.HengAudio.stop(); } catch (e) {}
}
myMusicRender();
}
function myMusicToggle() {
const a = myMusicEl();
if (!MyMusic.list.length) { toast("先添加音乐文件。"); return; }
if (a.paused) myMusicPlay(MyMusic.idx < 0 ? 0 : MyMusic.idx);
else { a.pause(); myMusicRender(); }
}
function myMusicNext() { myMusicPlay(MyMusic.idx + 1); }
function myMusicPrev() { myMusicPlay(MyMusic.idx - 1); }
function myMusicStop() {
const a = myMusicEl();
try { a.pause(); a.currentTime = 0; } catch (e) {}
myMusicRender();
}
function myMusicRelease() {
myMusicStop();
if (window.HengAudio) {
try {
if (typeof UI !== "undefined" && UI && UI.screen && window.HengAudio.forScreen) {
window.HengAudio.forScreen(UI.screen);
}
} catch (e) {}
}
}
function myMusicAdd(files) {
const arr = Array.from(files || []);
if (!arr.length) return;
let ok = 0, bad = 0;
arr.forEach(function (f) {
try {
const url = URL.createObjectURL(f);
MyMusic.list.push({ name: f.name || ("音乐 " + (MyMusic.list.length + 1)), url: url, size: f.size || 0 });
ok++;
} catch (e) { bad++; }
});
toast("已添加 " + ok + " 首" + (bad ? "（" + bad + " 首失败）" : ""));
if (MyMusic.idx < 0 && MyMusic.list.length) myMusicPlay(0);
else myMusicRender();
}
function myMusicClear() {
if (!MyMusic.list.length) { toast("列表是空的。"); return; }
askConfirm("清空音乐", "移除全部 " + MyMusic.list.length + " 首自定音乐？", "清 空", function () {
try { MyMusic.list.forEach(function (t) { URL.revokeObjectURL(t.url); }); } catch (e) {}
MyMusic.list = []; MyMusic.idx = -1;
myMusicRelease();
openMyMusic();
}, true);
}
function fmtSize(n) {
if (!n) return "";
if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
return (n / 1024 / 1024).toFixed(1) + " MB";
}
function openMyMusic() {
const a = myMusicEl();
const playing = !a.paused && MyMusic.idx >= 0;
let html = "<p style='color:var(--muted)'>把你自己想听的音乐（.mp4 / .mp3 / .m4a / .ogg 等）加进来，边听边玩。" +
"<b>文件不会上传</b>，只在你手机上播放。</p>";
html += "<p><input type='file' id='myMusicPick' accept='audio/*,video/*,.mp3,.mp4,.m4a,.ogg,.wav,.flac' multiple " +
"style='display:none'><button class='btn btn-primary' data-mm='add'>＋ 添 加 音 乐</button> " +
(MyMusic.list.length ? "<button class='btn btn-tiny' data-mm='clear'>清空列表</button>" : "") + "</p>";
if (!MyMusic.list.length) {
html += "<p class='muted'>还没有音乐。点上面的按钮选文件（可多选）。</p>";
} else {
const cur = MyMusic.list[MyMusic.idx];
html += "<div class='stat-grid'>" + box("当前", cur ? cur.name : "—") +
box("列表", MyMusic.list.length + " 首") + box("状态", playing ? "播放中" : "已暂停") + "</div>";
html += "<p><button class='btn btn-tiny' data-mm='prev'>上 一 首</button> " +
"<button class='btn btn-primary' data-mm='toggle'>" + (playing ? "暂 停" : "播 放") + "</button> " +
"<button class='btn btn-tiny' data-mm='next'>下 一 首</button> " +
"<button class='btn btn-tiny' data-mm='stop'>停 止</button></p>";
html += "<div class='set-row'><span>音量</span><input type='range' id='mmVol' min='0' max='100' value='" +
Math.round(MyMusic.volume * 100) + "'></div>";
html += "<div class='set-row'><span>单曲循环</span><button class='btn btn-tiny " +
(MyMusic.loop ? "btn-primary" : "") + "' data-mm='loop'>" + (MyMusic.loop ? "开" : "关") + "</button></div>";
html += "<div class='set-row'><span>播放时停掉游戏 BGM</span><button class='btn btn-tiny " +
(MyMusic.duckGame ? "btn-primary" : "") + "' data-mm='duck'>" + (MyMusic.duckGame ? "开" : "关") + "</button></div>";
html += "<h4>播放列表</h4><div class='codex-grid'>";
MyMusic.list.forEach(function (t, i) {
const on = (i === MyMusic.idx);
html += "<div class='codex-card" + (on ? " hot" : "") + "'>" +
"<div class='cc-name'>" + (on ? "\u266a " : "") + t.name + "</div>" +
"<div class='cc-sub'>" + fmtSize(t.size) + "</div>" +
"<div class='cc-sub'>" + (on ? "<span style='color:var(--gold2)'>当前</span>"
: "<button class='btn btn-tiny' data-mmplay='" + i + "'>播 放</button>") + "</div></div>";
});
html += "</div>";
html += "<p style='color:var(--muted);font-size:12px;margin-top:10px'>" +
"刷新页面后列表会清空，需要重新添加——音乐只在你这次游玩期间保留。</p>";
}
openModal("自定音乐", html);
const pick = document.getElementById("myMusicPick");
$$("#modalBody [data-mm]").forEach(function (b) {
b.onclick = function () {
const act = b.getAttribute("data-mm");
if (act === "add") { if (pick) pick.click(); return; }
if (act === "toggle") return myMusicToggle();
if (act === "next") return myMusicNext();
if (act === "prev") return myMusicPrev();
if (act === "stop") { myMusicStop(); return openMyMusic(); }
if (act === "clear") return myMusicClear();
if (act === "loop") { MyMusic.loop = !MyMusic.loop; return openMyMusic(); }
if (act === "duck") { MyMusic.duckGame = !MyMusic.duckGame; return openMyMusic(); }
};
});
if (pick) {
pick.onchange = function () { myMusicAdd(pick.files); pick.value = ""; openMyMusic(); };
}
$$("#modalBody [data-mmplay]").forEach(function (b) {
b.onclick = function () { myMusicPlay(parseInt(b.getAttribute("data-mmplay"), 10) || 0); };
});
const vs = document.getElementById("mmVol");
if (vs) {
vs.oninput = function () {
MyMusic.volume = Math.max(0, Math.min(1, (parseInt(vs.value, 10) || 0) / 100));
try { myMusicEl().volume = MyMusic.volume; } catch (e) {}
};
}
}
function myMusicRender() {
try {
if (el("modal") && el("modal").classList && el("modal").classList.contains("on")) openMyMusic();
} catch (e) {}
}

const ACTIVITIES = {
perm: [
{
id: "duel", icon: "🦗", name: "斗蛐蛐",
sub: "押注 · 拼点",
desc: "赌坊的老规矩：两只蛐蛐丢进斗盆，谁的点大谁赢。\n看准了押，功勋翻着涨。",
open: function () { openDuel(); }
}
],
dated: [
{
id: "commissions", icon: "📜", name: "委托",
sub: "每日刷新",
desc: "今天有今天的活。明天太阳升起来，又是一批新的。",
resetLabel: "距刷新",
open: function () { openCommissions(); }
}
]
};
function activityById(id) {
const all = ACTIVITIES.perm.concat(ACTIVITIES.dated);
for (let i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
return null;
}

const TITLE_GROUPS = {
"title-archive": {
title: "档案",
note: "你的记录、厅堂与没走完的支线。",
items: [
{ act: "slots", label: "存 档" },
{ act: "arena", label: "无 垠 厅" },
{ act: "quests", label: "支 线 委 托" },
{ act: "codex", label: "典 藏 室" }
]
},
"title-about": {
title: "关于",
note: "这座组织是什么，以及是谁把它写出来的。",
items: [
{ act: "about", label: "关 于 组 织" },
{ act: "credits", label: "创 作 者 名 单" }
]
}
};
function openTitleGroup(key) {
const grp = TITLE_GROUPS[key];
if (!grp) return;
let html = "<p style='color:var(--muted)'>" + tr(grp.note) + "</p>";
html += "<div class='title-panel-grid'>";
grp.items.forEach(function (it) {
html += "<button class='btn btn-ghost' data-act='" + it.act + "'>" + tr(it.label) + "</button>";
});
html += "</div>";
openModal(tr(grp.title), html);
}
function openActivities() {
const dated = ACTIVITIES.dated || [];
let html = "<p style='color:var(--muted)'>" + tr("游戏里能反复打的东西都收在这里。") +
tr("随时可玩；") + tr("按天刷新，注意倒计时。") + "</p>";

html += "<h4>" + tr("常驻活动") + "</h4>";
if (!ACTIVITIES.perm.length) {
html += "<p class='muted'>" + tr("暂时还没有常驻活动。") + "</p>";
} else {
html += "<div class='codex-grid'>";
ACTIVITIES.perm.forEach(function (a) {
html += "<div class='codex-card' data-actgo='" + a.id + "'>" +
"<div class='cc-name'>" + a.icon + " " + a.name + "</div>" +
"<div class='cc-sub'>" + tr(a.sub) + "</div>" +
"<div class='cc-sub' style='color:var(--muted);white-space:pre-line'>" + tr(a.desc) + "</div>" +
"<div class='cc-sub'><button class='btn btn-tiny btn-primary' data-actgo='" + a.id + "'>" + tr("进 入") + "</button></div>" +
"</div>";
});
html += "</div>";
}

html += "<h4 style='margin-top:14px'>" + tr("日期活动") + "</h4>";
if (!dated.length) {
html += "<p class='muted'>" + tr("当前没有进行中的限时活动。有新的会出现在这里。") + "</p>";
} else {
const left = msUntilReset();
html += "<div class='codex-grid'>";
dated.forEach(function (a) {
html += "<div class='codex-card' data-actgo='" + a.id + "'>" +
"<div class='cc-name'>" + a.icon + " " + a.name + "</div>" +
"<div class='cc-sub'>" + tr(a.sub) + "</div>" +
"<div class='cc-sub' style='color:var(--muted);white-space:pre-line'>" + tr(a.desc) + "</div>" +
"<div class='cc-sub'>" + tr(a.resetLabel || "距刷新") + " " +
"<span style='color:var(--gold2)' data-resettimer>" + fmtDur(left) + "</span></div>" +
"<div class='cc-sub'><button class='btn btn-tiny btn-primary' data-actgo='" + a.id + "'>" + tr("进 入") + "</button></div>" +
"</div>";
});
html += "</div>";
}
openModal("活动", html);

$$("#modalBody [data-actgo]").forEach(function (b) {
b.onclick = function (ev) {
if (ev && ev.stopPropagation) ev.stopPropagation();
const a = activityById(b.getAttribute("data-actgo"));
if (!a) return;
closeModal();
try { a.open(); } catch (e) { toast("打不开：" + (e && e.message ? e.message : e)); }
};
});

if (dated.length) {
try {
if (window.__hengActTimer) clearInterval(window.__hengActTimer);
window.__hengActTimer = setInterval(function () {
const host = el("modal");
if (!host || !host.classList || !host.classList.contains("on")) {
clearInterval(window.__hengActTimer); window.__hengActTimer = null; return;
}

const t = document.querySelectorAll("#modalBody [data-resettimer]");
if (t && t.length) {
const v = fmtDur(msUntilReset());
for (let i = 0; i < t.length; i++) t[i].textContent = v;
}
}, 1000);
} catch (e) {}
}
}
function openSettings() {
const on = (b) => (b ? "开" : "关");
const musicOn = !(S && S.music === false);
const sfxOn = !(S && S.sfx === false);
const sp = (S && S.textSpeed !== undefined) ? S.textSpeed : 26;
const spLabel = sp === 0 ? "瞬显" : (sp <= 12 ? "快" : (sp <= 26 ? "中" : "慢"));
const html =
"<p style='color:var(--muted)'>设置面板。音乐、音效、存档与退出都收在这里。</p>" +
"<h4>语言 / Language</h4>" +
"<div class='set-row'><span>界面与内容语言</span></div>" +
"<div class='set-row set-btns'>" +
DATA.langCodes.map((c) =>
"<button class='btn btn-tiny" + (curLang() === c ? " btn-primary" : "") +
"' data-lang='" + c + "'>" + DATA.langNames[c] + "</button>").join("") +
"</div>" +
"<h4>音频</h4>" +
"<div class='set-row'><span>自定音乐</span>" +
"<button class='btn btn-tiny" + (MyMusic.list.length ? " btn-primary" : "") +
"' data-set='mymusic'>" +
(MyMusic.list.length ? ("已加 " + MyMusic.list.length + " 首") : "添 加 音 乐") + "</button></div>" +
"<div class='set-row'><span>背景音乐</span>" +
"<button class='btn btn-tiny " + (musicOn ? "btn-primary" : "") + "' data-set='music'>" + on(musicOn) + "</button></div>" +
"<div class='set-row'><span>音效</span>" +
"<button class='btn btn-tiny " + (sfxOn ? "btn-primary" : "") + "' data-set='sfx'>" + on(sfxOn) + "</button></div>" +
"<div class='set-row'><span>音乐音量</span><input type='range' id='setVolMusic' min='0' max='100' value='" +
Math.round(((S && S.musicVol !== undefined) ? S.musicVol : 0.7) * 100) + "'></div>" +
"<div class='set-row'><span>音效音量</span><input type='range' id='setVolSfx' min='0' max='100' value='" +
Math.round(((S && S.sfxVol !== undefined) ? S.sfxVol : 0.8) * 100) + "'></div>" +
"<h4>文字</h4>" +
"<div class='set-row'><span>对话速度（当前：" + spLabel + "）</span></div>" +
"<div class='set-row set-btns'>" +
[["40","慢"],["26","中"],["12","快"],["0","瞬显"]].map((x) =>
"<button class='btn btn-tiny" + (String(sp) === x[0] ? " btn-primary" : "") +
"' data-speed='" + x[0] + "'>" + x[1] + "</button>").join("") +
"</div>" +
"<h4>数据</h4>" +
"<div class='set-row'><span>存档位</span><button class='btn btn-tiny btn-primary' data-set='slots'>打开存档位</button></div>" +
"<div class='set-row set-btns'>" +
"<button class='btn btn-tiny' data-set='export'>导出存档</button>" +
"<button class='btn btn-tiny' data-set='import'>导入存档</button>" +
"</div>" +
"<h4>离开</h4>" +
"<div class='set-row set-btns'>" +
"<button class='btn btn-tiny' data-set='title'>返回标题</button>" +
"<button class='btn btn-tiny' data-set='quit'>退出游戏</button>" +
"</div>";
openModal("设置", html);
$$("#modalBody [data-lang]").forEach((b) => {
b.onclick = () => {
const c = b.getAttribute("data-lang");
if (c === curLang()) { toast("已经是" + (c === "en" ? "英文" : "中文") + "了。"); return; }
setLang(c);
};
});
const bind = (k, fn) => { const b = document.querySelector("[data-set='" + k + "']"); if (b) b.onclick = fn; };
bind("music", () => {
if (S) S.music = (S.music === false);
saveGame(true);
const dock = document.getElementById("dockMusic");
if (dock) dock.classList.toggle("off", S && S.music === false);
if (S && S.music === false && window.HengAudio) window.HengAudio.stop();
else if (window.HengAudio) window.HengAudio.forScreen((typeof UI !== "undefined" && UI.screen) || "map");
openSettings();
});
bind("sfx", () => {
if (S) S.sfx = (S.sfx === false);
saveGame(true);
const dock = document.getElementById("dockSfx");
if (dock) dock.classList.toggle("off", S && S.sfx === false);
openSettings();
});
bind("slots", () => openSaveSlots());
bind("mymusic", () => openMyMusic());
bind("export", () => exportSave());
bind("import", () => importSave());
bind("title", () => {
askConfirm("返回标题", "返回标题界面？<br>当前进度已保存。", "返 回", () => {
saveGame(true);
closeModal();
toTitle();
});
});
bind("quit", () => quitGame());
const vm = document.getElementById("setVolMusic");
if (vm) vm.oninput = function () {
if (S) S.musicVol = this.value / 100;
if (window.HengAudio) window.HengAudio.setVolume("music", this.value / 100);
const d = document.getElementById("volMusic"); if (d) d.value = this.value;
saveGame(true);
};
const vs = document.getElementById("setVolSfx");
if (vs) vs.oninput = function () {
if (S) S.sfxVol = this.value / 100;
if (window.HengAudio) window.HengAudio.setVolume("sfx", this.value / 100);
const d = document.getElementById("volSfx"); if (d) d.value = this.value;
saveGame(true);
};
$$("#modalBody [data-lang]").forEach((b) => {
b.onclick = () => {
const c = b.getAttribute("data-lang");
if (c === curLang()) return;
setLang(c);
openSettings();
};
});
$$("#modalBody [data-speed]").forEach((b) => {
b.onclick = () => {
setTextSpeed(b.getAttribute("data-speed"));
openSettings();
};
});
}
function diffRank(id) { return { normal:0, hard:1, true:2 }[id] || 0; }
function canRestartTo(id) {
if (!S) return false;
const cur = diffIdRaw();
if (id === cur) return false;
if (diffRank(id) <= diffRank(cur)) return false;
if (id === "hard" && !S.hardUnlocked) return false;
if (id === "true" && !S.trueUnlocked) return false;
return true;
}
function nextRestartTier() {
if (!S) return null;
const cur = diffIdRaw();
if (cur === "normal" && S.hardUnlocked) return "hard";
if (cur === "hard" && S.trueUnlocked) return "true";
return null;
}
function doRestartTo(id, nm) {
S.difficulty = id;
S.chapters = {};
S.chapterIndex = 0;
S.stage = 0;
S.unlocked = Math.max(1, Math.min(S.unlocked || 1, DATA.chapters.length));
if (S.dev) S.unlocked = DATA.chapters.length;
UI.selectedChapter = 0;
saveGame(true);
closeModal();
renderMap();
show("map");
toast("已重启主线到【" + nm + "】，从第一传重新开始。");
}
function switchDifficulty(id, force) {
if (!DATA.difficulties[id]) return;
const cur = diffIdRaw();
if (id === cur) { toast("已经是这个难度了。"); return; }
if (diffRank(id) < diffRank(cur)) {
toast("难度不能回退 —— 选了【" + DATA.difficulties[cur].name + "】就只能往前走。");
return;
}
if (id === "hard" && !S.hardUnlocked) { toast("困难还没解锁。"); return; }
if (id === "true" && !S.trueUnlocked) { toast("真实还没解锁。"); return; }
const nm = DATA.difficulties[id].name;
if (force) {
doRestartTo(id, nm);
return;
}
askConfirm("重启主线",
"重启到【" + nm + "】？<br><br>· 主线会从第一传第一幕重新开始<br>· 等级、功勋、队友、兵装、招募到的角色都会保留<br>· 关卡进度清零<br><br><b style='color:var(--bad)'>注意：这是不可逆的。重启后回不到更低的难度。</b>",
"重 启 到 【" + nm + "】",
function () {
doRestartTo(id, nm);
}, true);
}
function quitGame() {
if (isApp()) {
if (!confirm("退出游戏？进度已保存，下次可以从存档位继续。")) return;
saveGame(true);
try { if (window.HengAudio) window.HengAudio.stop(); } catch (e) {}
try { window.HengApp.quit(); return; } catch (e) {}
toTitle();
return;
}
if (!confirm("浏览器里没法真正关闭程序。\n\n要回到标题界面吗？进度已保存。")) return;
saveGame(true);
try { if (window.HengAudio) window.HengAudio.stop(); } catch (e) {}
toTitle();
toast("已回到标题界面。浏览器版无法自动关闭窗口。");
}
window.HengApp_onBack = function () {
try {
const m = el("modal");
if (m && m.classList && m.classList.contains("on")) { closeModal(); return 1; }
if (typeof UI !== "undefined" && UI.screen === "title") return 0; 
if (UI.screen === "battle") { return 1; } 
toTitle();
return 1;
} catch (e) { return 0; }
};
let askState = null;
function askConfirm(title, text, okLabel, fn, danger) {
askState = { fn: fn, restore: null };
openModal(title,
"<p style='line-height:1.8'>" + String(text).replace(/\n/g, "<br>") + "</p>" +
"<div class='set-row set-btns' style='margin-top:14px'>" +
"<button class='btn " + (danger ? "btn-danger" : "btn-primary") + "' data-ask='yes'>" +
(okLabel || "确 定") + "</button>" +
"<button class='btn btn-ghost' data-ask='no'>取 消</button>" +
"</div>");
const yes = document.querySelector("#modalBody [data-ask='yes']");
const no = document.querySelector("#modalBody [data-ask='no']");
if (yes) yes.onclick = function () {
const f = askState ? askState.fn : null;
askState = null;
closeModal();
if (f) { try { f(); } catch (e) {} }
};
if (no) no.onclick = function () { askState = null; closeModal(); };
}
function openSaveSlots() {
const list = slotList();
const act = activeSlot();
const rows = list.map((s) => {
const m = s.meta;
const isAct = String(act) === s.key;
return "<div class='slot" + (s.has ? "" : " empty") + (isAct ? " act" : "") + "'>" +
"<div class='slot-no'>" + s.key + " 号位" + (isAct ? "　<span class='slot-tag'>当前</span>" : "") + "</div>" +
(s.has
? "<div class='slot-main'><span class='slot-name'>" + m.name + "</span>" +
"<span class='slot-lv'>Lv." + m.level + "</span></div>" +
"<div class='slot-time'>" + fmtTime(m.at) + "</div>" +
"<div class='slot-sub'>" + (DATA.chapters[m.chapter] ? DATA.chapters[m.chapter].no : "—") +
"　·　" + (DATA.difficulties[m.difficulty] ? DATA.difficulties[m.difficulty].name : "通常") +
"　·　功勋 " + (m.honor || 0) + "</div>" +
"<div class='slot-act'>" +
"<button class='btn btn-tiny btn-primary' data-load='" + s.key + "'>读 取</button>" +
"<button class='btn btn-tiny' data-save='" + s.key + "'>覆 盖</button>" +
"<button class='btn btn-tiny btn-ghost' data-del='" + s.key + "'>删 除</button>" +
"</div>"
: "<div class='slot-main'><span class='slot-name muted'>空</span></div>" +
"<div class='slot-time'>—</div>" +
"<div class='slot-act'>" +
"<button class='btn btn-tiny btn-primary' data-save='" + s.key + "'>存 到 此 位</button>" +
"</div>") +
"</div>";
}).join("");
openModal("存档位",
"<div class='slot-head'>" +
"<span style='color:var(--muted)'>共 " + SLOT_COUNT + " 个存档位。每条记录显示<b class='k'>存档时间</b>、<b class='k'>角色姓名</b>与 <b class='k'>Lv 等级</b>。</span>" +
"<button class='btn btn-tiny warn-btn' id='saveWarn' title='存档注意事项'>❗ 注意事项</button>" +
"</div>" +
"<div class='slot-grid'>" + rows + "</div>" +
"<div class='set-row set-btns' style='margin-top:14px'>" +
"<button class='btn btn-tiny' data-set='export'>导出当前存档</button>" +
"<button class='btn btn-tiny' data-set='import'>导入存档</button>" +
"<button class='btn btn-tiny btn-ghost' data-set='close'>关 闭</button>" +
"</div>");
const warn = document.getElementById("saveWarn");
if (warn) warn.onclick = () => openSaveNotes();
$$("#modalBody [data-load]").forEach((b) => { b.onclick = () => loadSlotAndContinue(b.getAttribute("data-load")); });
$$("#modalBody [data-save]").forEach((b) => { b.onclick = () => {
saveToSlot(b.getAttribute("data-save"), false);
openSaveSlots();
}; });
$$("#modalBody [data-del]").forEach((b) => { b.onclick = () => {
const k = b.getAttribute("data-del");
askConfirm("删除存档", "删除 " + k + " 号位的存档？<br>此操作不可恢复。", "删 除", () => {
deleteSlot(k);
toast("已删除 " + k + " 号位");
openSaveSlots();
}, true);
}; });
const ex = document.querySelector("#modalBody [data-set='export']");
if (ex) ex.onclick = () => exportSave();
const im = document.querySelector("#modalBody [data-set='import']");
if (im) im.onclick = () => importSave();
const cl = document.querySelector("#modalBody [data-set='close']");
if (cl) cl.onclick = () => closeModal();
}
function loadSlotAndContinue(key) {
const raw = loadFromSlot(key);
if (!raw) { toast("该存档位是空的。"); return; }
askConfirm("读取存档", "读取 " + key + " 号位？<br>当前未保存的进度会丢失。", "读 取", () => {
doLoadSlot(key);
});
}
function doLoadSlot(key) {
const raw = loadFromSlot(key);
if (!raw) { toast("该存档位是空的。"); return; }
try {
setActiveSlot(key);
const loaded = applyLoadedSave(raw);
if (!loaded) throw new Error("存档内容无效");
S = loaded;
saveGame(true);
closeModal();
renderMap();
show("map");
toast("已读取 " + key + " 号位 · " + (S.name || "") + " Lv." + (S.level || 1));
} catch (e) {
toast("读取失败：" + (e && e.message ? e.message : "存档可能已损坏"));
if (S) { try { renderMap(); } catch (e2) {} }
}
}
function openSaveNotes() {
openModal("存档注意事项",
"<p><b class='k'>1. 桌面版（浏览器）</b><br>" +
"存档存在浏览器本地。只要<b>不清理浏览器数据</b>、不用无痕模式、不换浏览器，删掉游戏文件夹再重新下载，存档<b>仍然保留</b>——因为它跟的是「来源地址 + 浏览器」，不是游戏文件。</p>" +
"<p style='color:var(--bad)'>但如果游戏文件夹换了位置（盘符或路径变化），浏览器会把它当成另一个来源，旧存档就读不到了。</p>" +
"<p><b class='k'>2. 手机版（APK）</b><br>" +
"存档存在应用数据目录里。<b>卸载应用会把存档一起删掉</b>，重装不会自动恢复。（部分安卓系统开启「自动备份」时可能恢复，但不能指望。）</p>" +
"<p><b class='k'>3. 最可靠的办法：导出</b><br>" +
"在存档位面板点 <b>导出存档</b>，会复制一段文本。把它存到备忘录 / 网盘 / 聊天记录里。换设备或重装后点 <b>导入存档</b> 粘贴回来即可。</p>" +
"<p style='color:var(--muted)'>建议：每个存档位单独导出一次，按「姓名 + 日期」命名保存。</p>");
}
function exportSave() {
const payload = {
v: 1,
game: "永序锋魂",
at: Date.now(),
active: activeSlot(),
meta: slotMeta(),
slots: slotData()
};
const txt = JSON.stringify(payload);
let b64 = "";
try { b64 = btoa(unescape(encodeURIComponent(txt))); } catch (e) { b64 = txt; }
const box = document.createElement("textarea");
box.value = b64;
openModal("导出存档",
"<p>下面这段文本就是你的全部存档（所有存档位）。<b class='k'>复制它</b>并保存到备忘录、网盘或聊天记录里。</p>" +
"<p style='color:var(--muted)'>换设备或重装后，用「导入存档」把它粘贴回来。</p>" +
"<div class='stat-grid'>" +
box0("存档位", Object.keys(slotData()).length) +
box0("大小", Math.round(b64.length / 1024) + " KB") +
box0("导出时间", fmtTime(payload.at)) +
"</div>");
const host = document.getElementById("modalBody");
if (host) {
const ta = document.createElement("textarea");
ta.className = "export-box";
ta.value = b64;
ta.readOnly = false;
host.appendChild(ta);
const row = document.createElement("div");
row.className = "set-row set-btns";
row.style.marginTop = "12px";
row.innerHTML = "<button class='btn btn-tiny btn-primary' id='copySave'>复 制</button>" +
"<button class='btn btn-tiny btn-ghost' id='closeSave'>关 闭</button>";
host.appendChild(row);
const cp = document.getElementById("copySave");
if (cp) cp.onclick = () => {
ta.select();
let ok = false;
try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
if (!ok && navigator.clipboard) {
navigator.clipboard.writeText(b64).then(() => toast("已复制到剪贴板")).catch(() => toast("请手动长按选择复制"));
return;
}
toast(ok ? "已复制到剪贴板" : "请手动长按选择复制");
};
const cs = document.getElementById("closeSave");
if (cs) cs.onclick = () => closeModal();
}
}
function box0(label, val) {
return "<div class='stat-box'><div class='s-name'>" + label + "</div><div class='s-val'>" + val + "</div></div>";
}
function importSave() {
openModal("导入存档",
"<p>把导出的那段文本粘贴到下面，点「导入」。</p>" +
"<p style='color:var(--bad)'>注意：导入会<b>覆盖</b>你现有的全部存档位。</p>");
const host = document.getElementById("modalBody");
if (!host) return;
const ta = document.createElement("textarea");
ta.className = "export-box";
ta.placeholder = "在此粘贴存档文本…";
host.appendChild(ta);
const row = document.createElement("div");
row.className = "set-row set-btns";
row.style.marginTop = "12px";
row.innerHTML = "<button class='btn btn-tiny btn-primary' id='doImport'>导 入</button>" +
"<button class='btn btn-tiny btn-ghost' id='cancelImport'>取 消</button>";
host.appendChild(row);
const di = document.getElementById("doImport");
if (di) di.onclick = () => {
const raw = (ta.value || "").trim();
if (!raw) { toast("请先粘贴存档文本。"); return; }
let txt = raw;
if (raw.charAt(0) !== "{") {
try { txt = decodeURIComponent(escape(atob(raw))); } catch (e) { txt = raw; }
}
let obj = null;
try { obj = JSON.parse(txt); } catch (e) { toast("这段文本不是有效的存档。"); return; }
if (obj && obj.slots) obj = obj.slots;
if (!obj || typeof obj !== "object") { toast("存档内容无法识别。"); return; }
const data = {}, meta = {};
Object.keys(obj).forEach((k) => {
if (!/^\d+$/.test(k)) return;
data[k] = obj[k];
meta[k] = metaOf(obj[k]);
});
if (!Object.keys(data).length) { toast("里面没有可用的存档位。"); return; }
writeJSON(SLOTS_KEY, data);
writeJSON(SLOTS_META, meta);
setActiveSlot(String(Object.keys(data)[0]));
toast("导入成功：" + Object.keys(data).length + " 个存档位");
openSaveSlots();
};
const ci = document.getElementById("cancelImport");
if (ci) ci.onclick = () => closeModal();
}
function normalizeAllyJobs() {
if (!S || !S.allies) return;
(S.allies || []).forEach(function (a) {
if (!a.job) a.job = weaponJob(a.weaponId) || randomJob();
if (!weaponUsableBy(a.weaponId, a.job)) {
a.weaponId = (DATA.jobDefaultWeapon && DATA.jobDefaultWeapon[a.job]) || "fist_bare";
if (S.weaponOf && S.weaponOf[a.id] && !weaponUsableBy(S.weaponOf[a.id], a.job)) {
delete S.weaponOf[a.id];
}
}
});
}
function applyLoadedSave(st) {
const keep = S;
if (st) S = st;
if (!S) { S = keep; return null; }
normalizeAllyJobs();
if (!S.spent) S.spent = { atk:0, def:0, spd:0, will:0, hpBonus:0 };
if (!S.allied) S.allied = {};
if (!S.allies) { S.allies = starterAllies(); S.squad = [S.allies[0].id]; invalidateAllyIndex(); }
if (!S.squad) S.squad = (S.allies[0] ? [S.allies[0].id] : []);
try { syncHero(); } catch (e) {}
if (S.spActive) {
S.spActive = false;

}
try { normalizeSquad(); } catch (e) {}
if (!S.weapons) S.weapons = [];
if (!S.weaponOf) S.weaponOf = {};
if (!S.bag) S.bag = {};
if (S.honor === undefined) S.honor = 1200;
if (!S.pulls) S.pulls = 0;
if (S.dev) S.unlocked = DATA.chapters.length;
if (!S.animSpeed) S.animSpeed = "fast";
if (!S.bossWins) S.bossWins = {};
if (!S.bossBest) S.bossBest = {};
if (S.music === undefined) S.music = true;
if (S.sfx === undefined) S.sfx = true;
if (S.textSpeed === undefined) S.textSpeed = 26;
if (S.tutDone === undefined) S.tutDone = false;
if (!S.quests) S.quests = {};
if (!S.mats) S.mats = {};
if (!S.questCounters) S.questCounters = { battles:0, kills:0, killsByTag:{}, bossWins:0, arenaWins:0, fullHp:0 };
if (!S.difficulty) S.difficulty = "normal";
if (!S.assistSeen) S.assistSeen = {};
if (!S.arenaCleared) S.arenaCleared = {};
if (!S.commissionClaimed) S.commissionClaimed = {};
if (!S.chapters) S.chapters = {};
equipList();
const out = S;
return out;
}
function everLineage() {
return (DATA.ever || []).map((e, i) => ({ e: e, idx: i }));
}
function openTimeline() {
const rows = everLineage().map((x) => {
const e = x.e;
const power = (e.power && e.power !== "？") ? e.power : "—";
const age = e.becomeAge || "—";
return '<div class="tl-row">' +
'<span class="tl-no">' + e.no + "</span>" +
'<span class="tl-name">' + e.name + "</span>" +
'<span class="tl-age">' + age + "</span>" +
'<span class="tl-power">实力 ' + power + "</span>" +
"</div>" +
(e.becomeNote ? '<div class="tl-note">' + e.becomeNote + "</div>" : "");
}).join('<div class="tl-gap">· · ·　世　代　之　间　· · ·</div>');
openModal("恒永者年表",
"<p style='color:var(--muted)'>表上写的是<b class='k'>就任时的年龄</b>。除了第三任以外，每一任都是按这个年龄就任的。</p>" +
"<h4>世代层级</h4>" +
"<p>恒永者不是同时代的人。第四任在二十岁就任的时候，第五任还没有出生——" +
"等到第五任就任时，第四任已经活了不知道多少岁月。</p>" +
"<p>所以这本册子是<b class='k'>一层压一层</b>的：越往后翻，前面的那些人都还在，只是已经老得不能用年龄来算了。" +
"第三任是唯一的例外——他不按这条规律走。</p>" +
"<div class='tl-wrap'>" + rows + "</div>" +
"<p style='color:var(--muted);margin-top:14px'>注：源设定里各任的出生年份大多没有写全，" +
"所以世代之间的<b>具体间隔年数无法计算</b>。这里只保留能确证的部分——就任年龄与先后顺序。</p>");
}
function refreshDifficultyButton() {
const b = document.querySelector('[data-act="difficulty"]');
if (!b) return;
const showIt = !!(S && (S.gameCleared || S.hardUnlocked || S.trueUnlocked));
b.style.display = showIt ? "" : "none";
if (showIt) b.textContent = "难度·" + diffConf().name;
}
function renderQuestStrip() {
const host = el("questStrip");
if (!host || !S) return;
S.quests = S.quests || {};
refreshQuests(false);
const tracked = DATA.sideQuests.filter((q) => {
const st = questState(q.id);
return st === "done" || st === "active";
}).slice(0, 4);
if (!tracked.length) {
host.innerHTML = '<span class="qs-title">支 线</span>' +
'<span class="qs-none">暂无进行中的支线 —— 上方菜单点「支线」承接委托。</span>';
return;
}
const rows = tracked.map((q) => {
const p = questProgress(q);
const pct = Math.min(100, Math.round(p.have / p.need * 100));
const done = p.have >= p.need;
return '<div class="qs-row">' +
'<div class="qs-head"><span class="qs-name">' + q.name + "</span>" +
'<span class="qs-num">' + (done ? "可交付 ✔" : p.have + " / " + p.need) + "</span></div>" +
'<div class="qbar"><i style="width:' + pct + '%"></i></div></div>';
}).join("");
host.innerHTML = '<span class="qs-title">支 线</span><div class="qs-items">' + rows + "</div>";
}
function renderHud() {
const bs = baseStats(S);
el("hudGlyph").textContent = S.name.slice(0, 1);
el("hudName").textContent = S.name;
el("hudRank").textContent = currentRank();
el("hudStats").innerHTML =
'<span class="lv">Lv.<b>' + S.level + "</b></span>" +
'<span class="diff-tag d-' + diffId() + '">' + diffConf().short + "</span>" +
(strictNoSkip() ? '<span class="strict-tag" title="本难度下失败不能推进，只能重打或暂时撤离去练级">◆ 不可跳关</span>' : "") +
"<span>生命 <b>" + Math.round(S.hp) + "/" + bs.hp + "</b></span>" +
"<span>力量 <b>" + bs.atk + "</b></span>" +
"<span>防御 <b>" + bs.def + "</b></span>" +
"<span>速度 <b>" + bs.spd + "</b></span>" +
"<span>意志 <b>" + bs.will + "</b></span>" +
"<span>经验 <b>" + Math.floor(S.exp) + "/" + expNeeded(S.level) + "</b></span>" +
"<span>功勋 <b>" + (S.honor || 0) + "</b></span>" +
"<span>编队 <b>" + ((S.squad || []).length) + "/" + squadCap() + "</b></span>" +
"<span>成员 <b>" + ((S.allies || []).length) + "</b></span>" +
(S.points ? '<span style="color:var(--gold2)">潜能点 <b>' + S.points + "</b></span>" : "") +
(devOn() ? '<span style="color:#ffd76b">开发模式 <button class="btn btn-tiny" data-act="dev" style="margin-left:6px">DEV</button></span>' : "") +
'<span><button class="btn btn-tiny" data-act="speed">演出：' + (S.animSpeed === "slow" ? "慢" : S.animSpeed === "fast" ? "快" : "标准") + "</button></span>";
}
function enterChapter() {
const i = UI.selectedChapter;
const ch = DATA.chapters[i];
const cs = chapterState(i);
const isFinal = i >= DATA.chapters.length - 1;
if (cs.stages >= ch.stages.length) {
if (cs.done) {
if (isFinal) { replayChapter(i); return; }
toast("这一传已经走完了。");
return;
}
finishChapter(i); return;
}
S.replay = false;
S.chapterIndex = i; S.stage = cs.stages;
startStage();
}
function replayChapter(i) {
const cs = chapterState(i);
S.replay = true;
S.replaySaved = { stages: cs.stages, done: cs.done, chapterIndex: S.chapterIndex, stage: S.stage };
cs.stages = 0;
cs.done = false;
S.chapterIndex = i;
S.stage = 0;
saveGame(true);
startStage();
toast("重看终局 · 不会影响你的进度");
}
function finishChapter(i) {
const ch = DATA.chapters[i];
if (S && S.replay) {
const rs = S.replaySaved || {};
const cs2 = chapterState(i);
cs2.stages = rs.stages === undefined ? ch.stages.length : rs.stages;
cs2.done = rs.done === undefined ? true : rs.done;
if (rs.chapterIndex !== undefined) S.chapterIndex = rs.chapterIndex;
if (rs.stage !== undefined) S.stage = rs.stage;
S.replay = false;
S.replaySaved = null;
saveGame(true);
renderMap();
show("map");
toast("重看结束。进度没有被改动。");
return;
}
chapterState(i).done = true;
if ((S.unlocked || 1) < i + 2) S.unlocked = Math.min(i + 2, DATA.chapters.length);
const ever = DATA.ever.find((e) => e.id === ch.key);
let allyLine = "";
if (ever) {
S.allied = S.allied || {};
if (!S.allied[ever.id]) {
S.allied[ever.id] = true;
allyLine = "<h4>结缘</h4><p class='k'>" + ever.no + " · " + ever.name + "</p><p>" +
ever.summon.name + "：" + ever.summon.text + "</p>" +
(S.summonId ? "" : "<p style='color:var(--gold2)'>你还没有择定本命结缘者。前往「队伍」面板选定一位，即可在战斗中唤其「降神」。</p>");
}
}
if (i >= DATA.chapters.length - 1) {
const wasCleared = !!S.gameCleared;
const clearedOn = diffId();
onGameCleared();
if (!wasCleared) {
setTimeout(() => {
openModal("通 关 · 恒",
"<p>你走完了十二传。从第一任「恒」到第十一任「茫」，以及与 [X] 战队的那一笔旧账。</p>" +
"<p style='color:var(--gold2)'>通关难度：" + DATA.difficulties[clearedOn].name + "</p>" +
"<h4>新的路</h4>" +
"<p>地图页出现了 <b>难度</b> 按钮，现在就可以切过去。</p>" +
"<p>" + (clearedOn === "normal"
? "【困难】已解锁 —— 敌人生命 +55%、攻击等级 +22%、防御 +12%；经验 +45%、功勋 +60%。"
: (clearedOn === "hard"
? "【真实】已解锁 —— 敌人生命 ×2.2、攻击等级 +45%、防御 +28%；经验 ×2.1、功勋 ×2.4。"
: "你已经在真实难度上把它打完了。"))
+ "</p><p style='color:var(--muted)'>难度只影响之后新进入的战斗，可以随时切回通常。</p>");
}, 400);
}
}
saveGame(true);
const next = DATA.chapters[i + 1];
openModal("传记完成 · " + ch.no + " " + ch.name,
"<p>" + ch.name + " 的一生已载入组织档案。</p>" +
(next ? "<p style='color:var(--ok)'>新的一传已解锁：" + next.no + " · " + next.name + "</p>" : "") +
(ch.unlock ? "<h4>题记</h4><p class='k'>" + ch.unlock + "</p>" : "") +
allyLine +
"<p style='color:var(--dim)'>返回列传地图继续。</p>");
renderMap();
}
function startStage() {
const ch = DATA.chapters[S.chapterIndex];
const st = ch.stages[S.stage];
queue = [];
show("story");
if (st.type === "story") { buildStoryQueue(st); nextStory(); }
else { queue = [{ kind:"battleIntro", stage: st }]; nextStory(); }
}
function buildStoryQueue(st) {
queue = [];
(st.lines || []).forEach((l) => queue.push({ kind:"line", sp:l.sp, text: tr(l.text) }));
if (st.choices && st.choices.length) queue.push({ kind:"choice", choices: st.choices, after: st.after || [] });
else {
if (st.after && st.after.length) {
queue.push({ kind:"award", award: st.award, afterCount: st.after.length });
st.after.forEach((l) => queue.push({ kind:"line", sp:l.sp, text: tr(l.text) }));
} else queue.push({ kind:"award", award: st.award });
}
}
function storyHead() {
const ch = DATA.chapters[S.chapterIndex];
el("storyChLabel").textContent = ch.no + " · " + ch.name;
el("storyProgress").textContent = "第 " + (S.stage + 1) + " / " + ch.stages.length + " 幕";
}
function setNext(label, fn) {
const wrap = el("storyNext");
wrap.innerHTML = "";
if (!label) return;
const b = document.createElement("button");
b.className = "btn btn-primary";
b.textContent = label;
b.onclick = fn;
wrap.appendChild(b);
}
function nextStory() {
if (!queue.length) return renderStoryEnd();
const item = queue.shift();
if (item.kind === "line") return renderLine(item);
if (item.kind === "choice") return renderChoice(item);
if (item.kind === "award") return renderAward(item);
if (item.kind === "battleIntro") return renderBattleIntro(item.stage);
}
function revealStoryText(node, text, onDone) {
setNext(null);
if (advanceHint) advanceHint.textContent = "点击任意处可加速显示";
if (window.HengFx && window.HengFx.writeText) {
try { window.HengFx.writeText(node, text, onDone); return; } catch (e) {}
}
node.textContent = text;
if (onDone) onDone();
}
function renderLine(item) {
storyHead();
el("storyGlyph").textContent = item.sp ? item.sp.slice(0, 1) : DATA.chapters[S.chapterIndex].enemy.glyph;
el("storySpeaker").textContent = item.sp || "";
const t = el("storyText");
t.className = "story-text" + (item.sp ? "" : " narr");
t.style.animation = "none"; void t.offsetWidth; t.style.animation = "fadeUp .32s";
el("choiceList").innerHTML = "";
revealStoryText(t, item.text, function () {
setNext("继 续", () => {
if (queue.length) nextStory();
else renderStoryEnd();
});
if (advanceHint) advanceHint.textContent = "点击任意处可加速显示";
});
}
function renderChoice(item) {
storyHead();
el("storyGlyph").textContent = "择";
el("storySpeaker").textContent = "抉择";
const t = el("storyText");
t.className = "story-text"; t.textContent = "你会怎么做？";
setNext(null);
const cl = el("choiceList");
cl.innerHTML = "";
item.choices.forEach((c) => {
const b = document.createElement("button");
b.className = "choice-btn";
b.textContent = tr(c.label);
b.onclick = () => {
const lines = [];
if (c.flag) { S.flags = S.flags || {}; S.flags[c.flag] = true; }
applyAward(c.award, lines);
cl.innerHTML = "";
const t2 = el("storyText");
t2.className = "story-text narr";
revealStoryText(t2, (tr(c.result) || "") + (lines.length ? "\n\n" + lines.map((l) => l[1]).join("\n") : ""));
setNext("继 续", () => {
item.after.forEach((l) => queue.unshift({ kind:"line", sp:l.sp, text: tr(l.text) }));
nextStory();
});
saveGame(true);
};
cl.appendChild(b);
});
}
function renderAward(item) {
storyHead();
const lines = [];
applyAward(item.award || {}, lines);
el("storyGlyph").textContent = "記";
el("storySpeaker").textContent = "传记";
const t = el("storyText");
t.className = "story-text narr";
t.textContent = lines.length ? lines.map((l) => l[1]).join("\n") : "……";
el("choiceList").innerHTML = "";
setNext("继 续", () => nextStory());
saveGame(true);
}
function renderBattleIntro(stage) {
storyHead();
const ch = DATA.chapters[S.chapterIndex];
el("storyProgress").textContent = "遭遇 · 战斗";
el("storyGlyph").textContent = ch.enemy.glyph;
el("storySpeaker").textContent = "遭遇";
prepStage(stage);
const t = el("storyText");
t.className = "story-text";
t.textContent = "【" + tr(stage.title) + "】\n\n" + tr(stage.intro || "") +
"\n\n敌方：" + (stage.enemyKeys || [stage.enemy]).map((k) => DATA.enemies[k].name).join("、");
el("choiceList").innerHTML = "";
setNext("进 入 战 斗", () => startBattle(stage));
}
function renderStoryEnd() {
const ch = DATA.chapters[S.chapterIndex];
const cs = chapterState(S.chapterIndex);
cs.stages = Math.max(cs.stages, S.stage + 1);
S.stage = cs.stages;
saveGame(true);
el("storyNext").innerHTML = "";
el("choiceList").innerHTML = "";
if (cs.stages >= ch.stages.length) { renderMap(); show("map"); finishChapter(S.chapterIndex); return; }
renderMap();
show("map");
openModal("这一幕已结束",
"<p>当前进度：第 " + cs.stages + " / " + ch.stages.length + " 幕。</p>" +
"<p style='color:var(--muted)'>返回列传地图可继续推进。</p>");
}
function prepStage(stage) {
if (stage.enemyKeys) return stage;
const base = DATA.enemies[stage.enemy];
if (!base) return stage;
const squad = Math.max(1, (S.squad || []).length);
const keys = [stage.enemy];
const weak = base.hp > 1500;
const crowd = !weak && squad >= 2 && base.hp < 700 && Math.random() < 0.5;
if (crowd) {
for (let i = 1; i < squad; i++) keys.push(stage.enemy);
stage.enemyHp = 0.68; stage.enemyAtk = 0.84;
} else if (weak) {
stage.enemyHp = 0.70;
} else if (squad >= 3) {
stage.enemyHp = 0.92;
}
stage.enemyKeys = keys;
const dc = diffConf();
stage.enemyHp = (stage.enemyHp || 1) * (dc.hp || 1);
stage.enemyAtk = (stage.enemyAtk || 1) * (dc.atk || 1);
stage.enemyDef = dc.def || 1;
return stage;
}
function battleInfo() {
if (!B) return null;
return {
round: B.round, over: B.over, locked: B.locked, phase: B.phase,
enemyAlive: B.enemies.filter(function (e) { return e.alive; }).length,
enemyHp: B.enemies.map(function (e) { return Math.round(e.hp) + "/" + e.maxHp; }),
allyAlive: B.units.filter(function (u) { return u.alive; }).length,
allyHp: B.units.map(function (u) { return Math.round(u.hp); })
};
}
try { window.battleInfo = battleInfo; } catch (e) {}
const SP_MIN = -45, SP_MAX = 45;
const PANIC_AT = -30;
const CLASH_CAP = 99;
function spHeads(sp) { return clamp(0.5 + sp * 0.01, 0.05, 0.95); }
function flipCoins(n, sp) {
const p = spHeads(sp);
let heads = 0;
const marks = [];
for (let i = 0; i < n; i++) {
const h = Math.random() < p;
if (h) heads++;
marks.push(h);
}
return { heads: heads, marks: marks };
}
function safeNum(v, d) { return (typeof v === "number" && isFinite(v)) ? v : (d || 0); }
function coinDamage(atkUnit, defUnit, skill, coinsLeft, clashWins) {
const atkLv = safeNum(atkUnit.atkLevel, 6) + minPow(skill);
const dLv = safeNum(defUnit && defUnit.defLevel, 3);
const coinPow = Math.max(1, Math.round((atkLv - dLv * 0.18) * 0.80 * (atkUnit && atkUnit.isPlayer ? 1.8 : 1)));
let per = coinPow * (skill.mult || 1) * effAtkMult(atkUnit);
if (skill.kind === "true") per *= 1.22;
let dmg = per * Math.max(1, coinsLeft) * (defUnit && defUnit.isPlayer ? 0.78 : 1);
dmg *= (1 + Math.max(0, clashWins || 0) * 0.03);
dmg *= rnd(0.94, 1.06);
const shield = safeNum(defUnit && defUnit.shield, 0);
if (shield > 0) {
const absorbed = Math.min(shield, dmg);
dmg -= absorbed;
}
if (dmg > 0) dmg = dmg - dLv * 0.12;
const floor = Math.max(1, Math.round(atkLv * 0.75));
dmg = Math.max(floor, dmg);
if (!isFinite(dmg)) dmg = floor;
return dmg;
}
function minPow(skill) { return (skill.atkBonus || 0); }
function effAtkMult(u) {
let m = 1;
u.buffs.forEach((b) => { if (b.stat === "atk" && b.mult) m *= b.mult; });
return m;
}
function effSpd(u) {
let m = 1;
u.buffs.forEach((b) => { if (b.stat === "spd" && b.mult) m *= b.mult; });
return Math.max(1, Math.round(u.speed * m));
}
function makeUnit(o) {
o = o || {};
const w = o.weapon || null;
const u = {
uid: o.uid, side: o.side, name: o.name, glyph: o.glyph || o.name.slice(0, 1),
maxHp: o.maxHp, hp: o.hp === undefined ? o.maxHp : o.hp,
atkLevel: o.atkLevel, defLevel: o.defLevel, speed: o.speed,
sp: o.sp === undefined ? 20 : o.sp,
weapon: w, abilities: o.abilities || ["basic"], coins: o.coins || 4,
coinBonus: 0, shield: 0, buffs: [], cds: {}, panic: false,
isPlayer: !!o.isPlayer, ally: o.ally || null,
intent: null, action: null, alive: true,
color: o.color || null, rarity: o.rarity || "common"
};
u.coins = Math.min(8, u.coins + (w ? (w.coinCount || 0) : 0));
u.atkLevel = Math.max(1, Math.round(safeNum(u.atkLevel, 6)));
u.defLevel = Math.max(1, Math.round(safeNum(u.defLevel, 3)));
u.maxHp = Math.max(1, Math.round(safeNum(u.maxHp, 100)));
u.hp = Math.max(0, Math.round(safeNum(u.hp, u.maxHp)));
u.speed = Math.max(1, Math.round(safeNum(u.speed, 6)));
u.sp = Math.max(SP_MIN, Math.min(SP_MAX, Math.round(safeNum(u.sp, 20))));
if (!u.moves) {
if (u.side === "enemy") {
u.moves = (o.movePool && o.movePool.length) ? o.movePool :
["m_jab", "m_hook", "m_kick", "m_slash", "m_shot"];
} else {
u.moves = (window.HengCombo && window.HengCombo.unitMoves)
? window.HengCombo.unitMoves(u) : ["m_jab", "m_kick", "m_guard", "m_dodge"];
}
}
if (!u.chain) u.chain = [];
return u;
}
const SCHOOL_ABIL = {
"剑": ["sword_still", "sword_guard"],
"弓": ["bow_return", "bow_early"],
"刃": ["blade_vein", "blade_silent"],
"枪": ["spear_line", "spear_pierce"],
"斧": ["axe_break", "axe_quake"],
"拳": ["fist", "broken_shell"],
"腿": ["kick"],
"通用": ["kick", "fist"]
};
function allyAbilities(ally, w) {
if (ally.loadout && ally.loadout.length) return ally.loadout.slice();
const set = SCHOOL_ABIL[(w && w.school) || "通用"] || SCHOOL_ABIL["通用"];
const pool = set.slice();
if ((ally.tier === "elite" || ally.tier === "relic" || ally.tier === "eternal") && pool.indexOf("blood_bat") < 0) pool.push("blood_bat");
if (ally.tier === "relic" || ally.tier === "eternal") pool.push("heart_mirror");
if (ally.tier === "eternal") pool.push("finality");
return pool;
}
function playerUnitFor(ally) {
const w = wpOf((S.weaponOf || {})[ally.id] || ally.weaponId);
const lv = ally.level || 1;
const st = allyStats(ally);
const base = st.hp;
const atk = st.atk;
const def = st.def;
const spd = st.spd;
return makeUnit({
uid: "ally_" + ally.id, side: "ally", name: ally.name, glyph: ally.glyph || ally.name.slice(0, 1),
maxHp: base,
hp: (typeof ally.hp !== "number" || !isFinite(ally.hp) || ally.hp <= 0) ? base : Math.min(ally.hp, base),
atkLevel: atk, defLevel: def, speed: spd,
sp: ally.sp === undefined ? 20 : ally.sp,
weapon: w, abilities: allyAbilities(ally, w),
coins: st.coins, isPlayer: true, ally: ally, color: ally.color, rarity: ally.rarity,
});
}
let BAL = { enemyHp: 1, enemyAtk: 1, playerHp: 1, playerAtk: 1, enemyDef: 1 };
function hpWeight(baseHp) {
const h = baseHp || 90;
if (h <= 1500) return 1;
return Math.pow(1500 / h, 0.45);
}
function enemyUnitFor(key, idx, scaleMul, hpMul, atkMul) {
const e = DATA.enemies[key];
const lv = S.level;
const hp = Math.round(e.hp * hpWeight(e.hp) * (0.55 + lv * 0.048) * (hpMul || 1) * (scaleMul || 1) * BAL.enemyHp);
const atkLv = Math.max(2, Math.round(e.atk * (0.72 + lv * 0.074) * (atkMul || 1) * (scaleMul || 1) * 1.05 * BAL.enemyAtk));
const styleMap = {
slash: ["m_jab", "m_slash", "m_chop", "m_hook"],
pierce: ["m_thrust", "m_pierce", "m_stab", "m_silent"],
crit: ["m_stab", "m_silent", "m_spinkick", "m_hook"],
true: ["m_rule", "m_star", "m_still", "m_pierce"],
drain: ["m_hook", "m_stab", "m_chop"],
healself: ["m_guard", "m_bulwark", "m_jab"]
};
const eSkills = (e.skills || []).map((k) => DATA.coinSkill[k]).filter(Boolean);
const spec = (DATA.enemyPools || {})[key];
let pool = (spec && spec.pool && spec.pool.length) ? spec.pool.slice()
: ((DATA.enemyPoolDefault && DATA.enemyPoolDefault.length) ? DATA.enemyPoolDefault.slice() : null);
if (!pool) {
pool = [];
eSkills.forEach((sk) => { (styleMap[sk.kind] || styleMap.slash).forEach((mm) => { if (pool.indexOf(mm) < 0) pool.push(mm); }); });
if (!pool.length) pool.push("m_jab", "m_hook", "m_guard");
if ((e.skills || []).some((k) => (DATA.coinSkill[k] || {}).aoe)) pool.push("m_quake");
}
pool = pool.filter((m) => DATA.moves[m] || (DATA.enemyMoves || {})[m]);
if (!pool.length) pool = ["m_jab", "m_guard"];
const eDmgMul = (spec && spec.dmg) || 1;
return makeUnit({
movePool: pool,
dmgMul: eDmgMul,
uid: "enemy_" + idx, side: "enemy", name: e.name + (idx > 0 ? " " + (idx + 1) : ""), glyph: e.glyph,
maxHp: hp, atkLevel: atkLv,
defLevel: Math.max(2, Math.round((4 + S.level * 1.05) * ((B && B.stage && B.stage.enemyDef) || 1) * BAL.enemyDef)),
speed: e.spd, sp: 15, coins: 4,
abilities: eSkills.length ? eSkills.map((c) => c.name) : ["撕咬"]
});
}
function enemyCoinSkills(def) {
const e = DATA.enemies[def.enemy] || def;
const ks = (e.skills || ["claw"]).map((k) => DATA.coinSkill[k]).filter(Boolean);
return ks.length ? ks : [DATA.coinSkill.claw];
}
function abilityToCoin(id) {
const a = DATA.abilities[id];
if (!a) return null;
return {
id: id, name: a.name, kind: a.kind, base: a.base || 7, coin: a.coin || 2,
coins: a.coins || 3, mult: a.mult || 1.0, desc: a.desc, school: a.school,
cost: a.cost || 0, cd: a.cd || 0, heal: a.heal, shield: a.shield, powerShield: a.powerShield,
baseShield: a.baseShield, buff: a.buff, debuff: a.debuff, selfCost: a.selfCost,
bleed: a.bleedMult, bleedTurns: a.bleedTurns, powerHeal: a.powerHeal, instant: a.instant,
atkBonus: a.atkBonus || 0, target: a.target || (a.kind === "healself" || a.kind === "cleanse" ? "self" : "enemy")
};
}
function startBattle(stage) {
const spOverride = Array.isArray(stage.squadOverride) ? stage.squadOverride : null;
const bad = squadLegality(spOverride, spOverride ? SP_SQUAD_CAP : null);
if (bad) {
toast(bad);
if (!spOverride) { try { if (typeof openSquad === "function") openSquad(); } catch (e) {} }
return false;
}
const squad = squadUnits(spOverride);
if (!squad.length) { toast("编队是空的。先到「编队」里安排上场成员。"); return false; }
B = {
stage: stage, round: 0, phase: "assign", over: false, locked: false,
units: [], enemies: [], enemyDefs: {}, sel: 0, selSkill: 0, log: [],
arena: !!stage.arena, arenaTier: stage.arenaTier, scripted: false
};
squad.forEach((u) => B.units.push(u));
S.unitsHp = S.unitsHp || {};
const keys = stage.enemyKeys || [stage.enemy];
keys.forEach((k, i) => {
const u = enemyUnitFor(k, i, stage.enemyScale || 1, stage.enemyHp || 1, stage.enemyAtk || 1);
B.enemies.push(u);
B.enemyDefs[u.uid] = { enemy: k };
});
const assistList = injectAssists(stage);
el("btlTitle").textContent = stage.title + " ｜ " + B.enemies.map((e) => e.name).join("、") +
(assistList.length ? "　＋援助 " + assistList.map((u) => u.name).join("、") : "") +
(isNormalDiff() ? "" : "　【" + diffConf().name + "】");
el("battleLog").innerHTML = "";
el("floatZone").innerHTML = "";
show("battle");
logLine("l-sys", "【" + stage.title + "】");
if (stage.intro) logLine("l-act", tr(stage.intro));
const note = DATA.enemies[keys[0]] && DATA.enemies[keys[0]].note;
if (note) logLine("l-boss", note);
if (assistList.length) assistBanner(assistList);
logLine("l-sys", "招式联合规则：把最多 " + ((DATA.combo && DATA.combo.maxMoves) || 4) +
" 个招式串成一击。首招必中；之后每一招的成功率由「与上一招的适配度」决定——" +
"同类招式（拳→腿、拳→剑）衔接顺畅，近战接远程会大幅掉率。任何一招失手，连段立即中断。");
const ev = DATA.ever.find((x) => x.id === S.summonId);
if (ev) logLine("l-boss", "本命结缘：" + ev.summon.name + " 已就绪（全队增益 + 单体降神一击）。");
beginRound();
}
function beginRound() {
if (B.over) return;
B.round++;
el("btlTurn").textContent = "回合 " + B.round;
B.phase = "assign";
B.units.concat(B.enemies).forEach((u) => {
if (!u.alive) return;
if (u.isPlayer) u.sp = clamp(u.sp + 2, SP_MIN, SP_MAX);
tickUnitBuffs(u);
Object.keys(u.cds).forEach((k) => { if (u.cds[k] > 0) u.cds[k]--; });
if (u.sp <= PANIC_AT) {
if (!u.panic) { u.panic = true; logLine("l-dead", u.name + " 理智跌破 " + PANIC_AT + "，陷入【恐慌】——本回合脱手。"); }
} else u.panic = false;
});
rollEnemyIntents();
B.units.forEach((u) => {
if (!u.isPlayer) return;
u.action = null;
u.chain = [];
const live = B.enemies.filter((e) => e.alive);
if (live.length) u.actionTarget = live[0].uid;
});
B.sel = Math.max(0, B.units.findIndex((u) => u.isPlayer && u.alive && !u.assist));
renderBattle();
logLine("l-sys", "—— 第 " + B.round + " 回合 · 编成阶段。为每名成员拼一条连段并指定目标。");
}
function rollEnemyIntents() {
B.enemies.forEach((e, i) => {
if (!e.alive) { e.intent = null; return; }
const list = enemyCoinSkills(B.enemyDefs[e.uid]);
const sk = list[Math.floor(Math.random() * list.length)];
const targets = B.units.filter((u) => u.alive && u.hp > 0);
const tgt = targets.length ? targets[Math.floor(Math.random() * targets.length)] : null;
e.intent = { skill: sk, targetUid: tgt ? tgt.uid : null, targetName: tgt ? tgt.name : "—" };
if (i === 0 && DATA.enemies[B.enemyDefs[e.uid].enemy]) {
const ph = DATA.enemies[B.enemyDefs[e.uid].enemy].phases;
if (ph && ph[0] && !B.phaseShown) { }
}
});
}
function autoComboFor(u) {
const C = window.HengCombo;
if (!C) return ["m_jab"];
const ids = C.unitMoves(u);
if (!ids.length) return ["m_jab"];
const hpRatio = u.hp / u.maxHp;
const isGuard = (id) => { const m = C.move(id); return m && m.power === 0; };
const atk = ids.filter((id) => !isGuard(id));
const grd = ids.filter(isGuard);
const max = (DATA.combo && DATA.combo.maxMoves) || 4;
let chain = [];
if (u.isPlayer && hpRatio < 0.4 && grd.length) chain.push(grd[Math.floor(Math.random() * grd.length)]);
const pool = atk.length ? atk : ids;
const n = Math.min(max, 2 + (Math.random() < 0.45 ? 1 : 0));
while (chain.length < n) {
const prev = chain.length ? chain[chain.length - 1] : null;
let best = null, bestScore = -1;
for (let k = 0; k < 6; k++) {
const cand = pool[Math.floor(Math.random() * pool.length)];
if (chain.indexOf(cand) >= 0 && pool.length > 2) continue; 
const aff = prev ? C.affinity(C.mtype(prev), C.mtype(cand)) : 0.85;
const score = aff + Math.random() * 0.3;
if (score > bestScore) { bestScore = score; best = cand; }
}
if (!best) best = pool[Math.floor(Math.random() * pool.length)];
if (!best) break;
if (!prev && C.move(best).power === 0 && atk.length) best = atk[0];
chain.push(best);
}
return chain;
}
function selectUnit(uid) {
const raw = String(uid || "");
let i = B.units.findIndex((u) => u.uid === raw);
if (i < 0) {
const bare = bareUid(raw);
i = B.units.findIndex((u) => u.uid === bare);
}
if (i < 0) return;
if (B.units[i].assist) { toast("援助角色由剧情操控，你无法指挥他。"); return; }
B.sel = i;
renderBattle();
}
function bareUid(idOrUid) {
let v = String(idOrUid || "");
if (v.indexOf("enemy_") === 0) v = v.slice(6);
else if (v.indexOf("ally_") === 0) v = v.slice(5);
return v;
}
function assignTarget(uid) {
const u = B.units[B.sel];
if (!u || !u.alive) return;
const raw = String(uid || "");
const bare = bareUid(raw);
const tgt = B.enemies.find((e) => e.uid === raw || e.uid === bare);
if (!tgt || !tgt.alive) { toast("目标已经倒下了。"); return; }
u.actionTarget = tgt.uid;
logLine("l-act", u.name + " 的目标 → " + tgt.name);
renderBattle();
saveGame(true);
}
function autoAssignAll() {
B.units.forEach((u) => {
if (!u.isPlayer || !u.alive || u.assist) return;
u.chain = autoComboFor(u);
const live = B.enemies.filter((e) => e.alive);
if (!u.actionTarget && live.length) u.actionTarget = live[0].uid;
});
logLine("l-sys", "已自动为全部成员串好连段。");
renderBattle();
}
function animScale() {
return (S && S.animSpeed === "slow") ? 1 : (S && S.animSpeed === "fast" ? 0.45 : 0.65);
}
function delay(ms) {
return new Promise((resolve) => {
if (typeof setTimeout === "function" && !setTimeout.__mock) setTimeout(resolve, ms || 0);
else if (typeof flushTimers === "function") { flushTimers(); resolve(); }
else resolve();
});
}
function clashLog(allyU, enemyU, allySkill, enemySkill) {
let ac = Math.max(1, allySkill.coins || 3);
let ec = Math.max(1, enemySkill.coins || 3);
const log = [];
let wins = 0, losses = 0, ties = 0, rounds = 0;
while (ac > 0 && ec > 0 && rounds < CLASH_CAP) {
rounds++;
const aHeads = flipCoins(ac, allyU.sp).heads;
const eHeads = flipCoins(ec, enemyU.sp).heads;
const aBase = (allySkill.base || 6) + allyU.atkLevel;
const eBase = (enemySkill.base || 6) + enemyU.atkLevel;
const ap = Math.max(1, aBase + aHeads * (Math.max(1, (allySkill.coin || 0) + (allyU.coinBonus || 0))));
const ep = Math.max(1, eBase + eHeads * (Math.max(1, (enemySkill.coin || 0) + (enemyU.coinBonus || 0))));
let broke = null;
if (ap > ep) { ec--; wins++; broke = "enemy"; }
else if (ep > ap) { ac--; losses++; broke = "ally"; }
else ties++;
log.push({ round: rounds, allyPow: ap, enemyPow: ep, allyHeads: aHeads, enemyHeads: eHeads,
allyCoins: ac, enemyCoins: ec, broke: broke });
}
const winner = ac > 0 && ec <= 0 ? "ally" : (ac <= 0 && ec > 0 ? "enemy" : (ac > 0 ? "ally" : "draw"));
return { winner: winner, allyCoins: ac, enemyCoins: ec, wins: wins, losses: losses,
ties: ties, rounds: rounds, log: log,
marks: [{ a: log[0] ? log[0].allyHeads : 0, e: log[0] ? log[0].enemyHeads : 0 }] };
}
function clash(a, b, as, es) { return clashLog(a, b, as, es); }
function ccCoinRow(count, heads) {
let html = "";
for (let i = 0; i < count; i++) html += '<span class="cc-coin ' + (i < heads ? "h" : "t") + '"></span>';
return html;
}
function ccShatter(node, index) {
if (!node) return;
const coins = node.children;
const idx = coins.length - 1 - index;
const c = coins[idx] || coins[coins.length - 1];
if (c && c.classList) { c.classList.add("shatter"); c.classList.remove("h", "t"); }
}
function showClashCenter(u, e, sk, eSk, round) {
const box = el("clashCenter");
if (box) box.classList.add("on");
try { window.__clashSeen = (window.__clashSeen || 0) + 1; } catch (e) {}
if (el("ccLeftName")) el("ccLeftName").textContent = u.name;
if (el("ccRightName")) el("ccRightName").textContent = e.name;
if (el("ccLeftSkill")) el("ccLeftSkill").innerHTML = sk.name + ' <span class="b">' + (sk.base || 0) + "+" + (sk.coins || 1) + "×" + (sk.coin || 0) + "</span>";
if (el("ccRightSkill")) el("ccRightSkill").innerHTML = eSk.name + ' <span class="b">' + (eSk.base || 0) + "+" + (eSk.coins || 1) + "×" + (eSk.coin || 0) + "</span>";
}
function hideClashCenter() {
const box = el("clashCenter");
if (!box) return;
box.classList.remove("on");
["ccLeftCoins", "ccRightCoins"].forEach((id) => { const n = el(id); if (n) n.innerHTML = ""; });
["ccLeftPow", "ccRightPow"].forEach((id) => { const n = el(id); if (n) n.textContent = "0"; });
const v = el("ccVerdict"); if (v) { v.textContent = ""; v.classList.remove("on", "lose"); }
const m = el("ccVs"); if (m) m.classList.remove("win", "lose");
}
async function runClash(u, e, sk, eSk) {
const res = clashLog(u, e, sk, eSk);
showClashCenter(u, e, sk, eSk, 0);
let destroyedAlly = 0, destroyedEnemy = 0;
for (let i = 0; i < res.log.length; i++) {
const st = res.log[i];
const lc = el("ccLeftCoins"), rc = el("ccRightCoins");
if (lc) { lc.innerHTML = ccCoinRow(st.allyCoins, st.allyHeads); }
if (rc) { rc.innerHTML = ccCoinRow(st.enemyCoins, st.enemyHeads); }
if (el("ccLeftPow")) el("ccLeftPow").textContent = st.allyPow;
if (el("ccRightPow")) el("ccRightPow").textContent = st.enemyPow;
if (el("ccRound")) el("ccRound").textContent = "拼点 " + st.round + " / " + res.log.length;
const lside = lc && lc.parentNode, rside = rc && rc.parentNode;
if (lside && lside.classList) { lside.classList.toggle("winning", st.allyPow > st.enemyPow); lside.classList.toggle("losing", st.allyPow < st.enemyPow); }
if (rside && rside.classList) { rside.classList.toggle("winning", st.enemyPow > st.allyPow); rside.classList.toggle("losing", st.enemyPow < st.allyPow); }
const m = el("ccVs");
if (m) { m.classList.toggle("win", st.allyPow > st.enemyPow); m.classList.toggle("lose", st.enemyPow > st.allyPow); }
await delay((i === 0 ? 300 : 165) * animScale());
if (st.broke === "enemy") { ccShatter(rc, destroyedEnemy++); await delay(140 * animScale()); }
else if (st.broke === "ally") { ccShatter(lc, destroyedAlly++); await delay(140 * animScale()); }
else { if (el("ccRound")) el("ccRound").textContent = "平手 · 双方各留一枚"; await delay(110 * animScale()); }
for (let k = 0; k < res.log.length; k++) { break; }
}
const v = el("ccVerdict");
if (v) {
try { window.__clashVerdict = (window.__clashVerdict || 0) + 1; window.__clashLastWinner = res.winner; } catch (e) {}
v.textContent = res.winner === "ally" ? "拼 点 胜 利" : res.winner === "enemy" ? "拼 点 失 败" : "不 分 胜 负";
v.classList.add("on");
if (res.winner === "enemy") v.classList.add("lose");
}
await delay(520 * animScale());
hideClashCenter();
return res;
}
function applyHp(target, amount, label) {
let dmg = safeNum(amount, 0);
if (target && target.dodgeReady) {
const cut = dmg * target.dodgeReady;
dmg -= cut;
target.dodgeReady = 0;
try { logLine("l-sys", "　" + target.name + " 闪避，抵消 " + Math.round(cut) + " 点伤害。"); } catch (e) {}
}
if (target.shield > 0 && dmg > 0 && !target.__shieldHandled) {
const a = Math.min(target.shield, dmg);
target.shield -= a; dmg -= a;
}
target.hp = Math.max(0, target.hp - dmg);
floatNum(target.side === "enemy" ? "enemy" : "ally_" + target.uid, "-" + Math.round(amount), "");
return amount;
}
function targetNodeOf(u) {
return u.side === "enemy" ? "enemy_" + u.uid : "ally_" + u.uid;
}
function enemySide0(u) { return u && u.side === "enemy"; }
async function resolveComboAction(u, a, enemySide) {
const C = window.HengCombo;
if (!C) return { skip: true };
const foeList = enemySide ? B.units : B.enemies;
let tgt = foeList.find((x) => x.uid === a.targetUid && x.alive) || foeList.find((x) => x.alive);
if (!tgt) return { skip: true };
const res = C.resolve(u, a.chain, tgt, enemySide);
logLine("l-act", "【联合】" + u.name + " → " + a.chain.map((id) => (C.move(id) || {}).name).join(" ⇢ ") +
"　目标：" + tgt.name);
let total = 0;
for (let i = 0; i < res.steps.length; i++) {
const st = res.steps[i];
await delay(150 * (typeof animScale === "function" ? animScale() : 1));
if (!st.ok) {
logLine("l-dead", "　" + (i + 1) + ". 【" + st.name + "】成功率 " + st.pct + "% ｜ 掷出 " + st.roll +
" → 失手，连段中断。");
break;
}
const m = C.move(st.id);
if (m && m.power > 0) {
let dmg = C.damage(u, m, tgt, enemySide);
dmg *= res.bonus || 1;
if (u.dmgMul && u.side === "enemy") dmg *= u.dmgMul;
playMoveFx(tgt.uid, m, "hit");
const wasCrit = !!(m.crit && Math.random() < m.crit);
if (wasCrit) dmg *= 1.35;
let hitDmg = dmg;
if (m.multi && m.multi > 1) {
for (let k = 1; k < m.multi; k++) {
hitDmg += dmg * 0.85;
playMoveFx(tgt.uid, m, "hit");
}
}
total += applyHp(tgt, hitDmg, "");
hitFeedback(tgt.uid, hitDmg, wasCrit);
logLine("l-hit", "　" + (i + 1) + ". 【" + st.name + "】（" + st.type + "）成功率 " + st.pct +
"% ｜ 掷出 " + st.roll + " → 命中 " + Math.round(hitDmg) + " 点" +
(m.multi && m.multi > 1 ? "（" + m.multi + " 段）" : "") + "。（适配 " +
(st.affPct === null ? "—" : st.affPct + "%") + "）");
if (m.aoe) {
foeList.forEach((e) => { if (e.alive && e.uid !== tgt.uid) applyHp(e, C.damage(u, m, e, enemySide) * 0.6, ""); });
logLine("l-hit", "　　（范围波及其余目标）");
}
} else {
logLine("l-heal", "　" + (i + 1) + ". 【" + st.name + "】" + (st.note || "生效") + "。");
}
}
if (res.shield) {
const cap = u.maxHp * 0.18;
const amt = Math.max(0, Math.min(u.maxHp * res.shield, cap - u.shield));
u.shield += amt;
if (amt > 0) { floatNum(targetNodeOf(u), "+" + Math.round(amt), "heal"); logLine("l-heal", "　护盾 +" + Math.round(amt) + "。"); }
}
if (res.dodge) {
u.dodgeReady = res.dodge;
logLine("l-heal", "　进入闪避姿态（受到下次攻击时抵消 " + Math.round(res.dodge * 100) + "%）。");
}
const lastMove = res.steps.length ? C.move(res.steps[res.steps.length - 1].id) : null;
if (lastMove && lastMove.weak) { tgt.weakNext = 1; logLine("l-sys", "　" + tgt.name + " 下一击命中率下降。"); }
if (res.landed >= 2) logLine("l-crit", "　连段成立：命中 " + res.landed + " 招，伤害 ×" + (res.bonus || 1).toFixed(2) + "。");
if (total > 0) floatNum(targetNodeOf(tgt), "-" + Math.round(total), res.landed >= 3 ? "crit" : "");
u.sp = clamp(u.sp + res.landed * 2, SP_MIN, SP_MAX);
return res;
}
async function resolveActionAsync(act) {
const u = B.units.find((x) => x.uid === act.uid) || B.enemies.find((x) => x.uid === act.uid);
if (!u || !u.alive) return null;
const a = u.action;
if (!a || a.kind === "panic") {
if (u.panic) logLine("l-dead", u.name + " 因恐慌无法行动。");
return { skip: true };
}
if (a.chain && a.chain.length) {
return await resolveComboAction(u, a, enemySide0(u));
}
const sk = a.skill;
if (sk.target === "self" || sk.kind === "healself" || sk.kind === "shieldself" ||
sk.kind === "cleanse" || sk.kind === "buff") {
applySkillEffect(u, sk, null);
return { self: true };
}
const enemySide = u.side === "enemy";
const foeList = enemySide ? B.units : B.enemies;
let tgt = foeList.find((x) => x.uid === a.targetUid && x.alive) || foeList.find((x) => x.alive);
if (enemySide && u.intent && u.intent.targetUid) {
const it = B.units.find((x) => x.uid === u.intent.targetUid && x.alive);
if (it) tgt = it;
}
if (!tgt) return { skip: true };
let eSkill;
if (enemySide) {
eSkill = abilityToCoin((tgt.action && tgt.action.skillId) || (tgt.abilities[0] || "basic")) ||
abilityToCoin("basic");
} else {
eSkill = (tgt.intent && tgt.intent.skill) || enemyCoinSkills(B.enemyDefs[tgt.uid])[0];
}
const res = await runClash(u, tgt, sk, eSkill);
let clashWins = 0;
if (res.winner === "ally") clashWins = res.wins;
else if (res.winner === "enemy") clashWins = res.losses;
if (res.winner === "ally") {
u.sp = clamp(u.sp + 3, SP_MIN, SP_MAX);
tgt.sp = clamp(tgt.sp - 3, SP_MIN, SP_MAX);
} else if (res.winner === "enemy") {
u.sp = clamp(u.sp - 3, SP_MIN, SP_MAX);
tgt.sp = clamp(tgt.sp + 3, SP_MIN, SP_MAX);
}
try { window.__acts2 = (window.__acts2 || []); window.__acts2.push(u.name + "/" + sk.name + " vs " + tgt.name + " => " + res.winner + " ac=" + res.allyCoins + " ec=" + res.enemyCoins); } catch (e) {}
logLine(res.winner === "ally" ? "l-crit" : "l-hit",
"【拼点】" + u.name + " 的【" + sk.name + "】 对 " + tgt.name + " 的【" + eSkill.name + "】：" +
(res.winner === "ally" ? "胜（" + res.wins + " 次压制）" : res.winner === "enemy" ? "负（被压制 " + res.losses + " 次）" : "平") +
" ｜ 剩余硬币 " + res.allyCoins + " vs " + res.enemyCoins + " ｜ 拼点 " + res.rounds + " 次");
coinRow(u, sk.coins, res.marks[0] ? res.marks[0].a : 0, res.marks[0] ? res.marks[0].a : 0);
coinRow(tgt, eSkill.coins, res.marks[0] ? res.marks[0].e : 0, res.marks[0] ? res.marks[0].e : 0);
if (res.winner === "ally") {
const hits = Math.min(7, Math.max(1, res.allyCoins + (sk.extraCoin || 0)));
if (sk.aoe) {
let tot = 0;
B.enemies.forEach((e) => { if (e.alive) tot += applyHp(e, coinDamage(u, e, sk, hits, clashWins), ""); });
floatNum("enemy_" + tgt.uid, "-" + Math.round(tot / Math.max(1, B.enemies.filter((e) => e.alive).length)), "crit");
logLine("l-crit", "范围攻击命中全部敌人，合计 " + Math.round(tot) + " 点伤害。");
} else {
const dmg = coinDamage(u, tgt, sk, hits, clashWins);
applyHp(tgt, dmg, "");
logLine("l-hit", "造成 " + Math.round(dmg) + " 点伤害（" + hits + " 枚硬币）。");
applySkillEffect(u, sk, tgt);
}
} else if (res.winner === "enemy") {
const hits = Math.min(7, Math.max(1, res.enemyCoins));
const dmg = coinDamage(tgt, u, eSkill, hits, clashWins);
applyHp(u, dmg, "");
logLine("l-hit", u.name + " 受到 " + Math.round(dmg) + " 点伤害（" + hits + " 枚硬币）。");
if (eSkill.kind === "drain") healActorBy(tgt, dmg * (eSkill.heal || 0.4));
if (eSkill.debuff) {
u.buffs.push({ stat: eSkill.debuff.stat, mult: eSkill.debuff.mult || 0.8, turns: eSkill.debuff.turns || 3, label: eSkill.debuff.label });
logLine("l-dead", u.name + " 被施加了「" + eSkill.debuff.label + "」。");
}
if (eSkill.aoe) {
B.units.forEach((x) => { if (x.alive && x.uid !== u.uid) applyHp(x, coinDamage(tgt, x, eSkill, Math.max(1, hits - 1), clashWins) * 0.7, ""); });
logLine("l-hit", tgt.name + " 的范围攻击波及其他成员。");
}
} else {
logLine("l-sys", res.rounds + " 次拼点未分胜负，双方各留硬币。");
}
return res;
}
function applySkillEffect(u, sk, tgt) {
if (sk.heal) {
const amt = u.maxHp * sk.heal + (sk.powerHeal ? u.atkLevel * sk.powerHeal : 0);
healActorBy(u, amt);
logLine("l-heal", u.name + " 回复 " + Math.round(amt) + " 点生命。");
}
if (sk.shield || sk.baseShield || sk.powerShield) {
let amt = u.maxHp * (sk.shield || sk.baseShield || 0.08) + (sk.powerShield ? u.atkLevel * sk.powerShield : 0);
const cap = u.maxHp * 0.18;
amt = Math.max(0, Math.min(amt, cap - u.shield));
u.shield += amt;
floatNum(targetNodeOf(u), "+" + Math.round(amt), "heal");
logLine("l-heal", u.name + " 获得护盾 " + Math.round(amt) + "。");
}
if (sk.kind === "cleanse") {
u.buffs = u.buffs.filter((b) => (b.mult || 1) >= 1);
u.sp = clamp(u.sp + 10, SP_MIN, SP_MAX);
logLine("l-heal", u.name + " 清除全部负面状态，理智 +10。");
}
if (sk.buff) {
u.buffs.push({ stat: sk.buff.stat, mult: sk.buff.mult, turns: sk.buff.turns, label: sk.buff.label });
logLine("l-heal", u.name + " 进入「" + sk.buff.label + "」。");
}
if (sk.debuff && tgt) {
tgt.buffs.push({ stat: sk.debuff.stat, mult: sk.debuff.mult || 0.8, turns: sk.debuff.turns || 3, label: sk.debuff.label });
logLine("l-sys", tgt.name + " 被施加了「" + sk.debuff.label + "」。");
}
if (sk.bleed && tgt) {
const b = Math.round((u.atkLevel + (sk.atkBonus || 0)) * sk.bleed * 0.6);
tgt.buffs.push({ stat: "bleed", mult: 1, turns: (sk.bleedTurns || 3) + 1, label: "流血", bleed: b });
logLine("l-crit", tgt.name + " 开始流血（每回合 " + b + " 点）。");
}
if (sk.selfCost) {
const c = u.maxHp * sk.selfCost;
u.hp = Math.max(1, u.hp - c);
floatNum(targetNodeOf(u), "-" + Math.round(c), "");
logLine("l-hit", u.name + " 承受 " + Math.round(c) + " 点自损。");
}
if (sk.cd) u.cds[sk.id || sk.name] = sk.cd + 1;
if (sk.cost) { u.sp = clamp(u.sp - 0, SP_MIN, SP_MAX); }
}
function healActorBy(u, amt) {
u.hp = Math.min(u.maxHp, u.hp + amt);
floatNum(targetNodeOf(u), "+" + Math.round(amt), "heal");
}
function tickUnitBuffs(u) {
u.buffs = u.buffs.filter((b) => {
if (b.stat === "bleed" && b.bleed) {
u.hp = Math.max(0, u.hp - b.bleed);
floatNum(targetNodeOf(u), "-" + b.bleed, "crit");
logLine("l-hit", u.name + " 因流血失去 " + b.bleed + " 点生命。");
}
b.turns = (b.turns || 1) - 1;
return b.turns > 0;
});
u.shield = Math.max(0, u.shield - u.maxHp * 0.05);
}
const DESCEND_FX = {
heng: { tint:"#d8b45c", aura:{ label:"恒之剑势", def:1.25, turns:3 }, shield:0.22,
text:"剑势不散。你身前多了一道背影——他生前没挡住的那一击，这一次挡住了。" },
liguangyang: { tint:"#e0a04b", aura:{ label:"恨之纪律", atk:1.25, turns:3 },
text:"「活着的人，得把这件事做完。」全队的力量被那一句话压紧了。" },
siyuan: { tint:"#f2dfa4", aura:{ label:"首席之位", atk:1.25, def:1.2, turns:3 }, shield:0.4, sp:20,
text:"他没有出手。他只是站到了你前面——就像他以前站到所有人前面那样。" },
liyaohui: { tint:"#7fd8ff", aura:{ label:"冰晶之主宰", def:1.35, turns:3 }, shield:0.35,
text:"低温先到，声音后到。地表的霜一路铺到敌人脚下。" },
chengmoge: { tint:"#e0a04b", aura:{ label:"弑神者", atk:1.3, turns:3 },
text:"他打起来有种学徒的认真——每一招都在确认自己有没有学对。" },
xiaoran: { tint:"#b48cff", aura:{ label:"虚无之主", atk:1.2, sp:16, turns:3 },
text:"一片虚无从脚下铺开。所有被写好的规则，在这里都作废。" },
luolan: { tint:"#d8b45c", aura:{ label:"天赋128倍", atk:1.3, turns:3 },
text:"他学东西快得不像话——你这一招他只看过一遍。" },
sihuiyan: { tint:"#ffd76b", aura:{ label:"成神者", atk:1.2, def:1.2, turns:3 }, sp:14,
text:"一整片神骸的认可压在这一击上。她没有用剑，像是不屑。" },
xiaoyahui: { tint:"#7fd8ff", aura:{ label:"执法者", atk:1.25, turns:3 }, sp:12,
text:"他把恒之剑法摆成了一道条款，然后当场执行。" },
jiangmoran: { tint:"#ffe08a", aura:{ label:"星辰宠儿", atk:1.2, turns:3 }, shield:0.2,
text:"星辰落下来的时候，他还对着镜头笑了一下。" },
mang: { tint:"#b48cff", aura:{ label:"茫然之器", def:1.2, sp:22, turns:3 },
text:"表盘响了一下。那一秒里，时间归他管。" }
};
function descendEffect(eid) { return DESCEND_FX[eid] || DESCEND_FX.siyuan; }
function playDescendFx(ev, fx) {
const host = el("descendFx");
if (!host) return;
const skin = ev.skin || "gold";
host.className = "on skin-" + skin;
host.innerHTML =
'<div class="df-flash"></div>' +
'<div class="df-bar"></div><div class="df-bar b2"></div>' +
'<div class="df-burst"></div>' +
'<div class="df-ring"></div>' +
'<div class="df-ring r2"></div>' +
'<div class="df-ring r3"></div>' +
'<div class="df-glyph">' + (ev.glyph || "\u6052") + "</div>" +
'<div class="df-shards">' + (function () {
let h = "";
for (let i = 0; i < 10; i++) {
h += '<i style="--a:' + (i * 36) + 'deg;--d:' + (140 + (i % 4) * 46) + 'px;animation-delay:' + (i * 26) + 'ms"></i>';
}
return h;
})() + "</div>" +
'<div class="df-name" style="color:' + fx.tint + '">' + ev.summon.name + '</div>' +
'<div class="df-title" style="color:' + fx.tint + '">' + (ev.no || "") + " \u00b7 " + ev.name + "</div>" +
'<div class="df-sub">' + fx.text + "</div>";
host.classList.add("on");
try {
const app = el("app");
if (app && app.classList) {
app.classList.add("screen-shake");
setTimeout(function () { app.classList.remove("screen-shake"); }, 620);
}
} catch (e) {}
setTimeout(() => host.classList.remove("on"), 1900);
try { if (window.HengAudio) window.HengAudio.sfx("descend"); } catch (e) {}
const mic = el("btlTitle") ? el("btlTitle").parentNode : null;
if (mic) {
const b = document.createElement("div");
b.className = "clash-banner god";
b.textContent = "降 神 · " + ev.name;
mic.parentNode.appendChild(b);
setTimeout(() => b.remove(), 1000);
}
}
async function runSummonSkill(userUid) {
const ev = DATA.ever.find((x) => x.id === S.summonId);
if (!ev) { toast("你还没有择定本命结缘者。"); return; }
const u = B.units.find((x) => x.uid === userUid) || B.units.find((x) => x.isPlayer && x.alive);
if (!u) return;
u.action = { kind: "summon", skillId: "__summon", skill: { name: ev.summon.name, coins: 1, base: 1 } };
B.summoner = u.uid;
logLine("l-boss", "【降神】" + u.name + " 呼唤了 " + ev.no + " · " + ev.name + "。");
assignTargetAuto();
await resolveAll();
}
function assignTargetAuto() {
const u = B.units.find((x) => x.uid === B.summoner);
const tgt = B.enemies.find((e) => e.alive);
if (u && tgt) u.action.targetUid = tgt.uid;
}
function doSummonResolve(u, ev) {
const fx = descendEffect(ev.id);
playDescendFx(ev, fx);
const su = ev.summon;
const self = u.maxHp * (su.selfCost || 0.12);
u.hp = Math.max(1, u.hp - self);
floatNum(targetNodeOf(u), "-" + Math.round(self), "");
logLine("l-hit", u.name + " 承受了躯体无法承受的那部分：" + Math.round(self) + " 点自损。");
B.units.forEach((x) => {
if (!x.alive) return;
if (fx.aura) {
if (fx.aura.atk) x.buffs.push({ stat:"atk", mult:fx.aura.atk, turns:fx.aura.turns, label:fx.aura.label });
if (fx.aura.def) x.buffs.push({ stat:"def", mult:fx.aura.def, turns:fx.aura.turns, label:fx.aura.label });
}
if (fx.shield) { x.shield += x.maxHp * fx.shield; floatNum(targetNodeOf(x), "+" + Math.round(x.maxHp * fx.shield), "heal"); }
if (fx.sp) { x.sp = clamp(x.sp + fx.sp, SP_MIN, SP_MAX); }
if (fx.aura) x.sp = clamp(x.sp + 4, SP_MIN, SP_MAX);
});
logLine("l-boss", "【降神·全队增益】" + (fx.aura ? fx.aura.label + "（" + fx.aura.turns + "回合）" : "—") +
(fx.shield ? " ｜ 全队护盾 +" + Math.round(fx.shield * 100) + "%" : "") +
(fx.sp ? " ｜ 全队理智 +" + fx.sp : ""));
const power = (ev.power === "∞" ? 12 : parseFloat(ev.power) || 2.2);
let total = 0;
B.enemies.forEach((e) => {
if (!e.alive) return;
const hits = Math.min(6, Math.max(2, Math.round(power)));
const per = Math.max(1, Math.round((u.atkLevel * 0.9 + power * 6 - e.defLevel * 0.2) * 0.55));
let dmg = per * hits * rnd(0.96, 1.06) * (su.mult || 2);
if (su.kind === "crit") dmg *= 1.35;
e.shield = 0;
applyHp(e, dmg, "");
total += dmg;
e.sp = clamp(e.sp - 10, SP_MIN, SP_MAX);
});
logLine("l-crit", "降神之力贯穿全场，合计 " + Math.round(total) + " 点伤害（无视防御、无视护盾）。");
u.cds.__summon = 5;
B.summoner = null;
}
function livingAllies() { return B.units.filter((u) => u.alive); }
function livingEnemies() { return B.enemies.filter((u) => u.alive); }
function checkDeaths() {
B.units.concat(B.enemies).forEach((u) => {
if (u.alive && u.hp <= 0) {
u.alive = false;
logLine("l-dead", u.name + " 倒下了。");
}
});
}
async function resolveNext(i) {
if (B.over) return;
if (i >= B.actions.length) return endRound();
const act = B.actions[i];
const u = B.units.find((x) => x.uid === act.uid) || B.enemies.find((x) => x.uid === act.uid);
if (!u || !u.alive) { await delay(30); return resolveNext(i + 1); }
try {
try { window.__acts = (window.__acts || []); window.__acts.push(u.name + ":" + (u.action && u.action.skill ? u.action.skill.name : (u.action ? u.action.kind : "none"))); } catch (e) {}
if (u.action && u.action.kind === "summon") {
const ev = DATA.ever.find((x) => x.id === S.summonId);
if (ev) doSummonResolve(u, ev);
} else {
await resolveActionAsync(act);
}
} catch (err) {
logLine("l-sys", "（" + u.name + " 的这次出手结算异常，已跳过：" + (err && err.message) + "）");
}
if (B.over) return;
B.enemies.forEach((e) => {
const def = DATA.enemies[B.enemyDefs[e.uid].enemy];
if (!def || !def.phases) return;
B.phaseState = B.phaseState || {};
const shown = B.phaseState[e.uid] || 0;
const ph = def.phases[shown];
if (ph && e.alive && e.hp / e.maxHp <= ph.at) {
B.phaseState[e.uid] = shown + 1;
logLine("l-boss", ph.text);
if (ph.buff) {
if (ph.buff.atk) e.atkLevel = Math.round(e.atkLevel * ph.buff.atk);
if (ph.buff.spd) e.speed = Math.round(e.speed * ph.buff.spd);
logLine("l-boss", "（" + e.name + " 的气势变了。）");
}
}
});
checkDeaths();
renderBattle();
if (!livingEnemies().length) { await delay(420); return winBattle(); }
if (!livingAllies().length) { await delay(420); return loseBattle(); }
await delay(190 * animScale());
return resolveNext(i + 1);
}
function resolveAll(fromCommit) {
if (B.over) return;
if (B.locked && !fromCommit) return; 
B.locked = true;
try {
setTimeout(function () {
if (B && !B.over && B.locked) {
B.locked = false;
try { renderSkills(); } catch (e) {}
}
}, 8000);
} catch (e) {}
B.phase = "resolve";
el("btlPhase").textContent = "拼点阶段";
B.units.forEach((u) => {
if (!u.isPlayer || !u.alive) return;
if (!u.chain || !u.chain.length) u.chain = autoComboFor(u);
u.action = { chain: u.chain.slice(), targetUid: u.actionTarget || null, kind: "combo" };
});
B.enemies.forEach((e) => {
if (!e.alive) return;
e.action = { chain: (window.HengCombo ? window.HengCombo.enemyCombo(e) : ["m_jab"]), kind: "combo" };
});
B.actions = B.units.filter((u) => u.alive).map((u) => ({ uid: u.uid }))
.concat(B.enemies.filter((e) => e.alive).map((e) => ({ uid: e.uid })))
.sort((x, y) => {
const ux = B.units.find((u) => u.uid === x.uid) || B.enemies.find((e) => e.uid === x.uid);
const uy = B.units.find((u) => u.uid === y.uid) || B.enemies.find((e) => e.uid === y.uid);
return effSpd(uy) - effSpd(ux);
});
logLine("l-sys", "—— 招式联合结算（按速度顺序）。");
renderSkills();
try {
return resolveNext(0);
} catch (err) {
logLine("l-sys", "（拼点流程异常，直接进入回合结束：" + (err && err.message) + "）");
B.locked = false;
return endRound();
}
}
function endRound() {
if (B.over) return;
checkDeaths();
B.locked = false;
B.units.forEach((u) => { if (u.alive) u.action = null; });
if (!livingEnemies().length) return winBattle();
if (!livingAllies().length) return loseBattle();
logLine("l-sys", "—— 回合结束。");
beginRound();
}
function logLine(cls, text) {
const box = el("battleLog");
if (!box) return;
const d = document.createElement("div");
d.className = cls;
d.textContent = text;
box.appendChild(d);
while (box.children.length > 160) box.removeChild(box.firstChild);
box.scrollTop = box.scrollHeight;
}
function nodeById(id) {
try {
if (typeof document !== "undefined" && document.getElementById) return document.getElementById(id);
} catch (e) {}
try { return el(id); } catch (e) { return null; }
}
function floatNum(nodeKey, text, cls) {
const zone = el("floatZone");
if (!zone) return;
const n = document.createElement("div");
n.className = "float-num " + (cls || "");
n.textContent = text;
n.style.left = rnd(14, 80) + "%";
n.style.top = rnd(8, 62) + "%";
zone.appendChild(n);
setTimeout(() => n.remove(), 1000);
}
const MOVE_FX = {
slash: { cls:"fx-slash", color:"#ffd76b", sfx:"slash" },
pierce: { cls:"fx-pierce", color:"#7fd8ff", sfx:"pierce" },
crit: { cls:"fx-crit", color:"#ff9d84", sfx:"crit" },
blunt: { cls:"fx-blunt", color:"#e8ecf7", sfx:"blunt" },
arrow: { cls:"fx-arrow", color:"#7fd8ff", sfx:"arrow" },
arrow_pierce:{ cls:"fx-arrow", color:"#7fd8ff", sfx:"pierce" },
rain: { cls:"fx-rain", color:"#7fd8ff", sfx:"arrow" },
bolt: { cls:"fx-bolt", color:"#b48cff", sfx:"spell" },
flame: { cls:"fx-flame", color:"#ff9d84", sfx:"spell" },
chain: { cls:"fx-chain", color:"#b48cff", sfx:"spell" },
meteor: { cls:"fx-meteor", color:"#ff7a5c", sfx:"meteor" },
rune: { cls:"fx-rune", color:"#b48cff", sfx:"spell" },
ward: { cls:"fx-ward", color:"#b48cff", sfx:"ward" },
gun: { cls:"fx-gun", color:"#ffbe7a", sfx:"gun" },
burst: { cls:"fx-burst", color:"#ffbe7a", sfx:"gun" },
snipe: { cls:"fx-snipe", color:"#ffbe7a", sfx:"snipe" },
suppress: { cls:"fx-suppress",color:"#ffbe7a", sfx:"gun" },
drone: { cls:"fx-drone", color:"#8b93ab", sfx:"drone" },
turret: { cls:"fx-turret", color:"#8b93ab", sfx:"gun" },
repair: { cls:"fx-repair", color:"#63d69a", sfx:"ward" },
overload: { cls:"fx-overload",color:"#b48cff", sfx:"spell" },
heal: { cls:"fx-heal", color:"#63d69a", sfx:"heal" },
cure: { cls:"fx-cure", color:"#63d69a", sfx:"heal" },
needle: { cls:"fx-needle", color:"#63d69a", sfx:"pierce" },
field: { cls:"fx-repair", color:"#63d69a", sfx:"ward" },
bulwark: { cls:"fx-bulwark", color:"#63d69a", sfx:"ward" }
};
function fxForMove(m) {
if (!m) return MOVE_FX.blunt;
if (m.fx && MOVE_FX[m.fx]) return MOVE_FX[m.fx];
const t = m.type;
if (t === "\u672f") return MOVE_FX.bolt;
if (t === "\u68b0") return MOVE_FX.gun;
if (t === "\u533b") return MOVE_FX.heal;
if (t === "\u5f13") return MOVE_FX.arrow;
if (t === "\u9635") return MOVE_FX.meteor;
if (t === "\u5b88") return MOVE_FX.bulwark;
if (t === "\u5251" || t === "\u5203") return MOVE_FX.slash;
if (t === "\u67aa") return MOVE_FX.pierce;
if (t === "\u65a7") return MOVE_FX.blunt;
return MOVE_FX.blunt;
}
function playMoveFx(targetUid, m, kind) {
const fx = fxForMove(m);
const node = nodeById("enemy_" + targetUid) || nodeById("ally_" + targetUid) ||
document.querySelector('[id$="' + targetUid + '"]');
if (!node) return;
const layer = document.createElement("div");
layer.className = "fx-layer " + fx.cls + (kind === "hit" ? " on-hit" : "");
layer.style.setProperty("--fx-color", fx.color);
for (let i = 0; i < 3; i++) {
const p = document.createElement("i");
p.style.animationDelay = (i * 60) + "ms";
layer.appendChild(p);
}
node.appendChild(layer);
setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 720);
if (window.HengAudio && fx.sfx) window.HengAudio.sfx(fx.sfx);
}
function hitFeedback(targetUid, dmg, crit) {
const node = nodeById("enemy_" + targetUid) || nodeById("ally_" + targetUid);
if (node && node.classList) {
node.classList.remove("hit");
void node.offsetWidth;
node.classList.add("hit");
if (crit) node.classList.add("hit-hard");
setTimeout(function () {
node.classList.remove("hit");
node.classList.remove("hit-hard");
}, 420);
}
floatNum(targetUid, "-" + Math.round(dmg), crit ? "crit" : "");
try { if (window.HengAudio) window.HengAudio.sfx(crit ? "crit" : "hit"); } catch (e) {}
}
function coinRow(u, total, heads, _h2) {
let s = "";
for (let i = 0; i < total; i++) s += '<span class="coin ' + (i < heads ? "h" : "t") + '"></span>';
return s;
}
function spBar(u) {
const pct = ((u.sp - SP_MIN) / (SP_MAX - SP_MIN)) * 100;
return '<div class="bar bar-sp"><div class="bar-fill sp-fill" style="width:' + clamp(pct, 0, 100) + '%"></div>' +
'<span class="bar-text">理智 ' + Math.round(u.sp) + "</span></div>";
}
function hpBar(u) {
const pct = clamp((u.hp / u.maxHp) * 100, 0, 100);
return '<div class="bar"><div class="bar-fill hp-fill" style="width:' + pct + '%"></div>' +
'<span class="bar-text">' + Math.round(u.hp) + " / " + u.maxHp + (u.shield > 0 ? "（盾 " + Math.round(u.shield) + "）" : "") + "</span></div>";
}
function renderBattle() {
if (!B) return;
el("btlTurn").textContent = "回合 " + B.round;
el("btlPhase").textContent = B.phase === "assign" ? (B.locked ? "拼点阶段" : "编成阶段") : "拼点阶段";
renderEnemyRow();
renderAllyRow();
renderSkills();
renderTools();
}
function renderEnemyRow() {
const row = el("enemyRow");
if (!row) return;
row.innerHTML = "";
B.enemies.forEach((e) => {
const slot = document.createElement("div");
slot.className = "enemy-slot" + (e.alive ? "" : " down");
slot.id = "enemy_" + e.uid;
const sk = e.intent ? e.intent.skill : null;
slot.innerHTML =
'<div class="actor enemy"><div class="actor-glyph">' + e.glyph + '</div><div class="actor-ring"></div></div>' +
'<div class="nm">' + e.name + (e.panic ? " ｜ 恐慌" : "") + "</div>" +
'<div class="hpbig">' + hpBar(e) + "</div>" + spBar(e) +
'<div class="intent">' + (sk ? "意图：" + sk.name + "（" + sk.base + "+" + sk.coins + "×" + sk.coin + "）" +
" → " + (e.intent.targetName || "—") : "（已倒下）") + "</div>";
slot.onclick = () => assignTarget(e.uid); 
row.appendChild(slot);
});
}
function renderAllyRow() {
const row = el("allyRow");
if (!row) return;
row.innerHTML = "";
B.units.forEach((u, i) => {
if (!u.isPlayer && u.side !== "ally") return;
const slot = document.createElement("div");
slot.className = "ally-slot" + (i === B.sel ? " act" : "") + (u.alive ? "" : " down") +
(u.panic ? " panic" : "") + (u.assist ? " assist" : "") + (u.timelineTwin ? " twin" : "");
slot.id = "ally_" + u.uid;
const tgt = u.actionTarget ? B.enemies.find((e) => e.uid === u.actionTarget) : null;
const C = window.HengCombo;
const chainTxt = (u.chain && u.chain.length && C)
? u.chain.map((id) => (C.move(id) || {}).name).join(" › ")
: "";
slot.innerHTML =
'<div class="an"><span>' + u.name + (u.timelineTwin ? " <b class='twin-mark'>同位体</b>" : "") +
'</span><span class="ar">' +
(u.assist ? "援助 · 不可操控" : (u.ally ? (DATA.recruit.tiers[u.rarity] || {}).name || "" : "")) + "</span></div>" +
hpBar(u) + spBar(u) +
'<div class="asel">' + (u.alive
? (u.assist ? "剧情援助 · 由剧本代为出手"
: (u.panic ? "恐慌中 · 脱手"
: (chainTxt ? "连段：" + chainTxt + (tgt ? "　→ " + tgt.name : "")
: "未编成 · 先点下方招式拼连段，再点敌人指定目标")))
: (u.assist ? "援助已退场" : "已倒下")) + "</div>" +
(chainTxt && !u.assist ? '<div class="chain-badge">' + u.chain.length + " 招</div>" : "");
slot.onclick = () => { if (u.assist) toast("援助角色由剧情操控，你无法指挥他。"); else selectUnit(u.uid); };
row.appendChild(slot);
});
}
function typeCls(t) {
const C = window.HengCombo;
const info = C && C.typeInfo ? C.typeInfo(t) : { cls: "melee" };
return "cls-" + info.cls;
}
function renderComboZone() {
const chainHost = el("comboChain");
const movesHost = el("comboMoves");
if (!chainHost || !movesHost) return;
const C = window.HengCombo;
const u = B.units[B.sel];
chainHost.innerHTML = "";
movesHost.innerHTML = "";
if (!C || !u || !u.alive) {
chainHost.innerHTML = '<span class="combo-empty">请先在上方选择一名成员。</span>';
return;
}
if (u.assist) {
chainHost.innerHTML = '<span class="combo-empty">【援助角色】' + u.name +
' 由剧情代为出手，你无法为他编成连段。（他仍在队伍中战斗）</span>';
return;
}
u.chain = u.chain || [];
const foeList = B.enemies.filter((e) => e.alive);
const tgt = foeList.find((e) => e.uid === u.actionTarget) || foeList[0] || null;
const pv = C.preview(u, u.chain, tgt, false);
if (!u.chain.length) {
chainHost.innerHTML = '<span class="combo-empty">还没选招式 —— 点下方招式开始连段（最多 ' +
(DATA.combo.maxMoves || 4) + ' 招）' + (tgt ? "　目标：" + tgt.name : "") + "</span>";
} else {
u.chain.forEach((id, i) => {
const st = pv.steps[i];
const m = C.move(id) || {};
const step = document.createElement("div");
step.className = "combo-step " + typeCls(st ? st.type : m.type);
step.innerHTML =
'<span class="cs-idx">第 ' + (i + 1) + " 招</span>" +
'<span class="cs-name">' + (st ? st.glyph + " " + st.name : m.name) + "</span>" +
'<span class="cs-hit' + (st && st.pct < 60 ? " low" : "") + '">命中 ' + (st ? st.pct : "?") + "%" +
(i === 0 ? "（首招必中）" : "") + "</span>" +
'<span class="cs-aff">' + (st && st.affPct !== null ? "适配 " + st.affPct + "%" : "起手") + "</span>" +
'<span class="cs-x" data-rm="' + i + '">✕</span>';
chainHost.appendChild(step);
if (i < u.chain.length - 1) {
const a = document.createElement("span");
a.className = "combo-arrow";
a.textContent = "›";
chainHost.appendChild(a);
}
});
const rest = pv.steps.length ? pv.steps[pv.steps.length - 1].cum : 100;
const tail = document.createElement("div");
tail.className = "combo-tail";
tail.innerHTML = '<span class="cs-name">整段成功率</span><span class="cs-hit">' + rest + "%</span>" +
'<span class="cs-aff">可再联合 ' + Math.max(0, (DATA.combo.maxMoves || 4) - u.chain.length) + " 招</span>";
chainHost.appendChild(tail);
}
const maxed = u.chain.length >= (DATA.combo.maxMoves || 4);
const ids = C.unitMoves(u);
ids.forEach((id) => {
const m = C.move(id);
if (!m) return;
const prev = u.chain.length ? u.chain[u.chain.length - 1] : null;
const h = C.hitChance(u, prev, id, tgt, false);
const affTxt = prev ? ("适配 " + (h.affPct !== null ? h.affPct + "%" : "—") + " ｜ 命中 " + h.pct + "%")
: ("起手 ｜ 命中 " + h.pct + "%");
const b = document.createElement("button");
b.className = "move-btn " + typeCls(m.type) + (m.power === 0 ? " as-def" : "");
b.disabled = B.locked || maxed;
b.innerHTML =
'<div class="mv-top"><span>' + (C.typeInfo(m.type).glyph || "") + " " + m.name + "</span>" +
'<span class="mv-type">' + m.type + "</span></div>" +
'<div class="mv-sub' + (h.pct < 60 ? " low" : "") + '">' + affTxt + "</div>" +
'<div class="mv-desc">' + (m.desc || "") + "</div>";
b.onclick = () => addMove(id);
movesHost.appendChild(b);
});
const actHost = el("comboActions");
if (actHost) {
actHost.innerHTML = "";
const mk = (label, cls, fn, disabled) => {
const b = document.createElement("button");
b.className = "btn " + (cls || "");
b.textContent = label;
b.disabled = !!disabled || B.locked;
b.onclick = fn;
actHost.appendChild(b);
};
mk("清 空 连 段", "btn-ghost", () => { u.chain = []; renderBattle(); }, !u.chain.length);
mk("自 动 联 合", "", () => { u.chain = autoComboFor(u); renderBattle(); });
mk("指 定 目 标" + (tgt ? "：" + tgt.name : ""), "btn-ghost", () => {
const live = B.enemies.filter((e) => e.alive);
if (!live.length) return;
const i = live.findIndex((e) => e.uid === u.actionTarget);
u.actionTarget = live[(i + 1) % live.length].uid;
renderBattle();
}, !B.enemies.filter((e) => e.alive).length);
}
$$("#comboChain [data-rm]").forEach(function (cs) {
cs.onclick = function (ev) {
if (ev && ev.stopPropagation) ev.stopPropagation();
const uu = B.units[B.sel];
if (!uu || !uu.chain) return;
uu.chain.splice(parseInt(cs.getAttribute("data-rm"), 10), 1);
renderBattle();
};
});
}
function addMove(id) {
const u = B.units[B.sel];
if (!u || !u.alive || B.locked) return;
u.chain = u.chain || [];
const max = (DATA.combo && DATA.combo.maxMoves) || 4;
if (u.chain.length >= max) { toast("连段已达上限（" + max + " 招）。"); return; }
u.chain.push(id);
const live = B.enemies.filter((e) => e.alive);
if (!u.actionTarget && live.length) u.actionTarget = live[0].uid;
renderBattle();
}
function commitAll() {
if (B.over || B.locked) return;
renderSkills();
let pr;
try {
pr = resolveAll(true);
} catch (err) {
logLine("l-sys", "（结算未能启动：" + (err && err.message) + "）");
B.locked = false;
try { endRound(); } catch (e2) { B.locked = false; }
return;
}
if (pr && typeof pr.then === "function") {
pr.catch(function (err) {
logLine("l-sys", "（结算异常，强制结束本回合：" + (err && err.message) + "）");
B.locked = false;
try { endRound(); } catch (e2) { B.locked = false; }
});
}
}
function renderSkills() {
const bar = el("skillBar");
if (!bar) return;
bar.innerHTML = "";
const btn = document.createElement("button");
btn.className = "skill";
btn.disabled = B.locked;
btn.innerHTML = '<div class="skill-name"><span>确 认 出 手</span><span class="skill-cost">按速度结算</span></div>' +
'<div class="skill-desc">所有成员的连段将按速度顺序依次结算，敌方也会回击。</div>';
btn.onclick = () => commitAll();
bar.appendChild(btn);
const auto = document.createElement("button");
auto.className = "skill";
auto.disabled = B.locked;
auto.innerHTML = '<div class="skill-name"><span>全 员 自 动 联 合</span></div>' +
'<div class="skill-desc">为每个成员自动串一条连段，并自动指定目标。</div>';
auto.onclick = () => { autoAssignAll(); renderBattle(); };
bar.appendChild(auto);
renderComboZone();
}
function renderTools() {
const node = el("battleTools");
if (!node) return;
node.innerHTML = "";
const mk = (label, fn, disabled, cls) => {
const b = document.createElement("button");
b.className = "btn btn-tiny " + (cls || "");
b.textContent = label;
b.disabled = !!disabled;
b.onclick = fn;
node.appendChild(b);
};
if (B.boss) {
const nb = document.createElement("button");
nb.className = "btn btn-tiny btn-ghost";
nb.textContent = "会台规则：禁用道具";
nb.disabled = true;
node.appendChild(nb);
mk("医疗部 · 回血 30%（功勋 250）", () => useHeal(), B.locked || (S.honor || 0) < 250);
return;
}
mk("医疗部 · 回血 30%（功勋 250）", () => useHeal(), B.locked || (S.honor || 0) < 250);
const bag = S.bag || {};
const usable = DATA.items.filter((it) => (bag[it.id] || 0) > 0);
if (!usable.length) mk("道具 · 空", () => toast("你没有道具。到「道具」面板看看，或去无垠厅刷功勋买。"), true, "btn-ghost");
usable.slice(0, 5).forEach((it) => mk("用 " + it.name + " ×" + bag[it.id], () => useItemBattle(it.id), B.locked));
const ev = DATA.ever.find((x) => x.id === S.summonId);
if (ev) {
const cd = (B.units[B.sel] && B.units[B.sel].cds.__summon) || 0;
mk("【降神】" + ev.summon.name + (cd > 0 ? "（冷却 " + cd + "）" : ""), () => runSummonSkill(B.sel),
B.locked || cd > 0, "btn-primary");
}
}
function winBattle() {
if (!B) return; 
if (B.over) return;
B.over = true; B.locked = true; B.stageWin = true;
livingEnemies().forEach((e) => { e.alive = false; });
renderBattle();
logLine("l-crit", "战斗结束 —— 你赢了。");
if (B.assists && B.assists.length) assistLeaveLines(B.assists);
const st = B.stage;
if (st.win) logLine("l-act", tr(st.win));
if (st.spBoss) {
S.spActive = false;
grantSpReward(st.spBoss);
}
if (st.flag) { S.flags = S.flags || {}; S.flags[st.flag] = true; }
syncPartyFromBattle();
S.questCounters = S.questCounters || { battles:0, kills:0, killsByTag:{}, bossWins:0, arenaWins:0, fullHp:0 };
const qc = S.questCounters;
qc.battles = (qc.battles || 0) + 1;
const dead = (B.enemies || []).filter((e) => !e.alive);
qc.kills = (qc.kills || 0) + dead.length;
qc.killsByTag = qc.killsByTag || {};
dead.forEach((e) => {
enemyTags(e.key || e.id || "").forEach((t) => { qc.killsByTag[t] = (qc.killsByTag[t] || 0) + 1; });
});
if (B.arena) {
qc.arenaWins = (qc.arenaWins || 0) + 1;
S.arenaCleared = S.arenaCleared || {};
const tk = arenaClearKey(B.arenaTier || 0, B.arenaDiff || "normal");
S.arenaCleared[tk] = (S.arenaCleared[tk] || 0) + 1;
if (!B.arenaDiff || B.arenaDiff === "normal") {
const legacy = "t" + (B.arenaTier || 0);
S.arenaCleared[legacy] = (S.arenaCleared[legacy] || 0) + 1;
}
}
if (B.boss && B.bossId) qc.bossWins = (qc.bossWins || 0) + 1;
const allFull = (B.units || []).some((u) => u.alive) &&
(B.units || []).every((u) => !u.alive || u.hp >= u.maxHp - 0.5);
if (allFull) qc.fullHp = (qc.fullHp || 0) + 1;
rollDrops(dead);
if (B.arena) {
S.arena = S.arena || { tier:0, streak:0, wins:0 };
S.arena.streak = (S.arena.streak || 0) + 1;
S.arena.wins = (S.arena.wins || 0) + 1;
}
if (B.boss && B.bossId) {
S.bossWins = S.bossWins || {};
S.bossBest = S.bossBest || {};
var bb = DATA.bossArena.list.filter(function (x) { return x.id === B.bossId; })[0];
var first = !S.bossWins[B.bossId];
S.bossWins[B.bossId] = (S.bossWins[B.bossId] || 0) + 1;
var r = B.round || 1;
if (!S.bossBest[B.bossId] || r < S.bossBest[B.bossId]) S.bossBest[B.bossId] = r;
if (bb) {
if (first) {
S.honor = (S.honor || 0) + (bb.honor || 0);
logLine("l-crit", "【首胜】获得功勋 " + bb.honor + "。");
if (bb.reward) {
var rw = DATA.weapons.filter(function (w) { return w.id === bb.reward; })[0];
var ri = DATA.items.filter(function (x) { return x.id === bb.reward; })[0];
if (rw) {
S.weapons = S.weapons || [];
if (S.weapons.indexOf(rw.id) < 0) { S.weapons.push(rw.id); logLine("l-crit", "【首胜】解锁兵装：" + rw.name); }
} else if (ri) {
gainItem(ri.id, 3);
logLine("l-crit", "【首胜】获得道具：" + ri.name + " ×3");
}
}
} else {
var hon = Math.round((bb.honor || 0) * 0.25);
S.honor = (S.honor || 0) + hon;
logLine("l-sys", "重复挑战奖励：功勋 " + hon + "。");
}
}
}
refreshQuests(true);
setTimeout(() => showResult(true), 800);
}
function loseBattle() {
if (B.over) return;
B.over = true; B.locked = true; B.stageWin = false;
renderBattle();
logLine("l-dead", "全员倒下了……");
if (B.stage && B.stage.lose && B.stage.lose.text) logLine("l-dead", B.stage.lose.text);
if (B.stage && B.stage.spBoss) {
S.spActive = false;
S.restoreSquadAfterSp = true;
saveGame(true);
}
if (B.arena) { S.arena = S.arena || { tier:0, streak:0, wins:0 }; S.arena.streak = 0; }
(S.allies || []).forEach((a) => { a.hp = null; a.sp = 20; });
setTimeout(() => showResult(false), 800);
}
function syncPartyFromBattle() {
B.units.forEach((u) => {
if (!u.ally) return;
u.ally.hp = (u.alive && u.hp > 0) ? Math.round(u.hp) : null;
u.ally.sp = Math.round(u.sp);
u.ally.level = u.ally.level || 1;
});
}
function allyById(id) { return allyIndex()[id] || null; }
function showResult(win) {
const st = B.stage;
const lines = [];
const arenaTier = B.arena ? DATA.arena.tiers[B.arenaTier] : null;
el("resTitle").textContent = win ? "战 果 · 胜" : "战 果 · 败";
if (win) {
lines.push(["l-crit", (B.boss ? "在会台上击败了 " : "击败【") + B.enemies.map((e) => e.name).join("、") + (B.boss ? "" : "】")]);
if (st.award) applyAward(st.award, lines, true);
let bonus = Math.round(48 + (B.enemies[0] ? B.enemies[0].maxHp / 30 : 30));
if (arenaTier) {
const streakMul = 1 + (S.arena.streak - 1) * DATA.arena.streakBonus;
const aD = arenaDiff(B.arenaDiff || "normal");
bonus = Math.round((86 + (B.enemies[0] ? B.enemies[0].maxHp / 34 : 40)) *
(arenaTier.expScale || 1) * streakMul * aD.exp);
const honor = Math.round((arenaTier.honor || 50) * (1 + (S.arena.streak - 1) * 0.1) * aD.honor);
S.honor += honor;
lines.push(["l-crit", arenaTier.name + " · " + aD.name + " ｜ 连胜 " + S.arena.streak +
" 场（经验 ×" + streakMul.toFixed(2) + "，难度 ×" + aD.exp.toFixed(2) + "）"]);
lines.push(["l-sys", "获得功勋 " + honor + "。（当前功勋：" + S.honor + "）"]);
const drop = rollDrop(arenaTier);
if (drop) {
gainItem(drop.id, 1);
lines.push(["l-crit", "拾得：[" + (DATA.weaponRarity[drop.rarity] || {}).name + "] " + drop.name]);
}
}
gainExp(bonus, lines);
lines.push(["l-sys", "（战果奖励经验 " + bonus + " 点）"]);
} else {
lines.push(["l-dead", "全员被带回后方。"]);
if (st.lose && st.lose.text) lines.push(["l-act", tr(st.lose.text)]);
const half = Math.round(((st.award && st.award.exp) || 0) * 0.4) + 20;
if (arenaTier) lines.push(["l-sys", "无垠厅的胜负不计入传记，连胜已归零。"]);
gainExp(half, lines);
lines.push(["l-sys", "打不过就先变强：去「无垠厅」刷怪、在「征召」里招队友、在「兵装」里换武器。"]);
}
if (st.flag) { S.flags = S.flags || {}; S.flags[st.flag] = true; }
saveGame(true);
el("resBody").innerHTML = lines.map((l) =>
"<p style='color:" + (l[0] === "l-crit" ? "var(--gold2)" : (l[0] === "l-sys" || l[0] === "l-heal") ? "var(--ok)" : l[0] === "l-dead" ? "#ff9d84" : "var(--muted)") + "'>" + l[1] + "</p>"
).join("");
const btns = el("resBtns");
btns.innerHTML = "";
const mk = (label, cls, fn) => {
const b = document.createElement("button");
b.className = "btn " + cls; b.textContent = label; b.onclick = fn;
btns.appendChild(b);
};
if (B.boss && B.bossId) {
var bd = DATA.bossArena.list.filter(function (x) { return x.id === B.bossId; })[0];
if (!win) mk("再 次 挑 战", "btn-primary", () => startBoss(B.bossId, bd));
mk("挑 战 名 单", "btn", () => openBosses());
mk("返 回 列 传", "btn-ghost", () => { healSquad(0.55); renderMap(); show("map"); });
} else if (B.arena) {
mk(win ? "再 战 一 场" : "再 来 一 次", "btn-primary", () => startArena(B.arenaTier, B.arenaDiff || "normal"));
mk("回 无 垠 厅", "btn", () => openArena());
mk("返 回 列 传", "btn-ghost", () => { healSquad(0.55); renderMap(); show("map"); });
} else {
const strict = strictNoSkip();
if (!win) mk("再 来 一 次", "btn-primary", () => startBattle(st));
if (strict) {
mk("暂 时 撤 离（去 练 级）", win ? "btn-primary" : "btn", () => leaveToGrind());
const lock = document.createElement("button");
lock.className = "btn btn-ghost";
lock.disabled = true;
lock.textContent = "未 胜 利 · 无 法 推 进";
lock.style.opacity = ".45";
lock.style.cursor = "not-allowed";
btns.appendChild(lock);
} else {
mk(win ? "继 续 传 记" : "带 着 这 一 败 往 下 走", win ? "btn-primary" : "btn-ghost", () => afterBattle());
}
}
show("result");
}
function rollDrop(tier) {
if (Math.random() > 0.42) return null;
const roll = Math.random();
let rar = "common";
if (roll < 0.02) rar = "relic";
else if (roll < 0.12) rar = "elite";
else if (roll < 0.34) rar = "advance";
const weapons = DATA.weapons.filter((w) => w.rarity === rar && w.id !== "fist_bare");
const items = DATA.items.filter((i) => i.rarity === rar);
const all = weapons.concat(items);
if (!all.length) return null;
const pickOne = all[Math.floor(Math.random() * all.length)];
return pickOne;
}
function strictNoSkip() {
const d = (typeof diffId === "function") ? diffId() : ((S && S.difficulty) || "normal");
return d === "hard" || d === "true";
}
function strictBlocked(st) {
if (st && (st.winscripted || (st.lose && st.lose.scripted))) return false;
return strictNoSkip();
}
function leaveToGrind() {
healSquad(0.55);
renderMap();
show("map");
toast("已撤离。这一关还没过——去无垠厅练级，或调整编队与兵装后再来。");
}
function afterBattle() {
if (strictBlocked(B.stage) && !B.stageWin) {
toast("【" + (DATA.difficulties[diffId()] || {}).name + "】难度下不能带着败绩推进 —— 请重打，或暂时撤离去练级。");
renderBattle();
return;
}
if (S) {
S.spActive = false;

S.spDraft = null;
S.restoreSquadAfterSp = false;
saveGame(true);
}
healSquad(0.10);
const ch = DATA.chapters[S.chapterIndex];
const cs = chapterState(S.chapterIndex);
cs.stages = S.stage + 1;
S.stage = cs.stages;
saveGame(true);
if (cs.stages >= ch.stages.length) { finishChapter(S.chapterIndex); return; }
renderMap(); show("map");
}
function healSquad(frac) {
(S.allies || []).forEach((a) => { a.hp = null; if (a.sp !== undefined) a.sp = 20; });
if (S.hp !== undefined) S.hp = Math.min(baseStats(S).hp, S.hp + Math.round(baseStats(S).hp * frac));
}
function useHeal() {
if (!B || B.over || B.locked) return;
const cost = 250;
if ((S.honor || 0) < cost) { toast("功勋不足。"); return; }
S.honor -= cost;
const u = B.units[B.sel] && B.units[B.sel].alive ? B.units[B.sel] : livingAllies()[0];
if (!u) return;
u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.30);
u.sp = clamp(u.sp + 6, SP_MIN, SP_MAX);
floatNum(targetNodeOf(u), "+" + Math.round(u.maxHp * 0.30), "heal");
logLine("l-heal", "医疗部介入：" + u.name + " 回复 30% 生命、理智 +6（消耗功勋 " + cost + "）。");
renderBattle();
renderHud();
}
function useItemBattle(id) {
if (!B || B.over || B.locked) return;
const it = DATA.items.find((x) => x.id === id);
if (!it || !(S.bag || {})[id]) { toast("没有这个道具。"); return; }
const u = B.units[B.sel] && B.units[B.sel].alive ? B.units[B.sel] : livingAllies()[0];
if (!u) return;
useItemOn(it, u);
S.bag[id]--;
if (S.bag[id] <= 0) delete S.bag[id];
logLine("l-heal", "使用【" + it.name + "】。");
renderBattle();
saveGame(true);
}
function useItemOn(it, u) {
if (it.kind === "heal") { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * it.val); floatNum(targetNodeOf(u), "+" + Math.round(u.maxHp * it.val), "heal"); }
else if (it.kind === "sanity") { u.sp = clamp(u.sp + it.val, SP_MIN, SP_MAX); floatNum(targetNodeOf(u), "理智 +" + it.val, "heal"); }
else if (it.kind === "sanall") { B.units.forEach((x) => { if (x.alive) x.sp = clamp(x.sp + it.val, SP_MIN, SP_MAX); }); }
else if (it.kind === "shield") { u.shield += u.maxHp * it.val; floatNum(targetNodeOf(u), "+" + Math.round(u.maxHp * it.val), "heal"); }
else if (it.kind === "coin") { u.buffs.push({ stat:"coin", amount: it.val, turns: it.turns || 3, label:"定印 +" + it.val }); }
else if (it.kind === "shred") {
const t = livingEnemies()[0];
if (t) t.buffs.push({ stat:"def", mult:0.75, turns:2, label:"防御↓" });
}
}
function allyGiveExp(a, amount) {
if (!a) return 0;
a.exp = Math.max(0, Math.floor(a.exp || 0));
a.level = Math.max(1, Math.floor(a.level || 1));
a.exp += amount;
let ups = 0;
while (a.level < MAX_LEVEL && a.exp >= expNeeded(a.level)) {
a.exp -= expNeeded(a.level);
a.level++;
ups++;
}
if (a.level >= MAX_LEVEL) a.exp = 0;
return ups;
}
const LEVEL_BANDS = [
{ id: "l1", name: "Lv.1-9", min: 1, max: 9 },
{ id: "l10", name: "Lv.10-29", min: 10, max: 29 },
{ id: "l30", name: "Lv.30-59", min: 30, max: 59 },
{ id: "l60", name: "Lv.60-99", min: 60, max: 99 },
{ id: "l100", name: "Lv.100-149",min: 100, max: 149 },
{ id: "l150", name: "Lv.150-199",min: 150, max: 199 },
{ id: "l200", name: "Lv.200（满级）", min: 200, max: 9999 }
];
function bandOf(level) {
const lv = Math.max(1, Math.floor(level || 1));
for (const b of LEVEL_BANDS) if (lv >= b.min && lv <= b.max) return b.id;
return "l1";
}
function groupByLevel(list) {
const buckets = {};
(list || []).forEach((a) => {
const k = bandOf(a.level);
(buckets[k] = buckets[k] || []).push(a);
});
Object.keys(buckets).forEach((k) => {
buckets[k].sort((x, y) => (y.level || 1) - (x.level || 1) || String(x.name).localeCompare(String(y.name)));
});
return LEVEL_BANDS.map((b) => ({ band: b, items: buckets[b.id] || [] })).filter((x) => x.items.length);
}
function jarTargets() {
if (!S) return [];
S.allies = S.allies || [];
if (typeof syncHero === "function") { try { syncHero(); } catch (e) {} }
return (S.allies || []).slice();
}
function giveExpJar(id) {
const it = DATA.items.find((x) => x.id === id);
if (!it || (it.kind !== "exp" && it.kind !== "lvup")) { toast("这不是经验罐。"); return 0; }
if (!S) return 0;
if (!(S.bag || {})[id]) { toast("没有这个道具。"); return 0; }
const list = jarTargets();
if (!list.length) { toast("没有可以使用的角色。"); return 0; }
UI.jarPick = { jar: id, ally: list[0].id };
openJarPicker();
return 0;
}
function gainItem(id, n) {
S.bag = S.bag || {};
S.bag[id] = (S.bag[id] || 0) + (n || 1);
}
function equipList() {
if (!S.equipped || !S.equipped.length) {
S.equipped = ["kick", "basic"].concat(DATA.schools[S.school].abilities).slice(0, MAX_EQUIP);
const seen = {}, out = [];
S.equipped.forEach((id) => { if (DATA.abilities[id] && !seen[id]) { seen[id] = 1; out.push(id); } });
S.equipped = out;
saveGame(true);
}
return S.equipped.filter((id) => DATA.abilities[id] && isUnlocked(id));
}
const MAX_EQUIP = 6;
function abilityOrder() { return DATA.abilityOrder || Object.keys(DATA.abilities); }
function isUnlocked(id) {
const a = DATA.abilities[id];
if (!a) return false;
if (S && S.dev) return true;
return !a.unlock || S.level >= a.unlock;
}
function knownAbilities() { return abilityOrder().filter(isUnlocked); }
function equipAbility(id) {
if (!DATA.abilities[id]) return "没有这个技能。";
if (!isUnlocked(id)) return "尚未解锁：需要 Lv." + DATA.abilities[id].unlock + "。";
if (S.equipped.indexOf(id) >= 0) return "已经在你的技能栏里了。";
if (S.equipped.length >= MAX_EQUIP) return "技能栏已满（" + MAX_EQUIP + " 格）。";
S.equipped.push(id); saveGame(true); return null;
}
function unequipAbility(id) {
if (S.equipped.length <= 1) return "至少要留一个技能。";
S.equipped = S.equipped.filter((x) => x !== id); saveGame(true); return null;
}
function checkUnlocks(level) {
return abilityOrder().filter((id) => { const a = DATA.abilities[id]; return a && a.unlock && a.unlock === level; });
}
function normalizeSquad(list, capArg) {
if (!S) return { changed: false, removed: 0, trimmed: 0, cap: 2 };
const cap = capArg || squadCap();
const explicit = Array.isArray(list);
const before = (explicit ? list : (S.squad || [])).slice();
const idx = allyIndex();
let clean = before.filter((id) => idx[id]);
const removed = before.length - clean.length;
let trimmed = 0;
if (clean.length > cap) { trimmed = clean.length - cap; clean = clean.slice(0, cap); }
if (!explicit) S.squad = clean;
return { changed: (removed + trimmed) > 0, removed: removed, trimmed: trimmed, cap: cap, list: clean };
}
function squadLegality(list, capArg) {
if (!S) return "没有存档。";
const nr = normalizeSquad(list, capArg);
const cap = capArg || squadCap();
const chk = Array.isArray(list) ? nr.list : (S.squad || []);
if (!chk.length) return "编队是空的。先到「编队」安排上场的人。";
if (chk.length > cap) return "编队超编（" + S.squad.length + " / " + cap + "）。";
const aidx = allyIndex();
if ((S.squad || []).some((id) => !aidx[id])) return "编队里有已经不存在的成员。";
return null;
}
function squadCap() {

const done = Object.values(S.chapters || {}).filter((c) => c.done).length;
return clamp(2 + Math.floor(done / 3), 2, 4);
}
function weaponJob(wid) {
const w = DATA.weapons.find((x) => x.id === wid);
if (!w) return null;
return DATA.weaponJobs[wid] || null;
}
function jobOfAlly(a) {
if (!a) return "warrior";
if (a.job) return a.job;
const j = weaponJob(a.weaponId);
return j || "warrior";
}
function jobInfo(j) { return DATA.jobs[j] || DATA.jobs.warrior; }
function makeAlly(name, tier, opts) {
opts = opts || {};
let base = { common: 24, advance: 34, elite: 46, relic: 62, eternal: 86 }[tier] || 24;
const g = (DATA.recruit.eternalPool || []).indexOf(name) >= 0 ? 92 : null;
if (g) base = g;
const ally = {
id: opts.id || ("a" + Math.random().toString(36).slice(2, 9)),
name: name, tier: tier, rarity: tier,
level: opts.level || 1,
glyph: name.slice(0, 1),
color: (DATA.recruit.tiers[tier] || {}).color || "#8b93ab",
base: opts.base || base,
hpBonus: opts.hpBonus || 0, speedBonus: opts.speedBonus || 0,
job: opts.job || null,
weaponId: opts.weaponId || "fist_bare",
loadout: opts.loadout || null,
summonId: opts.summonId || null,
note: opts.note || "",
hp: null, sp: 20
};
ally.base = ally.base + Math.floor(Math.random() * 5) * (tier === "eternal" ? 4 : 2);
if (!ally.job) ally.job = opts.job || weaponJob(ally.weaponId) || randomJob();
if (!weaponUsableBy(ally.weaponId, ally.job)) {
ally.weaponId = (DATA.jobDefaultWeapon && DATA.jobDefaultWeapon[ally.job]) || ally.weaponId;
}
return ally;
}
function randomJob() {
const ks = Object.keys(DATA.jobs || {});
if (!ks.length) return "warrior";
return ks[Math.floor(Math.random() * ks.length)];
}
function eternalAlly(name) {
const ev = DATA.ever.find((e) => e.name === name);
if (ev) {
return makeAlly(ev.name, "eternal", {
id: "ever_" + ev.id, base: 88, glyph: ev.glyph,
weaponId: ev.id === "mang" ? "eternal_hour" : (ev.id === "liyaohui" || ev.id === "xiaoyahui" ? "relic_sheath" : "blade_silent"),
summonId: ev.id, note: ev.title
});
}
return makeAlly(name, "eternal", { base: 88, weaponId: "relic_sheath", note: "恒永者级" });
}
function starterAllies() {
return [
makeAlly("罗砚", "common", { base: 26, weaponId: "sword_std", note: "分部派来的第一个搭档。" }),
makeAlly("苏未眠", "advance", { base: 34, weaponId: "bow_std", note: "搜救团出身，跑得比谁都快。" })
];
}
const _statsCache = new Map();
function _statsKey(a) {
return (a.id || "?") + "|" + (a.level || 1) + "|" + (a.weaponId || "") + "|" +
(a.base || 0) + "|" + (a.atkBonus || 0) + "|" + (a.defBonus || 0) + "|" +
(a.speedBonus || 0) + "|" + (a.hpBonus || 0) + "|" + (a.coins || 0) + "|" +
(a.role || "") + "|" + BAL.playerHp + "|" + BAL.playerAtk;
}
function allyStats(a) {
const ck = _statsKey(a);
const hit = _statsCache.get(ck);
if (hit) return hit;
const r = _allyStatsRaw(a);
if (_statsCache.size > 400) _statsCache.clear();
_statsCache.set(ck, r);
return r;
}

const RARITY_POWER = {
common: 1.00, advance: 1.10, elite: 1.22, relic: 1.36,
eternal: 1.50, quasi: 1.58, super: 1.68, hero: 1.25
};
function rarityPower(a) {
const t = (a && (a.rarity || a.tier)) || "common";
return RARITY_POWER[t] || 1.00;
}


function accentColor(a) {
if (a && a.bwShine) return "#c9ced8";
return (a && a.color) || "#8b93ab";
}
function nameStyle(a) {
if (a && a.bwShine) {
return "color:transparent;background:linear-gradient(100deg,#000 0%,#666 12%,#fff 25%,#000 38%,#fff 50%,#000 62%,#fff 75%,#666 88%,#000 100%);" +
"background-size:400% 100%;-webkit-background-clip:text;background-clip:text;" +
"font-weight:700;animation:hengBwShine 4s linear infinite;text-shadow:0 0 6px rgba(255,255,255,.35)";
}
return "color:" + ((a && a.color) || "#ddd");
}
function _allyStatsRaw(a) {
const w = wpOf(a.weaponId);
const lv = a.level || 1;
const R = ROLE_MOD[roleOfAlly(a)] || ROLE_MOD.battle;
const Q = rarityPower(a); 
return {
hp: Math.round((a.base + lv * 46 + (w.atkBonus || 0) * 8 + (a.hpBonus || 0)) * BAL.playerHp * R.hp * Q),
atk: Math.round((8 + Math.floor(lv * 1.15) + (w.atkBonus || 0) + (a.atkBonus || 0)) * BAL.playerAtk * R.atk * Q),
def: Math.round((5 + Math.floor(lv * 0.55) + (a.defBonus || 0)) * R.def * Q),
spd: Math.round((6 + Math.floor(lv * 0.4) + (a.speedBonus || 0)) * R.spd * Q),
coins: Math.min(8, 4 + (w.coinCount || 0) + (a.coins || 0))
};
}
let _wpIndex = null;
function wpById(id) {
if (!_wpIndex) {
_wpIndex = {};
(DATA.weapons || []).forEach(function (w) { _wpIndex[w.id] = w; });
}
return _wpIndex[id] || null;
}
function wpOf(id) { return wpById(id) || (DATA.weapons && DATA.weapons[0]) || null; }
let _allyIndex = null, _allyVersion = 0, _allyBuiltAt = -1;
function invalidateAllyIndex() { _allyVersion++; }
function allyIndex() {
if (_allyIndex && _allyBuiltAt === _allyVersion) return _allyIndex;
_allyIndex = {};
((S && S.allies) || []).forEach(function (a) { if (a && a.id) _allyIndex[a.id] = a; });
_allyBuiltAt = _allyVersion;
return _allyIndex;
}
let _rafPending = false;
let _heroPoolCache = null, _heroPoolSig = "";
const HERO_ID = "hero_self";
const MAX_LEVEL = 200; 
const SCHOOL_CN2ID = { "剑":"sword", "弓":"bow", "刃":"blade", "枪":"spear", "斧":"axe",
"拳":"fist", "腿":"leg", "法":"arcane", "械":"tech", "医":"medic", "通用":"common" };
function schoolIdOf(w) {
if (!w) return null;
const cn = String(w.school || "");
for (const k in SCHOOL_CN2ID) if (cn.indexOf(k) >= 0) return SCHOOL_CN2ID[k];
return null;
}
const TYPE_CN2ROLE = { "拳":"battle", "腿":"battle", "剑":"battle", "刃":"battle",
"枪":"battle", "斧":"battle", "弓":"support", "法":"support",
"械":"support", "医":"defense", "盾":"defense" };
const HERO_TIER_STEPS = [
{ at: 1, rarity: "common" },
{ at: 15, rarity: "advance" },
{ at: 40, rarity: "elite" },
{ at: 80, rarity: "relic" },
{ at: 120, rarity: "eternal" },
{ at: 160, rarity: "quasi" }
];
const ROLE_NAMES = { battle: "战斗型", support: "辅助型", defense: "防御型" };
function roleOfAlly(a) {
if (!a) return "battle";
if (a.role && ROLE_NAMES[a.role]) return a.role;
const w = DATA.weapons.find((x) => x.id === (a.weaponId || ""));
const t = String((w && w.type) || "");
for (const k in TYPE_CN2ROLE) if (t.indexOf(k) >= 0) return TYPE_CN2ROLE[k];
const j = a.job || "";
if (j === "healer" || j === "mage") return "support";
if (j === "mechanic") return "defense";
return "battle";
}
const ROLE_MOD = {
battle: { atk: 1.06, hp: 1.00, def: 1.00, spd: 1.00 },
support: { atk: 0.94, hp: 1.00, def: 1.00, spd: 1.08 },
defense: { atk: 0.92, hp: 1.12, def: 1.18, spd: 0.96 }
};
function heroRarityFor(level) {
let r = "common";
HERO_TIER_STEPS.forEach((s) => { if ((level || 1) >= s.at) r = s.rarity; });
return r;
}
function heroSchools() {
if (!S) return [];
if (!S.heroSchools || !S.heroSchools.length) {
S.heroSchools = [S.school || "sword"];
}
return S.heroSchools.filter((x) => DATA.schools[x]).slice(0, 2);
}
function heroCanAddSchool() { return (S && S.level >= 15) && heroSchools().length < 2; }
function heroWeaponPool() {
const ids = heroSchools();
const sig = ids.join(",");
if (_heroPoolCache && _heroPoolSig === sig) return _heroPoolCache;
_heroPoolCache = DATA.weapons.filter((w) => {
const sid = schoolIdOf(w);
return sid && ids.indexOf(sid) >= 0;
});
_heroPoolSig = sig;
return _heroPoolCache;
}
function heroAlly() {
if (!S) return null;
const schools = heroSchools();
const pool = heroWeaponPool();
let w = DATA.weapons.find((x) => x.id === S.heroWeapon);
if (!w || pool.indexOf(w) < 0) w = pool[0] || DATA.weapons[0];
return {
id: HERO_ID,
name: S.name || "无名者",
tier: "hero", rarity: heroRarityFor(S.level || 1),
level: S.level || 1,
glyph: (S.name || "无").slice(0, 1),
color: "#ffe9a8",
base: 56,
hpBonus: 0, atkBonus: 6, defBonus: 3, speedBonus: 3, coins: 0,
job: (DATA.jobs[S && S.job] ? S.job : null) || weaponJob(w.id) || "warrior",
weaponId: w.id,
schools: schools.slice(),
loadout: null, summonId: null,
note: "专属角色 · 等级跟随本人 · 体系 " + schools.map((k) => DATA.schools[k].name).join(" / "),
hp: null, sp: 24, isHero: true
};
}
function heroSetWeapon(id) {
if (!S) return false;
const w = DATA.weapons.find((x) => x.id === id);
if (!w) return false;
const pool = heroWeaponPool();
if (pool.indexOf(w) < 0) { toast("这不是你体系里的武器（只能换本体系的）。"); return false; }
S.heroWeapon = id;
const a = (S.allies || []).find((x) => x.id === HERO_ID);
if (a) { const f = heroAlly(); a.weaponId = f.weaponId; a.job = f.job; a.note = f.note; }
saveGame(true);
toast("已换装：" + w.name);
return true;
}
function heroAddSchool(sid) {
if (!S) return false;
if (!DATA.schools[sid]) return false;
const cur = heroSchools();
if (cur.indexOf(sid) >= 0) { toast("已经有这个体系了。"); return false; }
if (!heroCanAddSchool()) {
toast("要到 15 级才能开第二个体系，而且最多两个。");
return false;
}
S.heroSchools = cur.concat([sid]);
syncHero();
saveGame(true);
toast("已开新体系：" + DATA.schools[sid].name);
return true;
}
function syncHero(addToSquad) {
if (!S) return null;
S.allies = S.allies || [];
let a = S.allies.find((x) => x.id === HERO_ID);
if (!a) {
a = heroAlly();
if (!a) return null;
S.allies.unshift(a);
if (addToSquad !== false) {
S.squad = S.squad || [];
if (S.squad.indexOf(HERO_ID) < 0) S.squad.unshift(HERO_ID);
}
return a;
}
const fresh = heroAlly();
a.name = fresh.name; a.glyph = fresh.glyph; a.level = fresh.level;
a.weaponId = fresh.weaponId; a.job = fresh.job;
a.base = fresh.base; a.atkBonus = fresh.atkBonus;
a.defBonus = fresh.defBonus; a.speedBonus = fresh.speedBonus;
if (addToSquad !== false) {
S.squad = S.squad || [];
if (S.squad.indexOf(HERO_ID) < 0) S.squad.unshift(HERO_ID);
}
return a;
}
function squadAllies(list) {
const src = Array.isArray(list) ? list : (S.squad || []);
const all = src.map((id) => allyById(id)).filter(Boolean);
if (!Array.isArray(list)) S.squad = all.map((a) => a.id);
return all;
}
function squadUnits(list) {
return squadAllies(list).map((a) => playerUnitFor(a));
}
function openSquad() {
if (!S) return;
const cap = squadCap();
let html = "<p style='color:var(--muted)'>上场最多 <b class='k'>" + cap + "</b> 名成员（随着列传推进而增加）。" +
"战斗中每名成员各自选择技能与目标，与来袭的敌人拼点。</p>";
html += "<h4>上场编队（" + (S.squad || []).length + " / " + cap + "）</h4><div class='codex-grid'>";
(S.squad || []).forEach((id) => {
const a = allyById(id);
if (!a) return;
const st = allyStats(a);
const w = wpOf(a.weaponId);
html += "<div class='codex-card hot' data-unfield='" + id + "'>" +
"<div class='cc-name' style='" + nameStyle(a) + "'>" + a.name + " <span style='font-size:10px'>［" + (DATA.recruit.tiers[a.tier] || {}).name + "］</span></div>" +
"<div class='cc-sub'>[" + (ROLE_NAMES[roleOfAlly(a)] || "战斗型") + "] Lv." + a.level + " ｜ 生命 " + st.hp + " ｜ 攻击等级 " + st.atk + " ｜ 速度 " + st.spd + " ｜ 硬币 " + st.coins + "</div>" +
"<div class='cc-sub'>兵装：" + w.name + "</div>" +
"<div class='cc-sub' style='color:var(--gold2)'>点击 → 撤下</div></div>";
});
html += "</div>";
const bench = (S.allies || []).filter((a) => (S.squad || []).indexOf(a.id) < 0);
html += "<h4>待命成员（" + bench.length + "）</h4><div class='codex-grid'>";
if (!bench.length) html += "<p class='muted'>没有其他人了。去「征召」招人。</p>";
const benchGroups = groupByLevel(bench);
benchGroups.forEach((grp) => {
html += "<div style='flex:1 1 100%;margin:8px 0 2px;color:var(--muted);font-size:12px;letter-spacing:2px'>" +
grp.band.name + "（" + grp.items.length + "）</div>";
grp.items.forEach((a) => {
const st = allyStats(a);
const w = wpOf(a.weaponId);
html += "<div class='codex-card' data-field='" + a.id + "'>" +
"<div class='cc-name' style='" + nameStyle(a) + "'>" + a.name + " <span style='font-size:10px'>［" + (DATA.recruit.tiers[a.tier] || {}).name + "］</span></div>" +
"<div class='cc-sub'>Lv." + a.level + " ｜ 生命 " + st.hp + " ｜ 攻击等级 " + st.atk + " ｜ 速度 " + st.spd + "</div>" +
"<div class='cc-sub'>兵装：" + w.name + (a.note ? " ｜ " + a.note : "") + "</div>" +
"<div class='cc-sub' style='color:var(--gold2)'>点击 → 上场</div></div>";
});
});
html += "</div>";
const bs = baseStats(S);
html += "<h4>档案本人</h4><p>" + S.name + " ｜ " + currentRank() + " ｜ Lv." + S.level +
" ｜ 生命 " + bs.hp + " ｜ 攻击等级 " + (12 + S.level * 2) + " ｜ 功勋 " + (S.honor || 0) + "</p>";
openModal("编队", html);
$$("#modalBody [data-field]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-field");
S.squad = S.squad || [];
if (S.squad.length >= squadCap()) { toast("编队已满（" + squadCap() + " 人）。先撤下一名。"); return; }
S.squad.push(id);
saveGame(true); renderHud(); openSquad();
};
});
$$("#modalBody [data-unfield]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-unfield");
S.squad = (S.squad || []).filter((x) => x !== id);
saveGame(true); renderHud(); openSquad();
};
});
}
function dissolveValue(a) {
if (!a) return 0;
if (a.id === HERO_ID) return 0; 
if (a.spBoss) return 0; 
const base = { common: 120, advance: 260, elite: 520, relic: 900,
eternal: 1600, quasi: 2000, super: 3200 }[a.rarity || a.tier] || 120;
const lv = Math.max(1, Math.floor(a.level || 1));
return Math.round(base + lv * 18 + (lv * lv) * 0.35);
}
function canDissolve(a) {
if (!a) return false;
if (a.id === HERO_ID) return false;
if (a.spBoss) return false;
return true;
}

let disSel = []; 
const DIS_TIERS = ["common", "advance", "elite", "relic", "eternal", "quasi", "super", "hero"];
function disTierOf(a) { return a.rarity || a.tier || "common"; }
function disTierName(t) {
const d = (DATA.recruit && DATA.recruit.tiers && DATA.recruit.tiers[t]) || {};
return d.name || t;
}
function disSelValue() {
return disSel.reduce(function (n, id) {
const a = (S.allies || []).find(function (x) { return x.id === id; });
return n + (a ? dissolveValue(a) : 0);
}, 0);
}

function disDo(ids, label) {
const list = (S.allies || []).filter(function (a) { return ids.indexOf(a.id) >= 0 && canDissolve(a); });
if (!list.length) { toast("没有可以溶解的角色。"); return 0; }
const total = list.reduce(function (n, a) { return n + dissolveValue(a); }, 0);
const kill = list.map(function (a) { return a.id; });
S.honor = (S.honor || 0) + total;
S.allies = (S.allies || []).filter(function (a) { return kill.indexOf(a.id) < 0; });
invalidateAllyIndex();

S.squad = (S.squad || []).filter(function (x) { return kill.indexOf(x) < 0; });
if (Array.isArray(S.spSquad)) S.spSquad = S.spSquad.filter(function (x) { return kill.indexOf(x) < 0; });
if (!S.squad.length && (S.allies || []).length) S.squad = [S.allies[0].id];
disSel = disSel.filter(function (x) { return kill.indexOf(x) < 0; });
saveGame(true);
toast("已溶解 " + list.length + " 名" + (label ? "（" + label + "）" : "") + "，+" + total + " 功勋");
return total;
}
function openDissolve(fresh) {
if (!S) return;
if (fresh !== false) disSel = []; 
S.allies = S.allies || [];
const list = (S.allies || []).filter(function (a) { return a.id !== HERO_ID; });

const alive = {};
(S.allies || []).forEach(function (a) { alive[a.id] = 1; });
disSel = disSel.filter(function (id) { return alive[id]; });
let html = "<p style='color:var(--muted)'>" + tr("把不要的角色交回组织，组织按他的等级与资历折成功勋返还。") +
tr("溶解后") + "<b style='color:var(--bad)'>" + tr("无法恢复") + "</b>" +
tr("。专属角色与全力奖励角色不能溶解。") + "<br>" +
tr("点卡片可以多选。") + "</p>";
html += "<div class='stat-grid'>" +
box(tr("当前功勋"), String(S.honor || 0)) +
box(tr("当前称号"), S.title ? S.title : "—") +
box(tr("可溶解"), String(list.length) + " " + tr("名")) +
box(tr("已选"), disSel.length + " " + tr("名")) +
box(tr("预计返还"), "+" + disSelValue()) +
"</div>";
if (disSel.length) {
html += "<p><button class='btn btn-primary' data-disdo='sel'>" + tr("溶 解 选 中") + "（" + disSel.length + "）</button> " +
"<button class='btn btn-tiny' data-disdo='clear'>" + tr("清 空 选 择") + "</button></p>";
} else {
html += "<p style='color:var(--muted)'>" + tr("还没选。点下面的卡片多选，或用各等级的一键按钮。") + "</p>";
}
if (!list.length) {
html += "<p class='muted'>" + tr("没有可以溶解的角色。") + "</p>";
} else {

DIS_TIERS.forEach(function (t) {
const group = list.filter(function (a) { return disTierOf(a) === t; });
if (!group.length) return;
const free = group.filter(canDissolve);
const total = free.reduce(function (n, a) { return n + dissolveValue(a); }, 0);
html += "<div style='display:flex;align-items:center;gap:8px;margin:12px 0 2px'>" +
"<span style='color:var(--muted);font-size:12px;letter-spacing:2px'>" +
tr(disTierName(t)) + "（" + group.length + "）</span>" +
(free.length
? "<button class='btn btn-tiny btn-danger' data-distier='" + t + "'>" +
tr("一键溶解本级") + "（" + free.length + " · +" + total + "）</button>"
: "<span style='color:var(--muted);font-size:12px'>" + tr("本级无可溶解") + "</span>") +
"</div>";
html += "<div class='codex-grid'>";
group.forEach(function (a) {
const v = dissolveValue(a);
const locked = !canDissolve(a);
const on = disSel.indexOf(a.id) >= 0;
html += "<div class='codex-card" + (locked ? " locked" : "") + (on ? " hot" : "") + "'" +
(locked ? "" : " data-dispick='" + a.id + "'") + ">" +
"<div class='cc-name' style='" + nameStyle(a) + "'>" +
(on ? "✔ " : "") + a.name + "</div>" +
"<div class='cc-sub'>" + (ROLE_NAMES[roleOfAlly(a)] || tr("战斗型")) + " ｜ Lv." + a.level + "</div>" +
(locked
? "<div class='cc-sub' style='color:var(--muted)'>" + tr("不可溶解") + "</div>"
: "<div class='cc-sub' style='color:var(--gold2)'>" + tr("返还") + " " + v + " " + tr("功勋") + "</div>") +
"</div>";
});
html += "</div>";
});
}
openModal(tr("溶解"), html);

$$("#modalBody [data-dispick]").forEach(function (c) {
c.onclick = function (ev) {
if (ev && ev.stopPropagation) ev.stopPropagation();
const id = c.getAttribute("data-dispick");
const i = disSel.indexOf(id);
if (i >= 0) disSel.splice(i, 1); else disSel.push(id);
openDissolve(false);
};
});

$$("#modalBody [data-distier]").forEach(function (b) {
b.onclick = function (ev) {
if (ev && ev.stopPropagation) ev.stopPropagation();
const t = b.getAttribute("data-distier");
const targets = (S.allies || []).filter(function (a) { return canDissolve(a) && disTierOf(a) === t; });
if (!targets.length) { toast("本级没有可以溶解的。"); return; }
const total = targets.reduce(function (n, a) { return n + dissolveValue(a); }, 0);
askConfirm(tr("批量溶解"),
tr("溶解全部") + " <b>" + targets.length + "</b> " + tr("名") + tr(disTierName(t)) + "？<br>" +
tr("共返还") + " <b>" + total + "</b> " + tr("功勋") + "。<br><br>" +
"<span style='color:var(--bad)'>" + tr("此操作不可恢复。") + "</span>",
tr("全 部 溶 解"),
function () { disDo(targets.map(function (a) { return a.id; }), tr(disTierName(t))); openDissolve(false); },
true);
};
});

$$("#modalBody [data-disdo]").forEach(function (b) {
b.onclick = function (ev) {
if (ev && ev.stopPropagation) ev.stopPropagation();
const act = b.getAttribute("data-disdo");
if (act === "clear") { disSel = []; openDissolve(false); return; }
if (act !== "sel") return;
const targets = (S.allies || []).filter(function (a) { return disSel.indexOf(a.id) >= 0 && canDissolve(a); });
if (!targets.length) { toast("选中的都不能溶解。"); return; }
const total = targets.reduce(function (n, a) { return n + dissolveValue(a); }, 0);
askConfirm(tr("批量溶解"),
tr("溶解选中的") + " <b>" + targets.length + "</b> " + tr("名") + "？<br>" +
tr("共返还") + " <b>" + total + "</b> " + tr("功勋") + "。<br><br>" +
"<span style='color:var(--bad)'>" + tr("此操作不可恢复。") + "</span>",
tr("溶 解"),
function () { disDo(targets.map(function (a) { return a.id; }), ""); openDissolve(false); },
true);
};
});
}
function rollRarity() {
const r = DATA.recruit.rates;
const x = Math.random();
if (x < r.eternal) return "eternal";
if (x < r.eternal + r.relic) return "relic";
if (x < r.eternal + r.relic + r.elite) return "elite";
if (x < r.eternal + r.relic + r.elite + r.advance) return "advance";
return "common";
}
function rollAlly(forceEternal) {
const name = (function () {
if (forceEternal) return DATA.recruit.eternalPool[Math.floor(Math.random() * DATA.recruit.eternalPool.length)];
const rar = rollRarity();
if (rar === "eternal") return DATA.recruit.eternalPool[Math.floor(Math.random() * DATA.recruit.eternalPool.length)];
const pool = DATA.recruit.pool[rar] || DATA.recruit.pool.common;
const nm = pool[Math.floor(Math.random() * pool.length)];
return nm;
})();
const isEternal = DATA.recruit.eternalPool.indexOf(name) >= 0;
if (isEternal) return eternalAlly(name);
const jr = randomJob();
const wpool = DATA.weaponJobs ? jobWeapons(jr) : [];
const wPick = wpool.length ? wpool[Math.floor(Math.random() * wpool.length)] : null;
const rar = (function () {
for (const k of ["advance", "elite", "relic"]) if ((DATA.recruit.pool[k] || []).indexOf(name) >= 0) return k;
return "common";
})();
return makeAlly(name, rar, { job: jr, weaponId: wPick || "fist_bare",
note: (DATA.recruit.tiers[rar] || {}).name + " · 分部调人" });
}
function doRecruit(times) {
const cost = times === 10 ? DATA.recruit.costTen : DATA.recruit.costSingle;
if ((S.honor || 0) < cost) { toast("功勋不足（需要 " + cost + "）。去无垠厅刷怪，或推进列传。"); return; }
S.honor -= cost;
const got = [];
for (let i = 0; i < times; i++) {
S.pulls = (S.pulls || 0) + 1;
let force = false;
if (S.pulls >= (DATA.recruit.pityAt || 80)) { force = true; S.pulls = 0; }
if (times === 10 && i === 9 && !got.some((a) => a.tier === "elite" || a.tier === "relic" || a.tier === "eternal")) {
force = false;
let a = rollAlly(false);
let guard = 0;
while (a.tier !== "elite" && a.tier !== "relic" && a.tier !== "eternal" && guard++ < 60) a = rollAlly(false);
got.push(a);
continue;
}
got.push(rollAlly(force));
}
got.forEach((a) => {
if (a.tier === "eternal" && (S.allies || []).some((x) => x.id === a.id)) {
S.honor += 400;
a.dupe = true;
return;
}
S.allies = S.allies || [];
S.allies.push(a);
if (a.tier === "eternal" && a.summonId && DATA.ever.some((e) => e.id === a.summonId)) {
S.allied = S.allied || {};
S.allied[a.summonId] = true;
if (!S.summonId) S.summonId = a.summonId;
}
});
S.squad = S.squad || [];
got.forEach((a) => {
if (!a.dupe && S.squad.length < squadCap()) S.squad.push(a.id);
});
saveGame(true);
renderHud();
openRecruit(got);
}
function openRecruit(newOnes) {
if (!S) return;
S.allies = S.allies || [];
S.pulls = S.pulls || 0;
const r = DATA.recruit.rates;
let html = "<p style='color:var(--muted)'>" + DATA.recruit.intro + "</p>";
html += "<p>功勋 <b class='k'>" + (S.honor || 0) + "</b> ｜ 已招募 " + S.allies.length + " 人 ｜ 距离保底还需 " +
Math.max(0, (DATA.recruit.pityAt || 80) - S.pulls) + " 次</p>";
html += "<h4>出现概率</h4><div class='stat-grid'>";
["eternal", "relic", "elite", "advance", "common"].forEach((k) => {
const t = DATA.recruit.tiers[k];
html += "<div class='stat-box'><div class='s-name' style='color:" + t.color + "'>" + t.name + "</div>" +
"<div class='s-val'>" + (r[k] * 100).toFixed(0) + "%</div></div>";
});
html += "</div>";
html += "<p style='color:var(--gold2)'>恒永者级只有 " + (r.eternal * 100).toFixed(0) +
"%，且每 " + (DATA.recruit.pityAt || 80) + " 次必得一位——名单上就是组织档案里那十一位。</p>";
if (newOnes && newOnes.length) {
html += "<h4>本次征召结果</h4><div class='codex-grid'>";
newOnes.forEach((a) => {
const t = DATA.recruit.tiers[a.tier] || {};
html += "<div class='codex-card' style='border-color:" + accentColor(a) + "'>" +
"<div class='cc-name' style='" + nameStyle(a) + "'>" + a.name + "［" + t.name + "］" + (a.dupe ? "（重复，折算400功勋）" : "") + "</div>" +
"<div class='cc-sub'>" + (a.note || "") + "</div>" +
"<div class='cc-sub'>攻击等级 " + allyStats(a).atk + " ｜ 生命 " + allyStats(a).hp + " ｜ 速度 " + allyStats(a).spd + "</div></div>";
});
html += "</div>";
}
html += "<div style='display:flex;gap:10px;margin-top:18px;flex-wrap:wrap'>" +
"<button class='btn' data-roll='1'>征召 1 次（" + DATA.recruit.costSingle + " 功勋）</button>" +
"<button class='btn btn-primary' data-roll='10'>征召 10 次（" + DATA.recruit.costTen + " 功勋 · 保底精锐以上）</button>" +
"<button class='btn btn-ghost' data-act='close-modal'>关闭</button></div>";
openModal(DATA.recruit.name, html);
$$("#modalBody [data-roll]").forEach((c) => {
c.onclick = () => doRecruit(parseInt(c.getAttribute("data-roll"), 10));
});
}
function openArmory() {
if (!S) return;
S.allyWeapon = S.allyWeapon || {};
if (S.weaponOf) { S.allyWeapon = S.allyWeapon || {}; }
S.weapons = S.weapons || [];
S.armoryTarget = S.armoryTarget || ((S.squad || [])[0] || null);
const target = allyById(S.armoryTarget) || (S.allies || [])[0] || null;
let html = "<p style='color:var(--muted)'>兵装决定<b>攻击等级</b>与<b>技能硬币数</b>——硬币越多，拼点越耐打。" +
"已解锁的不必再买。</p>";
html += "<h4>为谁装备</h4><div class='codex-grid'>";
(S.allies || []).forEach((a) => {
const sel = target && a.id === target.id;
html += "<div class='codex-card" + (sel ? " hot" : "") + "' data-armtarget='" + a.id + "'>" +
"<div class='cc-name' style='" + nameStyle(a) + "'>" + a.name + (sel ? " ◆" : "") + "</div>" +
"<div class='cc-sub'>" + ((DATA.weapons.find((w) => w.id === (S.weaponOf || {})[a.id]) || {}).name || "赤手（拳·腿）") + "</div></div>";
});
html += "</div>";
if (!target) html += "<p class='muted'>先招人。</p>";
html += "<h4>兵装库（功勋 " + (S.honor || 0) + "）</h4><div class='codex-grid'>";
if (target) {
const ji = jobInfo(jobOfAlly(target));
html += "<p style='color:var(--muted)'>当前成员：<b style='color:" + (ji.color || "#fff") + "'>" +
target.name + "</b>　职业：<b class='k'>" + ji.glyph + " " + ji.name + "</b>　·　" + (ji.desc || "") +
"<br>不同职业的兵装不通用 —— 非本职业的兵装会被标出并拒绝装备。</p>";
}
DATA.weapons.forEach((w) => {
const owned = w.id === "fist_bare" || (S.weapons || []).indexOf(w.id) >= 0;
const equipped = !!target && (((S.weaponOf || {})[target.id] || target.weaponId || "fist_bare") === w.id);
const price = canBuyWeapon(w);
const rar = DATA.weaponRarity[w.rarity] || {};
const jobW = DATA.weaponJobs[w.id] || null;
const jobNames = jobW ? weaponJobsOf(w.id).map((x) => (DATA.jobs[x] || {}).name).join(" / ") : "通用";
const allowed = !target || weaponUsableBy(w.id, jobOfAlly(target));
html += "<div class='codex-card" + (owned ? "" : " locked") + (equipped ? " hot" : "") +
(allowed ? "" : " job-block") + "' data-weapon='" + w.id + "'>" +
"<div class='cc-name' style='color:" + (rar.color || "#fff") + "'>" + w.name + (equipped ? " ◆装备中" : "") + "</div>" +
"<div class='cc-sub'>攻击等级 +" + (w.atkBonus || 0) + " ｜ 硬币 +" + (w.coinCount || 0) + " ｜ 理智 " + (w.sanity >= 0 ? "+" : "") + w.sanity + "</div>" +
"<div class='cc-sub' style='color:var(--gold)'>职业：" + jobNames + (allowed ? "" : "　✗ 非本职业") + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + w.desc + "</div>" +
"<div class='cc-sub' style='color:var(--gold2)'>" +
(!allowed ? "该职业无法装备" : (owned ? "点击 → 装备" : "点击 → " + price + " 功勋解锁")) + "</div></div>";
});
html += "</div>";
openModal("兵装库", html);
$$("#modalBody [data-armtarget]").forEach((c) => {
c.onclick = () => { S.armoryTarget = c.getAttribute("data-armtarget"); openArmory(); };
});
$$("#modalBody [data-weapon]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-weapon");
const w = DATA.weapons.find((x) => x.id === id);
if (!w) return;
if (!target) { toast("没有可装备的成员。"); return; }
if (!weaponUsableBy(id, jobOfAlly(target))) {
const ji = jobInfo(jobOfAlly(target));
const need = weaponJobsOf(id).map((x) => (DATA.jobs[x] || {}).name).join(" / ");
toast("【" + ji.name + "】无法装备「" + w.name + "」——该兵装属于：" + need);
return;
}
const owned = id === "fist_bare" || (S.weapons || []).indexOf(id) >= 0;
if (!owned) {
const price = canBuyWeapon(w);
if ((S.honor || 0) < price) { toast("功勋不足（需要 " + price + "）。"); return; }
S.honor -= price;
S.weapons.push(id);
toast("解锁兵装：" + w.name);
}
S.weaponOf = S.weaponOf || {};
S.weaponOf[target.id] = id;
target.weaponId = id;
toast(target.name + " 装备了 " + w.name);
saveGame(true); renderHud(); openArmory();
};
});
}
function canBuyWeapon(w) {
return w.rarity === "eternal" ? 6000 : w.rarity === "relic" ? 2400 : w.rarity === "elite" ? 1100 : 500;
}


function applyJar(jarId, allyId, count) {
const it = DATA.items.find((x) => x.id === jarId);
const a = (S.allies || []).find((x) => x.id === allyId);
if (!it || !a) { toast(tr("选择有误。")); return 0; }
const have = (S.bag || {})[jarId] || 0;
if (!have) { toast(tr("没有这个道具了。")); return 0; }
if (a.level >= MAX_LEVEL) { toast(a.name + " " + tr("已经满级了。")); return 0; }

let want = Math.max(1, Math.floor(count || 1));
want = Math.min(want, have);
const before = a.level;
let used = 0;
let amount = 0;
let ups = 0;
if (it.kind === "lvup") {
const per = it.val || 1;
const need = MAX_LEVEL - a.level;

used = Math.min(want, Math.ceil(need / per));
a.level = Math.min(MAX_LEVEL, a.level + per * used);
if (a.level >= MAX_LEVEL) { a.level = MAX_LEVEL; a.exp = 0; }
ups = a.level - before;
} else {
const per = it.val || 0;

while (used < want && a.level < MAX_LEVEL) {
allyGiveExp(a, per);
amount += per;
used++;
}
ups = a.level - before;
}
if (used <= 0) { toast(a.name + " " + tr("已经满级了。")); return 0; }

S.bag[jarId] = have - used;
if (S.bag[jarId] <= 0) delete S.bag[jarId];
if (a.id === HERO_ID) {
S.level = Math.max(S.level || 1, a.level);
S.exp = a.exp || 0;
syncHero();
}
saveGame(true);
toast(a.name + "：" + tr(it.name) + " ×" + used + " → " +
(it.kind === "lvup"
? tr("等级") + " " + before + " → " + a.level + "（+" + ups + "）"
: tr("经验") + " +" + amount + (ups > 0 ? "，" + tr("等级") + " " + before + " → " + a.level + "（+" + ups + "）" : "")));

if (UI.jarPick) {
UI.jarPick.count = 1;
if (((S.bag || {})[jarId] || 0) > 0) { openJarPicker(); return amount; }
}
UI.jarPick = null;
openBag();
return amount; 
}
function openJarPicker() {
const P = UI.jarPick;
if (!P) return;
const it = DATA.items.find((x) => x.id === P.jar);
if (!it) return;
const list = jarTargets();
if (!list.some((a) => a.id === P.ally)) P.ally = list.length ? list[0].id : null;
const target = list.find((a) => a.id === P.ally);
const have = (S.bag || {})[P.jar] || 0;
if (!P.count || P.count < 1) P.count = 1;
if (P.count > have) P.count = Math.max(1, have);
let html = "<p style='color:var(--muted)'>" + tr(it.name) + "：" + tr(it.desc).replace(/\n/g, "<br>") + "</p>";
html += "<p>" + tr("当前持有") + " <b class='k'>×" + have + "</b>。" + tr("选择要喂给哪位角色：") + "</p>";
html += "<div class='codex-grid'>";
const groups = groupByLevel(list);
groups.forEach((grp) => {
html += "<div style='flex:1 1 100%;margin:8px 0 2px;color:var(--muted);font-size:12px;letter-spacing:2px'>" +
tr(grp.band.name) + "（" + grp.items.length + "）</div>";
grp.items.forEach((a) => {
const st = allyStats(a);
const on = (a.id === P.ally);
const role = (ROLE_NAMES[roleOfAlly(a)] || tr("战斗型"));
html += "<div class='codex-card" + (on ? " hot" : "") + "' data-jarpick='" + a.id + "'" +
(on ? " style='border-color:var(--gold);background:rgba(214,178,90,.12)'" : "") + ">" +
"<div class='cc-name' style='" + nameStyle(a) + "'>" + a.name + (on ? " ◆" : "") + "</div>" +
"<div class='cc-sub'>" + role + " ｜ Lv." + a.level + " ｜ " +
tr((DATA.recruit.tiers[a.rarity] || DATA.recruit.tiers[a.tier] || {}).name || "") + "</div>" +
"<div class='cc-sub'>" + tr("生命") + " " + st.hp + " ｜ " + tr("攻击等级") + " " + st.atk + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + tr("经验") + " " + Math.floor(a.exp || 0) + " / " +
(a.level >= MAX_LEVEL ? tr("满级") : expNeeded(a.level)) + "</div></div>";
});
});
html += "</div>";

const maxUse = Math.max(1, Math.min(have, it.kind === "lvup"
? Math.max(1, Math.ceil((MAX_LEVEL - (target ? target.level : 1)) / (it.val || 1)))
: have));
html += "<div class='set-row' style='margin-top:12px'><span>" + tr("使用数量") + "</span>" +
"<input type='range' id='jarCount' min='1' max='" + maxUse + "' value='" + Math.min(P.count, maxUse) + "'>" +
"<b class='k' id='jarCountNum' style='min-width:52px;text-align:right'>×" + Math.min(P.count, maxUse) + "</b></div>";
html += "<p><button class='btn btn-tiny' data-jarq='" + Math.ceil(maxUse / 2) + "'>" + tr("一 半") + "</button> " +
"<button class='btn btn-tiny' data-jarq='" + maxUse + "'>" + tr("全 部") + "（×" + maxUse + "）</button> " +
"<button class='btn btn-tiny' data-jarq='1'>" + tr("×1") + "</button></p>";
if (target) {
const cnt = Math.min(P.count, maxUse);
if (it.kind === "lvup") {
const canUps = Math.min((it.val || 1) * cnt, MAX_LEVEL - target.level);
const real = Math.min(cnt, Math.ceil((MAX_LEVEL - target.level) / (it.val || 1)));
html += "<p style='color:var(--gold2)'>" + tr("给") + " <b>" + target.name + "</b> " + tr("使用") + " ×" + cnt +
" → " + tr("等级") + " " + target.level + " → " + Math.min(MAX_LEVEL, target.level + canUps) +
(canUps > 0 ? "（+" + canUps + "）" : "（" + tr("已满级") + "）") +
(real < cnt ? "<br><span style='color:var(--muted)'>" + tr("只需") + " " + real + " " + tr("个就够，多的不会扣。") + "</span>" : "") +
"</p>";
} else {
const amount = (it.val || 0) * cnt;
let sim = target.level, rem = (target.exp || 0) + amount, ups = 0;
let guard = 0;
while (sim < MAX_LEVEL && rem >= expNeeded(sim) && guard++ < 999) { rem -= expNeeded(sim); sim++; ups++; }
if (sim >= MAX_LEVEL) { sim = MAX_LEVEL; rem = 0; }
html += "<p style='color:var(--gold2)'>" + tr("给") + " <b>" + target.name + "</b> " + tr("使用") + " ×" + cnt +
" → " + tr("经验") + " +" + amount + "，" + tr("等级") + " " + target.level + " → " + sim +
(ups > 0 ? "（+" + ups + "）" : "") + "</p>";
}
} else {
html += "<p class='muted'>" + tr("没有可以使用的角色。") + "</p>";
}
html += "<p><button class='btn btn-primary' data-jarok='1'>" + tr("确 定 使 用") + "</button> " +
"<button class='btn btn-tiny' data-jarcancel='1'>" + tr("关 闭") + "</button></p>";
openModal(tr("使用道具"), html);
$$("#modalBody [data-jarpick]").forEach((c) => {
c.onclick = () => { P.ally = c.getAttribute("data-jarpick"); P.count = 1; openJarPicker(); };
});
const range = document.getElementById("jarCount");
const num = document.getElementById("jarCountNum");
if (range) {
range.oninput = () => {
P.count = parseInt(range.value, 10) || 1;
if (num) num.textContent = "×" + P.count;
openJarPicker(); 
};
}
$$("#modalBody [data-jarq]").forEach((b) => {
b.onclick = () => { P.count = parseInt(b.getAttribute("data-jarq"), 10) || 1; openJarPicker(); };
});
$$("#modalBody [data-jarok]").forEach((c) => {
c.onclick = () => applyJar(P.jar, P.ally, P.count);
});
$$("#modalBody [data-jarcancel]").forEach((c) => {
c.onclick = () => { UI.jarPick = null; openBag(); };
});
}
function openBag() {
if (!S) return;
S.bag = S.bag || {};
let html = "<p style='color:var(--muted)'>道具在战斗里可用（占用该成员的编成，不额外耗回合）。击败敌人与刷怪都会掉落。" +
"经验罐可以在这里直接使用。</p>";
html += "<h4>持行库</h4><div class='codex-grid'>";
const owned = DATA.items.filter((it) => (S.bag[it.id] || 0) > 0);
if (!owned.length) html += "<p class='muted'>背包是空的。去无垠厅刷怪，或推进列传。</p>";
owned.forEach((it) => {
const useBtn = (it.kind === "exp" || it.kind === "lvup")
? "<div class='cc-sub'><button class='btn btn-tiny btn-primary' data-usejar='" + it.id + "'>使 用</button></div>"
: "";
html += "<div class='codex-card'><div class='cc-name'>" + it.name + " ×" + S.bag[it.id] + "</div>" +
"<div class='cc-sub'>" + (DATA.weaponRarity[it.rarity] || {}).name + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + it.desc + "</div>" + useBtn + "</div>";
});
html += "</div><h4>可用道具一览</h4><div class='codex-grid'>";
DATA.items.filter((it) => !(S.bag[it.id] > 0)).forEach((it) => {
html += "<div class='codex-card locked'><div class='cc-name'>" + it.name + "</div>" +
"<div class='cc-sub'>" + (DATA.weaponRarity[it.rarity] || {}).name + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + it.desc + "</div></div>";
});
html += "</div>";
html += "<p style='margin-top:14px'><button class='btn btn-tiny' data-buykit='1'>补给：医疗包 +2（200 功勋）</button> " +
"<button class='btn btn-tiny' data-buykit='2'>补给：思晓雅抄的书 +2（300 功勋）</button></p>";
html += "<p style='margin-top:6px'><b class='k'>恒组织科技部 · 经验罐</b>（随时可用，按当前等级需求结算）</p>" +
"<p><button class='btn btn-tiny' data-buyjar='jar_low'>低级经验罐 ×1（400 功勋）</button> " +
"<button class='btn btn-tiny' data-buyjar='jar_mid'>中级经验罐 ×1（1000 功勋）</button> " +
"<button class='btn btn-tiny' data-buyjar='jar_high'>高级经验罐 ×1（2200 功勋）</button></p>";
html += "<p><button class='btn btn-tiny' data-buyjar='jar_t1'>稀释后的时间经验罐 ×1（6000 功勋）</button> " +
"<span style='color:var(--muted)'>非稀释的时间经验罐只能在真实模式的第 3、4、5 关打到。</span></p>";
openModal("道具", html);
$$("#modalBody [data-buykit]").forEach((c) => {
c.onclick = () => {
const kind = c.getAttribute("data-buykit");
const cost = kind === "1" ? 200 : 300;
const ids = kind === "1" ? ["kit_std"] : ["sp_tea"];
if ((S.honor || 0) < cost) { toast("功勋不足。"); return; }
S.honor -= cost;
ids.forEach((id) => gainItem(id, 2));
toast("补给已入库。");
saveGame(true); renderHud(); openBag();
};
});
$$("#modalBody [data-usejar]").forEach((c) => {
c.onclick = () => giveExpJar(c.getAttribute("data-usejar"));
});

const JAR_COST = { jar_low: 400, jar_mid: 1000, jar_high: 2200, jar_t1: 6000, jar_t5: 30000 };
$$("#modalBody [data-buyjar]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-buyjar");
const cost = JAR_COST[id] || 400;
if ((S.honor || 0) < cost) { toast("功勋不足（需要 " + cost + "）。"); return; }
S.honor -= cost;
gainItem(id, 1);
toast("已入库：" + (DATA.items.find((x) => x.id === id) || {}).name);
saveGame(true); renderHud(); openBag();
};
});
}
function openParty() {
if (!S) return;
const bs = baseStats(S);
const allies = alliedList();
let html = "<h4>档案</h4><p>" +
"<span class='k'>" + S.name + "</span> ｜ " + currentRank() +
" ｜ Lv." + S.level + " ｜ 经验 " + Math.floor(S.exp) + "/" + expNeeded(S.level) + "</p>" +
"<p>" + DATA.origins[S.origin].name + " · " + DATA.schools[S.school].name + " · " + DATA.oaths[S.oath].name + "</p>" +
"<h4>属性</h4><div class='stat-grid'>" +
box("生命上限", bs.hp) + box("力量", bs.atk) + box("防御", bs.def) +
box("速度", bs.spd) + box("意志", bs.will) + box("潜能点", S.points) + "</div>";
if (S.points > 0) {
html += "<div class='point-note'>你有 <b>" + S.points + "</b> 点潜能点。" +
(["atk","def","spd","will"].map((k) =>
'<button class="btn btn-tiny" style="margin:4px" data-spend="' + k + '">' +
({atk:"力量",def:"防御",spd:"速度",will:"意志"})[k] + " +1</button>").join("")) + "</div>";
}
html += "<h4>本命结缘（降神）</h4>";
if (!allies.length) {
html += "<p style='color:var(--muted)'>你还没有与任何恒永者结缘。走完每一传，你会在关键处得到他们的「降神」。</p>";
} else {
html += "<p style='color:var(--muted)'>选择一位作为本命结缘者。战斗中可呼唤其「降神」，代价是自身承受一部分损耗。</p><div class='codex-grid'>";
allies.forEach((id) => {
const e = DATA.ever.find((x) => x.id === id);
if (!e) return;
const sel = S.summonId === id;
html += "<div class='codex-card' data-summon=\"" + id + "\" style='" + (sel ? "border-color:var(--gold);background:rgba(214,178,90,.12)" : "") + "'>" +
"<div class='cc-name'>" + e.no + " · " + e.name + (sel ? " ◆本命" : "") + "</div>" +
"<div class='cc-sub'>" + e.summon.name + "（自损 " + Math.round(e.summon.selfCost * 100) + "%）</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + e.title + "</div></div>";
});
html += "</div>";
}
openModal("队伍与结缘", html);
$$("#modalBody [data-spend]").forEach((b) => {
b.onclick = () => {
if (S.points <= 0) return;
S.points--;
S.spent[b.getAttribute("data-spend")]++;
const nb = baseStats(S); S.hp = Math.min(S.hp + 9, nb.hp);
toast("潜能点已分配。");
renderHud(); openParty();
};
});
$$("#modalBody [data-summon]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-summon");
S.summonId = (S.summonId === id) ? null : id;
const e = DATA.ever.find((x) => x.id === id);
toast(S.summonId ? ("本命结缘：" + e.summon.name) : "已解除本命结缘。");
saveGame(true); renderHud(); openParty();
};
});
}
function box(name, val) {
return "<div class='stat-box'><div class='s-name'>" + name + "</div><div class='s-val'>" + val + "</div></div>";
}
function abilityCard(id, mode) {
const a = DATA.abilities[id];
const known = isUnlocked(id);
const on = S.equipped.indexOf(id) >= 0;
const cls = "codex-card" + (known ? "" : " locked") + (on ? " hot" : "");
const tag = "[" + (a.school || "技") + "]";
const meta = (a.cost ? "意志 " + a.cost : "免费") + (a.cd ? " ｜ 冷却 " + a.cd : "") +
(a.unlock ? " ｜ 需 Lv." + a.unlock : "");
return "<div class='" + cls + "' data-abil=\"" + id + "\"" + (mode === "pool" && on ? " style='border-color:var(--gold);background:rgba(214,178,90,.12)'" : "") + ">" +
"<div class='cc-name'>" + tag + " " + a.name + (on ? " ◆" : "") + "</div>" +
"<div class='cc-sub'>" + meta + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + a.desc + "</div></div>";
}
function openSkills() {
if (!S) return;
equipList();
const pool = knownAbilities();
let html = "<p style='color:var(--muted)'>技能栏 <b style='color:var(--gold2)'>" + S.equipped.length + " / " + MAX_EQUIP +
"</b>。点左边的技能换上，点右边已装备的技能卸下。战斗中只能用技能栏里的技能。</p>";
(function () {
const hs = heroSchools();
const pool = heroWeaponPool();
const cur = (heroAlly() || {}).weaponId;
html += "<h4>专属角色 · 体系与武器（" + (S.name || "无名者") + "）</h4>";
html += "<p style='color:var(--muted)'>体系 " + hs.length + " / 2。" +
(heroCanAddSchool() ? "到 15 级可以再开一个体系（最多两个）。" : "（已满或未到 15 级）") +
" 武器只能换本体系匹配的。</p>";
html += "<div class='codex-grid'>";
hs.forEach((sid) => {
const sc = DATA.schools[sid];
html += "<div class='codex-card'><div class='cc-name'>" + sc.name + "</div>" +
"<div class='cc-sub'>核心：" + sc.core + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + sc.desc + "</div></div>";
});
if (heroCanAddSchool()) {
DATA.schoolOrder === undefined;
Object.keys(DATA.schools).forEach((sid) => {
if (hs.indexOf(sid) >= 0) return;
html += "<div class='codex-card locked'><div class='cc-name'>+ " + DATA.schools[sid].name + "</div>" +
"<div class='cc-sub'><button class='btn btn-tiny btn-primary' data-addschool='" + sid + "'>开 此 体 系</button></div></div>";
});
}
html += "</div>";
html += "<div class='codex-grid'>";
pool.forEach((w) => {
const on = (w.id === cur);
html += "<div class='codex-card" + (on ? " hot" : "") + "'" +
(on ? " style='border-color:var(--gold);background:rgba(214,178,90,.12)'" : "") + ">" +
"<div class='cc-name'>" + w.name + (on ? " ◆" : "") + "</div>" +
"<div class='cc-sub'>攻击 +" + (w.atkBonus || 0) + " ｜ 硬币 " + (w.coinCount || 0) + "</div>" +
(on ? "<div class='cc-sub' style='color:var(--gold2)'>当前武器</div>"
: "<div class='cc-sub'><button class='btn btn-tiny' data-heroweapon='" + w.id + "'>换 上</button></div>") +
"</div>";
});
html += "</div>";
})();
html += "<h4>已装备 · 战斗技能栏</h4><div class='codex-grid'>";
if (!S.equipped.length) html += "<p class='muted'>（空）</p>";
S.equipped.forEach((id) => { html += abilityCard(id, "equipped"); });
html += "</div>";
html += "<h4>仓库 · 已解锁 " + pool.length + " 个</h4><div class='codex-grid'>";
pool.forEach((id) => { html += abilityCard(id, "pool"); });
html += "</div>";
const locked = abilityOrder().filter((id) => !isUnlocked(id));
if (locked.length) {
html += "<h4>尚未解锁</h4><div class='codex-grid'>";
locked.forEach((id) => {
const a = DATA.abilities[id];
html += "<div class='codex-card locked'><div class='cc-name'>[" + (a.school || "技") + "] " + a.name + "</div>" +
"<div class='cc-sub'>需 Lv." + a.unlock + "</div><div class='cc-sub' style='color:var(--muted)'>" + a.desc + "</div></div>";
});
html += "</div>";
}
openModal("技能 · 换装", html);
$$("#comboChain [data-rm]").forEach((cs) => {
cs.onclick = () => {
const u = B.units[B.sel];
if (!u || !u.chain) return;
u.chain.splice(parseInt(cs.getAttribute("data-rm"), 10), 1);
renderBattle();
};
});
$$("#modalBody [data-heroweapon]").forEach((c) => {
c.onclick = () => { heroSetWeapon(c.getAttribute("data-heroweapon")); openSkills(); };
});
$$("#modalBody [data-addschool]").forEach((c) => {
c.onclick = () => { heroAddSchool(c.getAttribute("data-addschool")); openSkills(); };
});
$$("#modalBody [data-abil]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-abil");
let err;
if (S.equipped.indexOf(id) >= 0) err = unequipAbility(id);
else err = equipAbility(id);
if (err) toast(err);
openSkills();
renderHud();
};
});
}
function devGiveMat(id, n) { gainMat(id, n || 1); saveGame(true); return S.mats; }
function devSetMat(obj) { S.mats = Object.assign({}, S.mats || {}, obj || {}); saveGame(true); return S.mats; }
function devQuestForce(id, state) {
S.quests = S.quests || {};
S.quests[id] = { state: state || "active" };
saveGame(true);
return S.quests;
}
window.HengDebug = {
state: function () { return S; },
invalidateAlly: function () { invalidateAllyIndex(); return true; },
dissolveValue: function (a) { return dissolveValue(a); },
openDissolve: function () { openDissolve(); return true; },
mats: function () { return S.mats; },
counters: function () { return S.questCounters; },
giveMat: devGiveMat,
setMat: devSetMat,
forceQuest: devQuestForce,
quests: function () { return S.quests; },
unlockAll: function () {
DATA.chapters.forEach((c, i) => { chapterState(i).done = true; });
S.unlocked = DATA.chapters.length;
S.allied = S.allied || {};
DATA.ever.forEach((e) => { S.allied[e.id] = true; });
saveGame(true);
return { unlocked: S.unlocked, allied: Object.keys(S.allied).length };
},
jump: function (chapterIndex, stage) {
S.chapterIndex = chapterIndex;
S.stage = stage === undefined ? 0 : stage;
saveGame(true);
renderMap();
return { chapter: DATA.chapters[chapterIndex].key, stage: S.stage };
},
stageList: function (chapterIndex) {
const ch = DATA.chapters[chapterIndex];
return ch.stages.map((x, i) => i + ":" + x.type + ":" + (x.title || "") + (x.enemy ? "[" + x.enemy + "]" : ""));
},
setDifficulty: function (id) {
if (!DATA.difficulties[id]) return "unknown";
S.difficulty = id;
if (id === "hard") S.hardUnlocked = true;
if (id === "true") { S.hardUnlocked = true; S.trueUnlocked = true; }
saveGame(true);
return S.difficulty;
},
clearGame: function () { onGameCleared(); return { difficulty: diffId(), hard: S.hardUnlocked, true: S.trueUnlocked }; },
slots: function () { return slotList(); },
activeSlot: function () { return activeSlot(); },
saveTo: function (k, silent) { return saveToSlot(k, silent === undefined ? true : silent); },
loadSlot: function (k) { return loadFromSlot(k); },
deleteSlot: function (k) { deleteSlot(k); return slotList(); },
newest: function () { return newestSlot(); },
openSettings: function () { openSettings(); },
openSlots: function () { openSaveSlots(); },
openNotes: function () { openSaveNotes(); },
jobs: function () { return DATA.jobs; },
jobOf: function (allyId) { const a = allyById(allyId); return a ? jobOfAlly(a) : null; },
allyJobs: function () {
return (S && S.allies ? S.allies : []).map(function (a) {
const j = jobOfAlly(a);
return { name: a.name, job: j, weapon: a.weaponId, ok: weaponUsableBy(a.weaponId, j) };
});
},
jobWeapons: function (j) { return jobWeapons(j); },
weaponUsableBy: function (w, j) { return weaponUsableBy(w, j); },
rollOne: function () { return rollAlly(false); },
rollCommissions: function () { ensureCommissions(); return S.commissions; },
resetCommissions: function () { S.commissionDay = null; S.commissionBase = null; ensureCommissions(); return S.commissions; },
commissions: function () { ensureCommissions(); return { day: S.commissionDay, list: S.commissions, claimed: S.commissionClaimed, base: S.commissionBase }; },
setCommissionBase: function (obj) { S.commissionBase = Object.assign(commissionBaseline(), obj || {}); saveGame(true); return S.commissionBase; },
openCommissions: function () { openCommissions(); },
strict: function () { return strictNoSkip(); },
difficulty: function () { return diffId(); },
leaveToGrind: function () { leaveToGrind(); },
afterBattle: function () { afterBattle(); return { stage: S.stage, screen: UI.screen }; },
stageWin: function () { return B ? !!B.stageWin : null; },
winBattle: function () { if (!B) return null; winBattle(); return !!B; },
loseBattle: function () { loseBattle(); return true; },
settle: function (win) {
if (!B) return "no-battle";
B.over = true; B.locked = true; B.stageWin = !!win;
if (win) {
S.questCounters = S.questCounters || { battles:0, kills:0, killsByTag:{}, bossWins:0, arenaWins:0, fullHp:0 };
S.questCounters.battles = (S.questCounters.battles || 0) + 1;
if (B.arena) {
S.questCounters.arenaWins = (S.questCounters.arenaWins || 0) + 1;
S.arenaCleared = S.arenaCleared || {};
const tk = arenaClearKey(B.arenaTier || 0, B.arenaDiff || "normal");
S.arenaCleared[tk] = (S.arenaCleared[tk] || 0) + 1;
}
} else {
(S.allies || []).forEach((a) => { a.hp = null; a.sp = 20; });
}
showResult(!!win);
return { win: !!win, strict: strictNoSkip(), diff: diffId(), arena: B.arena ? { tier: B.arenaTier, diff: B.arenaDiff } : null };
},
arenaDiffs: function () { return ARENA_DIFFS.map(function (d) { return d.id + ":" + d.name; }); },
arenaDiff: function () { return (S && S.arenaDiff) || "normal"; },
setArenaDiff: function (id) { S.arenaDiff = id; saveGame(true); return S.arenaDiff; },
arenaUnlocked: function (tier, diff) { return arenaDiffUnlocked(tier, diff); },
arenaCount: function (tier, diff) { return arenaClearCount(tier, diff); },
arena: function (tier, diff) { startArena(tier, diff); return B ? { arena: !!B.arena, tier: B.arenaTier, diff: B.arenaDiff } : null; },
battleInfoArena: function () {
if (!B) return null;
return {
tier: B.arenaTier, diff: B.arenaDiff,
hp: B.enemies.map(function (e) { return e.maxHp; }),
atk: B.enemies.map(function (e) { return e.atkLevel; }),
count: B.enemies.length
};
},
forceArenaEnemy: function (k) { forceArenaEnemy(k); return k; },
addEnemy: function (key) {
if (!B) return null;
const k = key || "cultist";
let idx = B.enemies.length;
while (B.enemies.some(function (e) { return e.uid === "enemy_" + idx; })) idx++;
const u = enemyUnitFor(k, idx, (B.stage && B.stage.enemyScale) || 1,
(B.stage && B.stage.enemyHp) || 1, (B.stage && B.stage.enemyAtk) || 1);
B.enemies.push(u);
B.enemyDefs[u.uid] = { enemy: k };
renderBattle();
return u.uid;
},
assignTarget: function (uid) { assignTarget(uid); return (B.units[B.sel] || {}).actionTarget; },
selIndex: function () { return B ? B.sel : -1; },
duel: function () {
if (!D_) return null;
return {
phase: D_.phase, round: D_.round, side: D_.side, bet: D_.bet,
a: D_.a ? { name: D_.a.name, hp: Math.round(D_.a.hp), maxHp: D_.a.maxHp, power: D_.a.power } : null,
b: D_.b ? { name: D_.b.name, hp: Math.round(D_.b.hp), maxHp: D_.b.maxHp, power: D_.b.power } : null,
odds: D_.odds, winner: D_.winner, payout: D_.payout === undefined ? null : D_.payout,
logCount: (D_.log || []).length
};
},
duelOpen: function () { openDuel(); return true; },
duelNew: function () { newDuelMatch(); return true; },
duelOddsOf: function (i, j) { const R = DATA.duelRoster; return duelOdds(R[i], R[j]); },
duelRosterSize: function () { return (DATA.duelRoster || []).length; },
duelLogText: function () { return (D_ && D_.log ? D_.log : []).map(function (l) { return l.text; }).join("\n"); },
spList: function () {
return DATA.specialBosses.map(function (b) {
return { id: b.id, name: b.name, enemy: b.enemy, reward: b.reward.name,
unlock: spUnlocked(b), has: spHasReward(b) };
});
},
spState: function () {
return { chosen: spDone(), active: !!(S && S.spActive), cap: squadCap(),
draft: (S && S.spDraft ? S.spDraft.slice() : null),
spSquad: (S && S.spSquad ? S.spSquad.slice() : null),
squad: (S && S.squad ? S.squad.slice() : []),
prevSquad: (S && S.spPrevSquad ? S.spPrevSquad.slice() : null) };
},
spOpen: function () { openSpecialBosses(); return true; },
spSquad: function (id) { openSpSquad(id); return true; },
spStart: function (id) { startSpecialBoss(id); return B ? { boss: B.bossId, sp: B.spBoss } : null; },
nameStyle: function (a) { return nameStyle(a); },
grantSp: function (id) { grantSpReward(id); return true; },
spPick: function (id) {
S.squad = S.squad || [];
if (S.squad.indexOf(id) < 0) S.squad.push(id);
saveGame(true); return S.squad.slice();
},
spSetSquad: function (ids) { S.spSquad = (ids || []).slice(0, SP_SQUAD_CAP); saveGame(true); return S.spSquad.length; },
spGrant: function (id) { grantSpReward(id); return { has: spHasReward(DATA.specialBosses.find(function (b) { return b.id === id; })) }; },
spSquadCap: function () { return (B && B.stage && B.stage.squadOverride && typeof UI !== "undefined" && UI.screen === "battle") ? SP_SQUAD_CAP : squadCap(); },
spDoneProbe: function () { return spDone(); },
openSettings: function () { openSettings(); },
openSlots: function () { openSaveSlots(); },
openDifficulty: function () { openDifficulty(); },
toTitle: function () { toTitle(); return UI.screen; },
switchDiff: function (id) { switchDifficulty(id); return S ? S.difficulty : null; },
allyStats: function (a) { return allyStats(a); },
squadCap: function () { return squadCap(); },
allyById: function (id) { return allyById(id); },
groupByLevel: function (l) { return groupByLevel(l); },
localizeDom: function () { return localizeDom(document.body); },
squadLegal: function () { return squadLegality(); },
expNeed: function (lv) { return expNeeded(lv); },
useJar: function (id) { return giveExpJar(id); },
applyJar: function (jar, ally) { return applyJar(jar, ally); },
syncHero: function () { const h = syncHero(); return h ? h.level : null; },
openBag2: function () { openBag(); return true; },
grantSp: function (id) { grantSpReward(id); return (S.allies || []).length; },
party: function () { return B ? B.units.map(function (u) { return { uid: u.uid, name: u.name, ally: !!u.ally, assist: !!u.assist, alive: !!u.alive }; }) : []; },
renderBattleNow: function () { if (B) renderBattle(); return !!B; },
startBattleStage: function (ci, si) {
const ch = DATA.chapters[ci];
if (!ch) return null;
const st = (ch.stages || [])[si];
if (!st) return null;
UI.selectedChapter = ci;
startBattle(st);
return "battle";
},
forceLangEn: function () { DATA.forcedLang = "en"; if (S) S.lang = "en"; return curLang(); },
forceLangZh: function () { DATA.forcedLang = "zh"; if (S) S.lang = null; return curLang(); },
nextTier: function () { return nextRestartTier(); },
canRestart: function (id) { return canRestartTo(id); },
forceSwitch: function (id) { switchDifficulty(id, true); return S ? S.difficulty : null; },
selectChapter: function (i) { UI.selectedChapter = i; },
renderMap: function () { renderMap(); },
restartBtnText: function () {
if (!restartRowEl || !restartRowEl.children || !restartRowEl.children.length) return "";
return String(restartRowEl.children[0].textContent || "");
},
hasRestartRow: function () { return !!restartRowEl; },
openCommissions: function () { openCommissions(); },
commissionState: function () {
const cl = S.commissionClaimed || {};
return { total: (S.commissions || []).length, claimed: Object.keys(cl).length };
},
claimCommission: function (id, force) {
S.commissionClaimed = S.commissionClaimed || {};
if (force) S.commissionCounters = S.commissionCounters || {};
S.commissionClaimed[id] = true;
saveGame(true);
return true;
},
setTextSpeed: function (v) { return setTextSpeed(v); },
lang: function () { return curLang(); },
langPref: function () { return loadLangPref(); },
setLang: function (c) { setLang(c); return curLang(); },
localizeDom: function () { relocalize(); return curLang(); },
enPhrases: function () { return enPhraseList().length; },
tr: function (s) { return tr(s); },
openSettings2: function () { openSettings(); },
allyPlans: function () {
if (!B) return [];
return B.units.map(function (u) {
return { name: u.name, uid: u.uid, assist: !!u.assist, sel: B.units[B.sel] === u,
target: u.actionTarget || null, chain: (u.chain || []).slice() };
});
},
enemyPlans: function () {
if (!B) return [];
return B.enemies.filter(function (e) { return e.alive; }).map(function (e) {
return { name: e.name, uid: e.uid, side: e.side, mood: e.mood, atkLevel: e.atkLevel,
speed: e.speed, moves: (e.moves || []).slice(0, 8),
action: e.action ? { chain: (e.action.chain || []).slice(), kind: e.action.kind } : null };
});
},
allyHpSnapshot: function () { return B ? B.units.map(function (u) { return Math.round(u.hp); }) : []; },
enemyHpSnapshot: function () { return B ? B.enemies.map(function (e) { return Math.round(e.hp); }) : []; },
logText: function () {
const box = el("battleLog");
if (!box || !box.children) return "";
return box.children.map(function (c) {
return String((c && (c.textContent !== undefined ? c.textContent : c.innerHTML)) || "");
}).join("\n");
},
logRaw: function () {
const box = el("battleLog");
if (!box || !box.children) return [];
return box.children.slice(-80).map(function (c) {
return { cls: c.className || "", text: String(c.textContent || "") };
});
},
sampleEnemyCombos: function (n) {
const out = [];
const es = (B && B.enemies) || [];
for (let i = 0; i < (n || 40); i++) {
const e = es[i % Math.max(1, es.length)];
if (!e) break;
out.push((window.HengCombo ? window.HengCombo.enemyCombo(e) : []).slice());
}
return out;
},
boostEnemySpeed: function (v) {
if (!B) return 0;
let n = 0;
B.enemies.forEach(function (e) { if (e.alive) { e.speed = v || 999; n++; } });
return n;
},
resolveNow: function () { resolveAll(true); return true; },
battleInfo: function () {
if (!B) return null;
return { round: B.round, phase: B.phase, locked: B.locked, over: B.over,
enemyAlive: B.enemies.filter(function (e) { return e.alive; }).length };
},
setBal: function (o) { Object.assign(BAL, o || {}); return JSON.parse(JSON.stringify(BAL)); },
getBal: function () { return JSON.parse(JSON.stringify(BAL)); },
measure: function () {
if (!B) return null;
const C = window.HengCombo;
const ally = B.units.find(function (u) { return u.alive && u.isPlayer; });
const foe = B.enemies.find(function (e) { return e.alive; });
if (!ally || !foe) return { note: "no units" };
const mv = C.move((ally.moves && ally.moves[0]) || "m_jab") || { power: 1 };
const fm = C.move((foe.moves && foe.moves[0]) || "m_jab") || { power: 1 };
return {
allyHp: Math.round(ally.maxHp), allyAtk: ally.atkLevel, allyDef: ally.defLevel,
foeHp: Math.round(foe.maxHp), foeAtk: foe.atkLevel, foeDef: foe.defLevel,
allyHit: C.damage(ally, mv, foe, false),
foeHit: C.damage(foe, fm, ally, true),
allyPool: (ally.moves || []).slice(0, 4), foePool: (foe.moves || []).slice(0, 4),
foeDmgMul: foe.dmgMul || 1
};
},
metrics: function () {
if (!B) return null;
const C = window.HengCombo;
const allies = B.units.filter(function (u) { return u.alive && u.isPlayer; });
const foes = B.enemies.filter(function (e) { return e.alive; });
if (!allies.length || !foes.length) return null;
let out = 0, ehits = 0;
allies.forEach(function (a) {
const ms = a.moves && a.moves.length ? a.moves : ["m_jab"];
let best = 0;
ms.forEach(function (id) {
const m = C.move(id); if (!m) return;
const d = C.damage(a, m, foes[0], false);
if (d > best) best = d;
});
out += best;
});
const foeHpSum = foes.reduce(function (a, e) { return a + e.maxHp; }, 0);
foes.forEach(function (e) {
const ms = e.moves && e.moves.length ? e.moves : ["m_jab"];
let best = 0;
ms.forEach(function (id) {
const m = C.move(id); if (!m) return;
const d = C.damage(e, m, allies[0], true) * (e.dmgMul || 1);
if (d > best) best = d;
});
ehits += best * 2.2; 
});
return {
allyCount: allies.length, foeCount: foes.length,
allyDpr: Math.round(out), foeDpr: Math.round(ehits),
foeHpSum: Math.round(foeHpSum), allyHpSum: Math.round(allies.reduce(function (a, u) { return a + u.maxHp; }, 0)),
roundsToClear: out > 0 ? +(foeHpSum / out).toFixed(1) : 999,
roundsToDie: ehits > 0 ? +(allies.reduce(function (a, u) { return a + u.maxHp; }, 0) / ehits).toFixed(1) : 999
};
},
stageProbe: function () {
return B && B.stage ? {
enemyHp: B.stage.enemyHp, enemyAtk: B.stage.enemyAtk,
enemyScale: B.stage.enemyScale, arenaDiff: B.stage.arenaDiff,
enemyDef: B.stage.enemyDef, keys: B.stage.enemyKeys
} : null;
},
resultButtons: function () {
const el2 = (typeof document !== "undefined") ? document.getElementById("resBtns") : null;
if (!el2 || !el2.children) return [];
return el2.children.map(function (c) { return (c.textContent || "").trim(); }).filter(Boolean);
},
exportPayload: function () { return { v: 1, at: Date.now(), active: activeSlot(), meta: slotMeta(), slots: slotData() }; },
importPayload: function (obj) {
if (!obj || typeof obj !== "object") return "bad";
const src = obj.slots || obj;
const data = {}, meta = {};
Object.keys(src).forEach((k) => { if (/^\d+$/.test(k)) { data[k] = src[k]; meta[k] = metaOf(src[k]); } });
if (!Object.keys(data).length) return "empty";
writeJSON(SLOTS_KEY, data);
writeJSON(SLOTS_META, meta);
setActiveSlot(String(Object.keys(data)[0]));
return slotList().filter((x) => x.has).map((x) => x.key);
},
addEver: function (everId, toSquad) {
const ev = DATA.ever.find((x) => x.id === everId);
if (!ev) return "unknown";
S.allies = S.allies || [];
const aid = "ever_" + ev.id;
if (!S.allies.some((a) => a.id === aid)) S.allies.push(eternalAlly(ev.name));
if (toSquad !== false) {
S.squad = S.squad || [];
if (S.squad.indexOf(aid) < 0) {
if (S.squad.length >= squadCap()) S.squad.shift(); 
S.squad.push(aid);
}
}
S.allied = S.allied || {}; S.allied[ev.id] = true;
saveGame(true);
return { ally: aid, squad: S.squad.slice() };
},
play: function (chapterIndex, stage) {
if (chapterIndex !== undefined) S.chapterIndex = chapterIndex;
if (stage !== undefined) S.stage = stage;
startStage();
return { chapter: DATA.chapters[S.chapterIndex].key, stage: S.stage };
},
battle: function () { return B ? { sel: B.sel, selName: B.units[B.sel] ? B.units[B.sel].name : null, selAssist: !!(B.units[B.sel] && B.units[B.sel].assist), assists: (B.assists || []).map((u) => ({ name: u.name, assistId: u.assistId })), units: B.units.map((u) => ({ n: u.name, uid: u.uid, assist: !!u.assist, twin: !!u.timelineTwin })) } : null; },
assistUid: function () { const u = B && (B.assists || [])[0]; return u ? u.uid : null; },
trySelect: function (uid) { selectUnit(uid); return B ? { sel: B.sel, selName: B.units[B.sel] ? B.units[B.sel].name : null, selAssist: !!(B.units[B.sel] && B.units[B.sel].assist) } : null; },
bump: function (key, n) {
S.questCounters = S.questCounters || {};
S.questCounters[key] = (S.questCounters[key] || 0) + (n === undefined ? 1 : n);
saveGame(true);
return S.questCounters;
}
};
function inNonStoryBattle() {
if (!B) return false;
return !!(B.arena || B.spBoss || (B.stage && (B.stage.arena || B.stage.spBoss || B.stage.duel)));
}
function diffId() {
if (inNonStoryBattle()) return "normal";
return (S && S.difficulty) || "normal";
}
function diffIdRaw() { return (S && S.difficulty) || "normal"; }
function diffConf() {
return (DATA.difficulties && DATA.difficulties[diffId()]) || DATA.difficulties.normal;
}
function isNormalDiff() { return diffId() === "normal"; }
function onGameCleared() {
const d = diffId();
S.gameCleared = true;
if (d === "normal") S.hardUnlocked = true;
if (d === "hard") { S.trueUnlocked = true; S.hardCleared = true; }
if (d === "true") S.trueCleared = true;
saveGame(true);
}
function openDifficulty() {
if (!S) { toast("先建一份档案。"); return; }
const cur = diffId();
const rows = ["normal", "hard", "true"].map((id) => {
const d = DATA.difficulties[id];
let unlocked = true, why = "";
if (id === "hard") { unlocked = !!S.hardUnlocked; why = "需通关最终传（通常难度）"; }
if (id === "true") { unlocked = !!S.trueUnlocked; why = "需以困难难度通关最终传"; }
const cur2 = id === cur;
return '<div class="qcard ' + (cur2 ? "ready" : "") + '" data-diff="' + id + '">' +
'<div class="q-top"><span class="q-name">' + d.glyph + "　" + d.name + "　<span class='muted small'>" + d.short + "</span></span>" +
'<span class="q-npc">' + (cur2 ? "当前" : (unlocked ? "可切换" : "未解锁")) + "</span></div>" +
'<div class="q-brief">' + d.desc + "</div>" +
(unlocked ? "" : '<div class="q-award">解锁条件：' + why + "</div>") +
(unlocked && !cur2 && diffRank(id) > diffRank(cur)
? '<div class="q-act"><button class="btn btn-tiny btn-primary" data-setdiff="' + id + '">重 启 主 线 到 此 难 度</button></div>'
: (unlocked && !cur2 ? '<div class="q-award">难度不能回退 —— 已锁定在【' + DATA.difficulties[cur].name + '】</div>' : "")) +
"</div>";
}).join("");
openModal("难度模式",
"<p style='color:var(--muted)'>难度<b>只能往上升</b>，不能回退。重启主线会清空关卡进度，" +
"但保留等级、功勋、队友、兵装与招募到的角色。</p>" +
"<div class='qgrid'>" + rows + "</div>" +
"<h4>通关记录</h4><div class='stat-grid'>" +
"<div class='stat-box'><div class='s-name'>通常</div><div class='s-val'>" + (S.gameCleared ? "已通关" : "—") + "</div></div>" +
"<div class='stat-box'><div class='s-name'>困难</div><div class='s-val'>" + (S.hardCleared ? "已通关" : (S.hardUnlocked ? "已解锁" : "未解锁")) + "</div></div>" +
"<div class='stat-box'><div class='s-name'>真实</div><div class='s-val'>" + (S.trueCleared ? "已通关" : (S.trueUnlocked ? "已解锁" : "未解锁")) + "</div></div>" +
"</div>");
$$("#modalBody [data-setdiff]").forEach((b) => {
b.onclick = () => switchDifficulty(b.getAttribute("data-setdiff"));
});
}
function assistsForStage(stage) {
if (!stage || stage.arena) return [];
const ch = DATA.chapters[S.chapterIndex];
const key = ch ? ch.key : "";
const title = stage.title || "";
if (stage.boss) return [];
const roster = DATA.assistRoster || [];
const exact = roster.filter((a) =>
a.chapter === key && (a.stages || []).length &&
(a.stages || []).some((t) => t && title.indexOf(t) >= 0));
if (exact.length) return exact.slice(0, 1);
return (DATA.assists || []).filter((a) =>
a.chapter === key && (a.stages || []).length &&
(a.stages || []).some((t) => t && title.indexOf(t) >= 0)).slice(0, 1);
}
function makeAssistUnit(a, idx) {
const lv = a.lv || 30;
const w = DATA.weapons.find((x) => x.id === a.weapon) || null;
const label = a.label || "";
const displayName = a.name + String(label || "").replace(/^·\s*/, "·");
const u = makeUnit({
uid: "assist_" + idx, side: "player", name: displayName, glyph: a.name.slice(0, 1),
maxHp: Math.round((a.hp || 300) + lv * 46),
atkLevel: Math.round(8 + lv * 1.15 + (a.atk || 0) * 0.55),
defLevel: Math.round((8 + lv * 0.55) * 0.9),
speed: (a.spd || 26) + 6,
sp: 32, coins: a.coins || 6,
abilities: ["basic"], weapon: w, isPlayer: true, ally: null,
rarity: "eternal", color: "#f2dfa4"
});
u.assist = true;
u.controllable = false;
u.assistId = a.id;
u.moves = a.moves || ["m_jab", "m_hook", "m_guard"];
u.chain = [];
return u;
}
function injectAssists(stage) {
const list = assistsForStage(stage);
if (!list.length) return [];
B.assists = [];
list.forEach((a, i) => {
const u = makeAssistUnit(a, i);
B.units.push(u);
B.assists.push(u);
B.units.forEach((x) => {
if (x === u || !x.isPlayer || !x.ally) return;
const everId = x.ally.ever || (x.ally.id && x.ally.id.indexOf("ever_") === 0 ? x.ally.id.slice(5) : null);
const sameName = (x.ally.baseName || x.ally.name) === a.name;
if (everId === a.ever || sameName) {
x.timelineTwin = true;
x.name = a.name + "·另类时间线同位体";
}
});
});
return B.assists;
}
function assistBanner(list) {
if (!list || !list.length) return;
list.forEach((u) => {
const a = (DATA.assists || []).find((x) => x.id === u.assistId) || {};
logLine("l-boss", "【援助登场】" + u.name + (a.title ? "（" + a.title + "）" : "") + "　" + (a.join || ""));
if (a.quote) logLine("l-act", "　" + a.quote);
});
logLine("l-sys", "援助角色不受你操控——他们会自己出手。");
}
function assistLeaveLines(list) {
(list || []).forEach((u) => {
if (!u.alive) {
logLine("l-dead", "【援助退场】" + u.name + " 替你挡下了最后一击，倒下了。");
return;
}
const a = (DATA.assists || []).find((x) => x.id === u.assistId) || {};
logLine("l-boss", "【援助退场】" + (a.leave || u.name + "离开了战场。"));
});
}
function enemyTags(key) {
const e = DATA.enemies[key] || {};
const n = e.name || "";
const tags = [];
if (key.indexOf("cult_") === 0 || n.indexOf("邪教") >= 0) tags.push("cult");
if (key.indexOf("boss_") === 0) tags.push("boss", "ever");
if (n.indexOf("冰") >= 0 || key === "boss_liyaohui") tags.push("ice");
if (key.indexOf("abyss") >= 0 || n.indexOf("虚无") >= 0) tags.push("void");
if (e.coinSkills) tags.push("armed");
if (tags.indexOf("cult") < 0 && tags.indexOf("boss") < 0) tags.push("common");
return tags;
}
function matForEnemy(key) {
const tags = enemyTags(key);
if (tags.indexOf("boss") >= 0 || tags.indexOf("ever") >= 0) return "mat_seal";
if (tags.indexOf("void") >= 0) return "mat_void";
if (tags.indexOf("ice") >= 0) return "mat_crystal";
if (tags.indexOf("cult") >= 0) return "mat_cult";
if (tags.indexOf("armed") >= 0) return "mat_blade";
return "mat_blade";
}
function gainMat(id, n) {
if (!id || !n) return;
S.mats = S.mats || {};
S.mats[id] = (S.mats[id] || 0) + n;
S.drops = (S.drops || 0) + n;
}
function matCount(id) { return (S.mats && S.mats[id]) || 0; }
function totalMats() {
let t = 0;
const m = S.mats || {};
Object.keys(m).forEach((k) => { t += m[k] || 0; });
return t;
}
function rollDrops(enemies) {
const got = {};
(enemies || []).forEach((en) => {
const key = en.key || en.id || "";
const chance = (DATA.enemies[key] && DATA.enemies[key].bossSkills) ? 1 : 0.42;
if (Math.random() < chance) {
const mid = matForEnemy(key);
const n = 1 + (Math.random() < 0.22 ? 1 : 0);
gainMat(mid, n);
got[mid] = (got[mid] || 0) + n;
}
});

const isBossFight = (enemies || []).some(function (en) {
const k = en.key || en.id || "";
return (DATA.enemies[k] && DATA.enemies[k].bossSkills) || en.isBoss || en.boss;
});
const jarRoll = Math.random();
if (isBossFight) {
if (jarRoll < 0.03) gainItem("jar_t5", 1);
else if (jarRoll < 0.20) gainItem("jar_high", 1);
else if (jarRoll < 0.48) gainItem("jar_mid", 1);
else if (jarRoll < 0.82) gainItem("jar_low", 1);
} else {
if (jarRoll < 0.05) gainItem("jar_high", 1);
else if (jarRoll < 0.18) gainItem("jar_mid", 1);
else if (jarRoll < 0.48) gainItem("jar_low", 1);
}
try {
const chIdx = (S && typeof S.chapterIndex === "number") ? S.chapterIndex : -1;
const inTrue = (diffIdRaw() === "true") && (chIdx === 2 || chIdx === 3 || chIdx === 4);
if (inTrue && Math.random() < 0.22) {
gainItem("jar_t5", 1);
logLine("l-crit", "拾得：非稀释的时间经验罐 ×1（真实模式）");
}
} catch (e) {}
const ks = Object.keys(got);
if (ks.length) {
logLine("l-sys", "素材：" + ks.map((k) => DATA.materials[k].icon + " " + DATA.materials[k].name + " ×" + got[k]).join("　"));
}
return got;
}
function questProgress(q) {
const o = q.obj || {};
const c = S.questCounters || {};
const n = (v) => v || 0;
switch (o.kind) {
case "killAny": return { have: n(c.kills), need: o.count };
case "tag": return { have: n((c.killsByTag || {})[o.tag]), need: o.count };
case "chapterDone": return { have: chapterState(o.index).done ? 1 : 0, need: 1 };
case "weapons": return { have: (S.weapons || []).length, need: o.count };
case "allies": return { have: (S.allies || []).length, need: o.count };
case "eternals": return { have: eternalRoster().length, need: o.count };
case "level": return { have: S.level, need: o.count };
case "material": return { have: matCount(o.mat), need: o.count };
case "materials": return { have: totalMats(), need: o.count };
case "bossWins": return { have: n(c.bossWins), need: o.count };
case "arenaWins": return { have: n(c.arenaWins), need: o.count };
case "fullHp": return { have: n(c.fullHp), need: o.count };
default: return { have: 0, need: 1 };
}
}
function eternalRoster() {
return Object.keys(S.chapters || {}).filter((k) => S.chapters[k] && S.chapters[k].done)
.map((k) => DATA.chapters[Number(k)])
.filter((c) => c && c.ever)
.map((c) => c.ever)
.filter((v, i, a) => a.indexOf(v) === i);
}
function questState(id) {
const q = (S.quests || {})[id];
return q ? q.state : "offer";
}
function questReady(q) {
const p = questProgress(q);
return p.have >= p.need;
}
function refreshQuests(announce) {
S.quests = S.quests || {};
let turned = 0;
DATA.sideQuests.forEach((q) => {
const st = S.quests[q.id];
if (!st || st.state !== "active") return;
if (questReady(q)) { st.state = "done"; turned++; }
});
if (turned && announce !== false) toast("有 " + turned + " 条支线可以交付了（菜单 → 支线）");
return turned;
}
function acceptQuest(id) {
const q = DATA.sideQuests.find((x) => x.id === id);
if (!q) return;
if (questState(id) !== "offer") { toast("这条支线已经在进行中了。"); return; }
S.quests[id] = { state: "active" };
saveGame(true);
toast("已承接支线：" + q.name);
refreshQuests(false);
renderMap();
openQuests(id);
}
function turnInQuest(id) {
const q = DATA.sideQuests.find((x) => x.id === id);
if (!q) return;
const st = S.quests[id];
if (!st || st.state !== "done") { toast("条件还没满足。"); return; }
if (q.obj.kind === "material" && matCount(q.obj.mat) < q.obj.count) { toast("素材不够。"); return; }
if (q.obj.kind === "material") S.mats[q.obj.mat] -= q.obj.count;
st.state = "claimed";
const lines = [];
applyAward(q.award, lines, false);
if (q.award.title) { S.title = q.award.title; lines.push(["l-crit", "获得称号：「" + q.award.title + "」"]); }
if (q.unlockWeapon) {
S.weapons = S.weapons || [];
if (S.weapons.indexOf(q.unlockWeapon) < 0) S.weapons.push(q.unlockWeapon);
const w = DATA.weapons.find((x) => x.id === q.unlockWeapon);
if (w) lines.push(["l-crit", "解锁兵装：" + w.name]);
}
saveGame(true);
openModal("支线交付 · " + q.name,
"<p style='color:var(--muted)'>" + q.npc + "</p>" +
"<p>" + (q.award.text || "「做完了。拿着——别客气，这是组织该给的。」") + "</p>" +
"<div style='margin-top:14px'>" + lines.map((l) => "<div style='color:" +
(l[0] === "l-crit" ? "var(--gold2)" : "var(--ok)") + "'>" + l[1] + "</div>").join("") + "</div>");
refreshQuests(false);
renderMap();
}
function openQuests(focusId) {
if (!S) {
toast("先建一份档案，再来接委托。");
openModal("支线 · 委托预告",
"<p>支线是主线之外的独立委托：承接后按条件推进，达成即可交付，换来经验、功勋、兵装、道具与素材。</p>" +
"<p style='color:var(--muted)'>通常来自分部的记账员、兵装库的锻工、无垠厅的记账员、会台的记录官，以及——「恒」自身。</p>" +
"<p style='color:var(--gold2)'>共建档后即可承接 " + DATA.sideQuests.length + " 条支线。</p>" +
"<h4>还会遇到的问题</h4>" +
"<p>战斗会掉落 7 种素材（邪教残片、折断的剑刃、冰晶碎屑、记忆碎片、星辰之尘、虚无余烬、封印残纸），" +
"可在支线面板底部的「旧货铺」兑换道具与兵装。</p>");
return;
}
S.quests = S.quests || {};
refreshQuests(false);
const active = [], ready = [], offer = [], done = [];
DATA.sideQuests.forEach((q) => {
const st = questState(q.id);
if (st === "claimed") { done.push(q); return; }
if (st === "done") { ready.push(q); return; }
if (st === "active") { active.push(q); return; }
if (chapterState(q.chapter).done || q.chapter <= highestUnlockedChapter()) offer.push(q);
});
const bar = (q) => {
const p = questProgress(q);
const pct = Math.min(100, Math.round(p.have / p.need * 100));
return '<div class="qbar"><i style="width:' + pct + '%"></i></div>' +
'<div class="qsub">' + p.have + " / " + p.need + (p.have >= p.need ? "　✔ 可交付" : "") + "</div>";
};
const card = (q, kind) => {
const p = questProgress(q);
const st = questState(q.id);
const reward = [];
if (q.award.exp) reward.push("经验 " + q.award.exp);
if (q.award.honor) reward.push("功勋 " + q.award.honor);
if (q.award.title) reward.push("称号");
if (q.award.items) q.award.items.forEach((it) => {
const d = DATA.items.find((x) => x.id === it[0]);
reward.push((d ? d.name : it[0]) + " ×" + it[1]);
});
if (q.award.mat) Object.keys(q.award.mat).forEach((m) => reward.push(DATA.materials[m].name + " ×" + q.award.mat[m]));
if (q.award.weapons) q.award.weapons.forEach((w) => {
const d = DATA.weapons.find((x) => x.id === w); reward.push("兵装·" + (d ? d.name : w));
});
return '<div class="qcard ' + kind + '" data-quest="' + q.id + '">' +
'<div class="q-top"><span class="q-name">' + q.name + "</span>" +
'<span class="q-npc">' + q.npc + "</span></div>" +
'<div class="q-brief">' + q.brief + "</div>" +
(st === "active" || st === "done" ? bar(q) : "") +
'<div class="q-award">报酬：' + (reward.length ? reward.join("　·　") : "—") + "</div>" +
(st === "offer" ? '<div class="q-act"><button class="btn btn-tiny btn-primary" data-take="' + q.id + '">承 接</button></div>' : "") +
(st === "done" && p.have >= p.need ? '<div class="q-act"><button class="btn btn-tiny btn-primary" data-in="' + q.id + '">交 付</button></div>' : "") +
"</div>";
};
let html = '<div class="stat-grid">' +
"<div class='stat-box'><div class='s-name'>进行中</div><div class='s-val'>" + active.length + "</div></div>" +
"<div class='stat-box'><div class='s-name'>可交付</div><div class='s-val'>" + ready.length + "</div></div>" +
"<div class='stat-box'><div class='s-name'>已完成</div><div class='s-val'>" + done.length + " / " + DATA.sideQuests.length + "</div></div>" +
"<div class='stat-box'><div class='s-name'>素材合计</div><div class='s-val'>" + totalMats() + "</div></div>" +
"</div>";
if (ready.length) html += "<h4>可交付</h4><div class='qgrid'>" + ready.map((q) => card(q, "ready")).join("") + "</div>";
if (active.length) html += "<h4>进行中</h4><div class='qgrid'>" + active.map((q) => card(q, "active")).join("") + "</div>";
if (offer.length) html += "<h4>可承接（按列传进度开放）</h4><div class='qgrid'>" + offer.map((q) => card(q, "offer")).join("") + "</div>";
if (done.length) html += "<h4>已完成</h4><div class='qgrid'>" + done.map((q) => card(q, "claimed")).join("") + "</div>";
if (!active.length && !ready.length && !offer.length) html += "<p class='muted'>暂无支线。推进列传后会有新的委托。</p>";
html += "<h4>素材库存</h4><div class='mat-grid'>" + Object.keys(DATA.materials).map((k) => {
const m = DATA.materials[k], c = matCount(k);
return "<div class='mat" + (c ? " has" : "") + "' title='" + m.desc + "（来源：" + m.from + "）'>" +
"<span class='mi'>" + m.icon + "</span><span class='mn'>" + m.name + "</span><span class='mc'>" + c + "</span></div>";
}).join("") + "</div>";
html += "<h4>旧货铺 · 素材兑换</h4><div class='qgrid'>" + DATA.shop.map((sp) => {
const can = Object.keys(sp.cost).every((k) => matCount(k) >= sp.cost[k]);
const cost = Object.keys(sp.cost).map((k) => DATA.materials[k].icon + DATA.materials[k].name + " ×" + sp.cost[k]).join("　");
const give = [];
if (sp.give.items) sp.give.items.forEach((it) => { const d = DATA.items.find((x) => x.id === it[0]); give.push((d ? d.name : it[0]) + " ×" + it[1]); });
if (sp.give.honor) give.push("功勋 " + sp.give.honor);
if (sp.give.weapons) sp.give.weapons.forEach((w) => { const d = DATA.weapons.find((x) => x.id === w); give.push("兵装·" + (d ? d.name : w)); });
if (sp.give.healAll) give.push("全队回满");
return "<div class='qcard shop'><div class='q-top'><span class='q-name'>" + sp.name + "</span></div>" +
"<div class='q-brief'>消耗：" + cost + "</div><div class='q-award'>获得：" + give.join("　·　") + "</div>" +
"<div class='q-act'><button class='btn btn-tiny' data-shop='" + sp.id + "'" + (can ? "" : " disabled") + ">兑 换</button></div></div>";
}).join("") + "</div>";
openModal("支线 · 委托与旧货铺", html);
$$("#modalBody [data-take]").forEach((b) => { b.onclick = () => acceptQuest(b.getAttribute("data-take")); });
$$("#modalBody [data-in]").forEach((b) => { b.onclick = () => turnInQuest(b.getAttribute("data-in")); });
$$("#modalBody [data-shop]").forEach((b) => { b.onclick = () => doShop(b.getAttribute("data-shop")); });
if (focusId) {
const c = document.querySelector('[data-quest="' + focusId + '"]');
if (c && c.scrollIntoView) c.scrollIntoView({ block: "center" });
}
}
function highestUnlockedChapter() {
let hi = 0;
DATA.chapters.forEach((c, i) => { if (chapterState(i).done) hi = i + 1; });
return Math.min(hi, DATA.chapters.length - 1);
}
function doShop(id) {
const sp = DATA.shop.find((x) => x.id === id);
if (!sp) return;
const lack = Object.keys(sp.cost).filter((k) => matCount(k) < sp.cost[k]);
if (lack.length) { toast("素材不足：" + lack.map((k) => DATA.materials[k].name).join("、")); return; }
Object.keys(sp.cost).forEach((k) => { S.mats[k] -= sp.cost[k]; });
const lines = [];
if (sp.give.items) sp.give.items.forEach((it) => gainItem(it[0], it[1]));
if (sp.give.honor) S.honor = (S.honor || 0) + sp.give.honor;
if (sp.give.weapons) {
S.weapons = S.weapons || [];
sp.give.weapons.forEach((w) => { if (S.weapons.indexOf(w) < 0) S.weapons.push(w); });
}
if (sp.give.healAll) healSquad(1);
saveGame(true);
toast("兑换完成：" + sp.name);
openQuests();
}
function chaptersCleared() {
return Object.keys(S.chapters || {}).filter(function (k) { return S.chapters[k] && S.chapters[k].done; }).length;
}
function bossUnlocked(b) {
if (devOn()) return true;
return chaptersCleared() >= (b.req || 0);
}
function openBosses() {
if (!S) return;
S.bossWins = S.bossWins || {};
S.bossBest = S.bossBest || {};
var done = chaptersCleared();
var html = "<p style='color:var(--muted)'>" + DATA.bossArena.intro + "</p>";
html += "<p>已通关传记 <b class='k'>" + done + "</b> / " + DATA.chapters.length +
" ｜ 已击败 BOSS <b class='k'>" + Object.keys(S.bossWins).length + "</b> / " + DATA.bossArena.list.length + "</p>";
html += "<div class='stat-grid'>" +
"<div class='stat-box'><div class='s-name'>BOSS 强度</div><div class='s-val'>恒永者级</div></div>" +
"<div class='stat-box'><div class='s-name'>可用道具</div><div class='s-val'>否</div></div>" +
"<div class='stat-box'><div class='s-name'>医疗部</div><div class='s-val'>否</div></div>" +
"<div class='stat-box'><div class='s-name'>降神</div><div class='s-val'>可用</div></div>" +
"</div>";
html += "<p class='small' style='color:var(--muted)'>会台是正式对决：不许用道具、不许叫医疗部。降神与技能照常。建议全员 Lv.20 以上、配好兵装、理智拉满再来。</p>";
html += "<h4>挑战名单</h4><div class='codex-grid'>";
DATA.bossArena.list.forEach(function (b, i) {
var e = DATA.enemies[b.id];
if (!e) return;
var ok = bossUnlocked(b);
var won = !!S.bossWins[b.id];
var best = S.bossBest[b.id];
html += "<div class='codex-card" + (ok ? "" : " locked") + "' data-boss='" + b.id + "'>" +
"<div class='cc-name'>" + (ok ? e.name : "？？？") + (won ? " ✓已胜" : "") + "</div>" +
"<div class='cc-sub'>" + (ok ? ("生命 " + e.hp + " ｜ 攻击等级 " + e.atk + " ｜ 硬币技 " + (e.skills || []).length + " 种")
: ("需通关 " + b.req + " 传（当前 " + done + "）")) + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + (ok ? e.note : "——") + "</div>" +
"<div class='cc-sub' style='color:var(--gold2)'>" +
(won ? "首胜奖励已领取" : "首胜：功勋 " + b.honor + (b.reward ? " + 兵装" : "")) +
(best ? " ｜ 最快 " + best + " 回合" : "") + "</div></div>";
});
html += "</div>";
openModal(DATA.bossArena.name, html);
$$("#modalBody [data-boss]").forEach(function (c) {
c.onclick = function () {
var id = c.getAttribute("data-boss");
var b = DATA.bossArena.list.filter(function (x) { return x.id === id; })[0];
if (!b) return;
if (!bossUnlocked(b)) { toast("需先通关 " + b.req + " 传传记。"); return; }
closeModal();
startBoss(id, b);
};
});
}
function startBoss(id, b) {
var e = DATA.enemies[id];
if (!e) { toast("BOSS 数据缺失。"); return; }
var stage = {
type: "battle", boss: true, bossId: id, title: "会台 · " + e.name,
enemy: id, enemyKeys: [id],
enemyScale: 1,
award: { exp: Math.round(400 + e.hp / 6) },
intro: e.note,
win: "会台上没有掌声。你只是把这一战记进了自己的档案。",
lose: { text: "你被抬下了会台。这不算丢人——会台上站过的人，本来就不多。" }
};
startBattle(stage);
if (B) {
B.boss = true;
B.bossId = id;
B.noItem = true;
B.noHeal = true;
var rawHp = (DATA.enemies[id] && DATA.enemies[id].hp) || 3000;
var bossHp = Math.round(180 + rawHp * 0.62 + S.level * 26);
(B.enemies || []).forEach(function (en) {
en.maxHp = bossHp;
en.hp = bossHp;
if (en.bossSkillCoin) { }
en.atkLevel = Math.max(3, Math.round(en.atkLevel * 0.58));
en.defLevel = Math.max(6, Math.round(en.defLevel * 0.92));
en.dmgMul = 0.85;
en.coinBonus = -2;
en.isBoss = true;
});
renderBattle();
logLine("l-boss", "【会台】" + e.name + " 走上台。这一场不许用道具——但医疗部照常值守。");
}
}
const ARENA_DIFFS = [
{ id:"normal", name:"通常", short:"通常", hp:1.00, atk:1.00, exp:1.00, honor:1.00, cls:"d-normal" },
{ id:"hard", name:"困难", short:"困难", hp:1.55, atk:1.22, exp:1.45, honor:1.60, cls:"d-hard" },
{ id:"true", name:"真实", short:"真实", hp:2.20, atk:1.45, exp:2.10, honor:2.40, cls:"d-true" }
];
function arenaDiff(id) {
return ARENA_DIFFS.find((d) => d.id === id) || ARENA_DIFFS[0];
}
function arenaDiffIndex(id) {
const i = ARENA_DIFFS.findIndex((d) => d.id === id);
return i < 0 ? 0 : i;
}
function arenaDiffUnlocked(tierIndex, diffId2) {
const di = arenaDiffIndex(diffId2);
if (di === 0) return true;
const prev = ARENA_DIFFS[di - 1].id;
return arenaClearCount(tierIndex, prev) > 0;
}
function arenaClearKey(tierIndex, diffId2) {
const di = arenaDiffIndex(diffId2);
return "t" + tierIndex + (di === 0 ? "" : "_" + ARENA_DIFFS[di].id);
}
function arenaClearCount(tierIndex, diffId2) {
const m = (S && S.arenaCleared) || {};
return m[arenaClearKey(tierIndex, diffId2)] || 0;
}
let _arenaDiffHold = null;
function enterArenaScope(id) {
_arenaDiffHold = (S && S.difficulty) || "normal";
if (S) S.difficulty = "normal";
return id;
}
function leaveArenaScope() {
if (S && _arenaDiffHold) S.difficulty = _arenaDiffHold;
_arenaDiffHold = null;
}
function openArena(preTier, preDiff) {
if (!S) return;
S.arena = S.arena || { tier:0, streak:0, wins:0 };
const a = DATA.arena;
let html = "<p style='color:var(--muted)'>" + a.intro + "</p>";
html += "<p>连胜 <b class='k'>" + (S.arena.streak || 0) + "</b> ｜ 累计胜利 <b class='k'>" + (S.arena.wins || 0) +
"</b> ｜ 功勋 <b class='k'>" + (S.honor || 0) + "</b> ｜ 每连胜一层，经验 +" + Math.round(a.streakBonus * 100) + "%</p>";
S.arenaDiff = S.arenaDiff || "normal";
if (preDiff) S.arenaDiff = preDiff;
const curD = arenaDiff(S.arenaDiff);
html += "<h4>难度</h4><div class='arena-diffs'>";
ARENA_DIFFS.forEach((d) => {
const on = d.id === S.arenaDiff;
html += "<button class='btn btn-tiny " + (on ? "btn-primary" : "") + " " + d.cls +
"' data-arenadiff='" + d.id + "'>" + d.short + "</button>";
});
html += "</div>";
html += "<p style='color:var(--muted)'>厅内难度与主线难度<b>互不影响</b>。每一层要先通上一档难度，才解锁下一档。" +
"当前：<b class='" + curD.cls + "'>" + curD.name + "</b>（敌人生命 ×" + curD.hp.toFixed(2) +
"、攻击 ×" + curD.atk.toFixed(2) + "；经验 ×" + curD.exp.toFixed(2) + "、功勋 ×" + curD.honor.toFixed(2) + "）</p>";
html += "<h4>层数</h4><div class='codex-grid'>";
a.tiers.forEach((t, i) => {
const lvOk = S.level >= t.unlockLv;
const dOk = arenaDiffUnlocked(i, S.arenaDiff);
const ok = lvOk && dOk;
const cleared = arenaClearCount(i, S.arenaDiff);
const prevName = ARENA_DIFFS[Math.max(0, arenaDiffIndex(S.arenaDiff) - 1)].name;
const lockMsg = !lvOk ? " ｜ 需 Lv." + t.unlockLv
: (!dOk ? " ｜ 需先通「" + prevName + "」" : "");
html += "<div class='codex-card" + (ok ? "" : " locked") + "' data-tier='" + i + "'>" +
"<div class='cc-name'>" + t.name + lockMsg + "</div>" +
"<div class='cc-sub'>经验 ×" + (t.expScale * curD.exp).toFixed(2) + " ｜ 功勋 " +
Math.round(t.honor * curD.honor) + " / 场</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + t.desc + "</div>" +
"<div class='cc-sub' style='color:var(--dim)'>对手：" + t.enemies.map((k) => DATA.enemies[k].name).join("、") + "</div>" +
"<div class='cc-sub' style='color:var(--gold2)'>本层" + curD.name + "通关 " + cleared + " 次" + "</div></div>";
});
html += "</div>";
if (S.hp < baseStats(S).hp) {
html += "<p style='color:var(--muted)'>当前生命 " + Math.round(S.hp) + " / " + baseStats(S).hp +
"。进厅会以当前状态开打——也可以先在战斗里用医疗部回血。</p>";
}
openModal(a.name, html);
$$("#modalBody [data-arenadiff]").forEach((b) => {
b.onclick = () => { S.arenaDiff = b.getAttribute("data-arenadiff"); saveGame(true); openArena(preTier); };
});
$$("#modalBody [data-tier]").forEach((c) => {
c.onclick = () => {
const i = parseInt(c.getAttribute("data-tier"), 10);
const t = a.tiers[i];
if (S.level < t.unlockLv) { toast("需要 Lv." + t.unlockLv + " 才能进这一层。"); return; }
if (!arenaDiffUnlocked(i, S.arenaDiff)) {
const prev = ARENA_DIFFS[arenaDiffIndex(S.arenaDiff) - 1].name;
toast("这一层的「" + arenaDiff(S.arenaDiff).name + "」要先通「" + prev + "」才解锁。");
return;
}
closeModal();
startArena(i, S.arenaDiff);
};
});
}
let _forceArenaEnemy = null;
function forceArenaEnemy(k) { _forceArenaEnemy = k || null; }
function startArena(tierIndex, diffId2) {
const a = DATA.arena;
const tier = a.tiers[tierIndex];
if (!tier) return;
const ad = arenaDiff(diffId2 || (S && S.arenaDiff) || "normal");
if (!arenaDiffUnlocked(tierIndex, ad.id)) {
toast("这一层的「" + ad.name + "」还没解锁。");
return;
}
S.arena = S.arena || { tier:0, streak:0, wins:0 };
S.arena.tier = tierIndex;
S.arenaDiff = ad.id;
if (B && (!B.arena || B.arenaTier !== tierIndex || B.arenaDiff !== ad.id)) S.arena.streak = 0;
const keys = [_forceArenaEnemy || pick(tier.enemies)];
const extraChance = _forceArenaEnemy ? 0
: (S.level >= tier.unlockLv + 6 ? 0.45 : 0) + (arenaDiffIndex(ad.id) * 0.12);
if (Math.random() < extraChance) keys.push(pick(tier.enemies));
const stage = {
type: "battle", arena: true, tier: tierIndex, enemy: keys[0], enemyKeys: keys,
arenaTier: tierIndex,
title: tier.name, award: { exp: 0 },
intro: tier.desc,
win: "对手倒下了。无垠厅的记账员在上面写下一行数字。"
};
stage.enemyScale = tier.statScale || 1;
stage.enemyHp = ad.hp;
stage.enemyAtk = ad.atk;
stage.arenaDiff = ad.id;
enterArenaScope(ad.id);
startBattle(stage);
leaveArenaScope();
B.arena = true;
B.arenaTier = tierIndex;
B.arenaTierName = tier.name;
B.arenaDiff = ad.id;
B.arenaDiffName = ad.name;
renderBattle();
logLine("l-sys", "【" + tier.name + " · " + ad.name + "】" + keys.map((k) => DATA.enemies[k].name).join("、") +
" 登场。（战力 ×" + (tier.statScale || 1).toFixed(2) + "，难度 ×" + ad.hp.toFixed(2) + "）");
}
function openCodex() {
const seen = loadCodex();
const everDone = S ? alliedList() : [];
let html = "<h4>恒永者列传 · 十一任</h4><div class='codex-grid'>";
DATA.ever.forEach((e) => {
const ok = !!seen[e.id] || everDone.indexOf(e.id) >= 0;
html += "<div class='codex-card" + (ok ? "" : " locked") + "' data-ever='" + e.id + "'>" +
"<div class='cc-name'>" + (ok ? e.no + " · " + e.name : "？？？") + "</div>" +
"<div class='cc-sub'>" + (ok ? e.title : "未解锁") + "</div>" +
(ok ? "<div class='cc-sub' style='color:var(--gold2)'>就任年龄：" + (e.becomeAge || "—") + "</div>" : "") + "</div>";
});
html += "</div><div class='tl-cta'><button class='btn btn-tiny btn-primary' data-act-timeline='1'>查看恒永者年表 · 就任年龄与世代层级</button></div>";
html += "<h4>组织档案</h4><div class='codex-grid'>";
DATA.codex.forEach((c) => {
const ok = !!seen[c.id];
html += "<div class='codex-card" + (ok ? "" : " locked") + "' data-codex='" + c.id + "'>" +
"<div class='cc-name'>" + (ok ? c.title : "？？？") + "</div>" +
"<div class='cc-sub'>" + (ok ? c.sub : "未解锁") + "</div></div>";
});
html += "</div>";
openModal("典藏室", html);
$$("#modalBody [data-act-timeline]").forEach((b) => { b.onclick = () => openTimeline(); });
$$("#modalBody [data-ever]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-ever");
if (c.classList.contains("locked")) return;
showEverDetail(id);
};
});
$$("#modalBody [data-codex]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-codex");
if (c.classList.contains("locked")) return;
const d = DATA.codex.find((x) => x.id === id);
openModal(d.title, "<p style='color:var(--gold);letter-spacing:.2em'>" + d.sub + "</p>" +
d.body.split("\n").map((p) => "<p>" + p + "</p>").join("") +
"<div style='margin-top:16px'><button class='btn btn-tiny' data-act='back-codex'>返回典藏室</button></div>");
bindBack();
};
});
}
function bindBack() {
$$("#modalBody [data-act='back-codex']").forEach((b) => { b.onclick = () => openCodex(); });
$$("#modalBody [data-act='back-ever']").forEach((b) => { b.onclick = () => openCodex(); });
}
function showEverDetail(id) {
const e = DATA.ever.find((x) => x.id === id);
if (!e) return;
openModal(e.no + " · " + e.name,
"<p style='color:var(--gold);letter-spacing:.2em'>" + e.title + "</p>" +
"<div class='stat-grid'>" + box("生卒 / 状态", e.life) + box("实力刻度", e.power) +
box("就任年龄", e.becomeAge || "—") +
box("降神", e.summon.name) + box("自损", Math.round(e.summon.selfCost * 100) + "%") + "</div>" +
(e.becomeNote ? "<p style='color:var(--gold2)'>" + e.becomeNote + "</p>" : "") +
"<h4>形貌</h4><p>" + e.look + "</p>" +
"<h4>关系</h4><p>" + e.bond + "</p>" +
"<h4>传承</h4><p>" + e.path + "</p>" +
"<h4>语录</h4><p class='k'>" + e.quote + "</p>" +
"<h4>小传</h4><p>" + e.codex + "</p>" +
"<h4>" + e.summon.name + "</h4><p>" + e.summon.text + "</p>" +
"<div style='margin-top:16px'><button class='btn btn-tiny' data-act='back-ever'>返回典藏室</button></div>");
bindBack();
}
function openCredits() {
const html =
"<div style='text-align:center'>" +
"<h4 style='margin-top:4px'>创 作 者 名 单</h4>" +
"<p style='line-height:1.9;font-size:15px'>" +
"<b class='k'>主创</b>：玖喵瓷思源<br>" +
"<span style='color:var(--muted)'>(《永序锋魂》整体原作者)</span><br><br>" +
"<b class='k'>辅助主创 · 将想法实现</b>：DeepSeek-HARNESS<br><br>" +
"<b class='k'>传奇 bug 质检员</b>：泽斯克" +
"</p>" +
"<img src='credits_tokens.jpg' alt='消费金额 ¥31.36 CNY ｜ API 请求次数 2,417 ｜ Tokens 776,317,095' " +
"style='width:100%;max-width:640px;margin:14px auto 6px;display:block;border-radius:10px;" +
"border:1px solid rgba(214,178,90,.35)'>" +
"<p style='color:var(--gold2);font-size:14px;margin-top:8px'>（钱钱飞升了）</p>" +
"</div>";
openModal("创作者名单", html);
}
function openAbout() {
openModal("关于 [恒]组织",
"<p>[恒]组织处于万物一切的中心点。主要任务是寻找万物诞生的秘密，然后变得更强。</p>" +
"<p>内部有无穷无尽的部门，每个部门无穷无尽的层级，每一层级都有专业的人员。组织成员之间绝对平等——包括AI、机器人、变异体、实验体，没有阶级权力，只有在任务中才需要绝对听从上级的指令。</p>" +
"<p>和[X]组织相距1000光年，相互制衡，关系极好。功勋可以兑换除人形智慧生命体以外的一切，包括一颗星球。</p>" +
"<h4>恒永者</h4><p>既是战力，也是传承。从第一任「恒」到第十一任「茫」，这一脉留下了的不是职位，是一整套能教下去的东西。</p>" +
"<h4>机密 · 降神 / 降魂</h4><p>在外出历练、遇到无法活着回去的处境时，可以在内心呼唤上层人物的名字与编号。被呼唤者感知到后，可将部分或全部力量暂时赋予那人——代价是身体可能承受不住。</p>" +
"<h4>本作说明</h4><p>本作为同人游戏，取材自 [恒]组织恒永者设定集。数值、战斗与部分台词为游戏化演绎；人物经历、关系与语录均依原文。</p>" +
"<p style='color:var(--dim)'>操作：左侧列传列表选择章节 → 推进剧情 → 抉择/战斗。</p>" +
"<h4>技能 · 换装</h4><p>你的战斗技能栏有 6 格。所有已解锁的技能都在仓库里——包括本传之外的腿法、拳法、秘法（血蝠、骨盾、狂化、血涌、心镜等）。" +
"在「技能」面板里点一下就能换上或卸下。升级会按等级解锁新技能（拳法1级、破壳3级、血涌5级、过载7级、心镜9级、归零12级）。" +
"换装是自由的：原本是踢，仓库里有盾或回血，就直接换上去。</p>" +
"<h4>无垠厅 · 刷怪区</h4><p>主线之外的历练场，共五层，等级越高能进越深的层。每连胜一场经验加成 +12%。" +
"刷怪给功勋，功勋可以在战斗中用「医疗部」回血（250功勋回35%生命）。</p>");
}
function toTitle() {
try { closeModal(); } catch (e) {}
show("title");
rotateQuotes();
el("titleQuote").textContent = QUOTES[0];
}
function isApp() {
try { return !!(window.HengApp && window.HengApp.isApp && window.HengApp.isApp()); }
catch (e) { return false; }
}
const DEV_NAME = "玖喵思源";
function devOn() { return !!(S && S.dev); }
function devUnlockAll() {
S.dev = true;
S.honor = 99999999;
S.points = 999;
S.level = Math.max(S.level || 1, 40);
S.spent = S.spent || { atk:0, def:0, spd:0, will:0, hpBonus:0 };
S.spent.hpBonus = (S.spent.hpBonus || 0) + 40000;
S.equipped = abilityOrder().slice(0, MAX_EQUIP);
S.weapons = DATA.weapons.filter((w) => w.id !== "fist_bare").map((w) => w.id);
DATA.ever.forEach((ev) => {
if ((S.allies || []).some((a) => a.summonId === ev.id)) return;
const a = eternalAlly(ev.name);
a.level = 50;
S.allies.push(a);
});
DATA.items.forEach((it) => gainItem(it.id, 99));
DATA.chapters.forEach((ch, i) => {
S.chapters[i] = S.chapters[i] || { stages: 0, done: false };
S.chapters[i].unlocked = true;
});
S.unlocked = DATA.chapters.length;
S.allied = S.allied || {};
DATA.ever.forEach((e) => { S.allied[e.id] = true; });
if (!S.summonId) S.summonId = "siyuan";
S.weaponOf = S.weaponOf || {};
(S.allies || []).forEach((a, i) => {
if (!S.weaponOf[a.id]) a.weaponId = S.weapons[i % S.weapons.length] || a.weaponId;
});
(S.allies || []).forEach((a) => {
a.level = 50;
a.hpBonus = (a.hpBonus || 0) + 6000;
a.speedBonus = (a.speedBonus || 0) + 8;
if (!a.weaponId || a.weaponId === "fist_bare") a.weaponId = "relic_sheath";
});
S.squad = (S.allies || []).slice(0, 4).map((a) => a.id);
saveGame(true);
}
function openDevPanel() {
let html = "<p style='color:var(--gold2)'>开发者模式已开启：全角色 / 全技能 / 全兵装 / 全道具 / 全剧情已解锁，功勋与潜能点已加满。</p>";
html += "<p>等级 <b class='k'>" + S.level + "</b> ｜ 功勋 <b class='k'>" + S.honor + "</b> ｜ 成员 <b class='k'>" +
(S.allies || []).length + "</b> ｜ 编队 <b class='k'>" + (S.squad || []).length + "</b></p>";
html += "<h4>快速跳传</h4><div class='codex-grid'>";
DATA.chapters.forEach((ch, i) => {
html += "<div class='codex-card' data-devchap='" + i + "'><div class='cc-name'>" + ch.no + " · " + ch.name + "</div>" +
"<div class='cc-sub'>跳到本传第 1 幕</div></div>";
});
html += "</div><h4>工具</h4><p>" +
"<button class='btn btn-tiny' data-devact='level'>等级 +10</button> " +
"<button class='btn btn-tiny' data-devact='honor'>功勋 +100 万</button> " +
"<button class='btn btn-tiny' data-devact='heal'>全队回满</button> " +
"<button class='btn btn-tiny' data-devact='clear'>一键通关全部传记</button> " +
"<button class='btn btn-tiny btn-ghost' data-devact='off'>关闭开发者模式</button></p>";
openModal("开发者模式", html);
$$("#modalBody [data-devchap]").forEach((c) => {
c.onclick = () => {
const i = parseInt(c.getAttribute("data-devchap"), 10);
UI.selectedChapter = i;
S.chapterIndex = i;
S.chapters[i] = { stages: 0, done: false };
S.stage = 0;
saveGame(true);
closeModal();
renderMap(); show("map");
toast("已跳到 " + DATA.chapters[i].no);
};
});
$$("#modalBody [data-devact]").forEach((c) => {
c.onclick = () => {
const a = c.getAttribute("data-devact");
if (a === "level") { S.level += 10; S.points += 20; }
else if (a === "honor") S.honor = (S.honor || 0) + 1000000;
else if (a === "heal") { (S.allies || []).forEach((x) => { x.hp = null; x.sp = 40; }); S.hp = baseStats(S).hp; }
else if (a === "clear") {
DATA.chapters.forEach((ch, i) => { S.chapters[i] = { stages: ch.stages.length, done: true }; });
S.unlocked = DATA.chapters.length;
} else if (a === "off") {
S.dev = false; toast("开发者模式已关闭。");
closeModal(); saveGame(true); renderMap(); renderHud(); return;
}
saveGame(true); renderHud(); renderMap(); openDevPanel();
};
});
}
function requestNewGame() {
const nm = (el("inpName").value || "").trim();
if (nm === DEV_NAME) {
openModal("检测到开发者",
"<p>你输入的姓名是 <b class='k'>" + DEV_NAME + "</b>。</p>" +
"<p>是否开启 <b>开发者模式</b>？开启后会立即解锁：全部角色、全部剧情、全部技能、全部兵装、全部道具，并加满功勋与潜能点。</p>" +
"<div style='display:flex;gap:12px;margin-top:18px;flex-wrap:wrap'>" +
"<button class='btn btn-primary' data-devc='1'>开 启 开 发 者 模 式</button>" +
"<button class='btn' data-devc='0'>以 普 通 模 式 开 始</button></div>");
$$("#modalBody [data-devc]").forEach((b) => {
b.onclick = () => { const v = b.getAttribute("data-devc") === "1"; closeModal(); newGame(v); };
});
return;
}
newGame(false);
}
function newGame(dev) {
const nm = el("inpName").value.trim() || "无名者";
S = newState(nm, el("inpOrigin").value, el("inpSchool").value, el("inpOath").value);
if (dev) {
devUnlockAll();
toast("开发者模式已开启：全角色 / 全剧情 / 全技能 / 全兵装解锁。");
}
try { syncHero(); } catch (e) {}
UI.selectedChapter = 0;
normalizeAllyJobs();
equipList();
const empty = slotList().find((x) => !x.has);
setActiveSlot(empty ? empty.key : "1");
saveGame(true);
renderMap();
show("map");
if (window.HengFx && window.HengFx.maybeFirstRun) setTimeout(window.HengFx.maybeFirstRun, 900);
openModal("入组登记",
"<p>档案已建立。<span class='k'>" + S.name + "</span>，出身：" + DATA.origins[S.origin].name +
"，五脉初习：" + DATA.schools[S.school].name + "。</p>" +
"<p>" + DATA.oaths[S.oath].desc + "</p>" +
"<h4>该怎么走</h4><p>左侧是十一任恒永者的列传，外加一传「终传」。逐传推进：看剧情、做抉择、打战斗。</p>" +
"<p>走完一传会与那一位恒永者结缘，之后可以在「队伍」里择定<b>本命结缘者</b>，战斗中唤其<b>降神</b>。</p>" +
"<p style='color:var(--muted)'>升级获得的潜能点在「队伍」面板分配。战斗失败不会卡住剧情。</p>");
}
function loadAndStart() {
const s = loadGame();
if (!s) { toast("没有找到存档。"); return; }
S = s;
S = applyLoadedSave(S) || S;
saveGame(true);
renderMap();
show("map");
}
function boot() {
advanceHint = el("advanceHint");
try { migrateLegacySave(); } catch (e) {}
try { if (S) ensureCommissions(); } catch (e) {}
try { if (window.HengFx && window.HengFx.buildAudioDock) window.HengFx.buildAudioDock(); } catch (e) {}
if (document.addEventListener) {
document.addEventListener("click", function (ev) {
if (!advanceHint) return;
var inStory = ev.target && ev.target.closest && ev.target.closest("#scr-story");
if (!inStory) return;
if (window.HengFx && window.HengFx.typing && window.HengFx.typing()) {
if (ev.stopPropagation) ev.stopPropagation();
window.HengFx.skip();
advanceHint.textContent = "点击「继续」翻页";
}
}, true);
}
el("inpOrigin").onchange = updateOriginDesc;
el("inpSchool").onchange = updateSchoolDesc;
initCreate();
el("scr-title").querySelectorAll("[data-act='continue']").forEach((b) => {
b.disabled = !hasSave();
});
document.addEventListener("click", (ev) => {
const t = ev.target.closest("[data-act]");
if (!t) return;
const act = t.getAttribute("data-act");
if (act === "new") { show("create"); initCreate(); }
else if (act === "continue") loadAndStart();
else if (act === "codex") openCodex();
else if (act === "about") openAbout();
else if (act === "credits") openCredits();
else if (act === "back-title") toTitle();
else if (act === "start") requestNewGame();
else if (act === "enter") enterChapter();
else if (act === "party") openParty();
else if (act === "skills") openSkills();
else if (act === "squad") openSquad();
else if (act === "dev") openDevPanel();
else if (act === "speed") {
S.animSpeed = S.animSpeed === "fast" ? "normal" : (S.animSpeed === "normal" || !S.animSpeed ? "slow" : "fast");
saveGame(true); renderHud();
toast("拼点演出速度：" + (S.animSpeed === "slow" ? "慢" : S.animSpeed === "fast" ? "快" : "标准"));
}
else if (act === "recruit") openRecruit(null);
else if (act === "dissolve") openDissolve();
else if (act === "armory") openArmory();
else if (act === "bag") openBag();
else if (act === "arena") openArena();
else if (act === "boss") openBosses();
else if (act === "quests") openQuests();
else if (act === "difficulty") openDifficulty();
else if (act === "timeline") openTimeline();
else if (act === "settings") openSettings();
else if (act === "title-archive" || act === "title-about") openTitleGroup(act);
else if (act === "mymusic") openMyMusic();
else if (act === "commissions") openCommissions();
else if (act === "duel") openDuel();
else if (act === "activities") openActivities();
else if (act === "spboss") openSpecialBosses();
else if (act === "lang-en") {

location.href = "index.en.html";
}
else if (act === "lang-zh") {

try { localStorage.removeItem("heng_rpg_lang_v1"); } catch (e) {}
location.href = "index.html";
}
else if (act === "slots") openSaveSlots();
else if (act === "save") openSaveSlots();
else if (act === "quit") quitGame();
else if (act === "close-modal") closeModal();
});
el("modal").addEventListener("click", (ev) => { if (ev.target === el("modal")) closeModal(); });
document.addEventListener("keydown", (ev) => {
if (ev.key === "Escape" && el("modal").classList.contains("on")) closeModal();
});
toTitle();
try { relocalize(); } catch (e) {}
if (window.HengFx && window.HengFx.maybeFirstRun) {
setTimeout(function () {
if (!hasSave()) { }
}, 100);
}
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
})();