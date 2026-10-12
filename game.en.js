
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
{ at: 0, name: "Trainee Member" },
{ at: 2, name: "Full Member" },
{ at: 4, name: "Roster" },
{ at: 6, name: "Shouzhen Xiao" },
{ at: 8, name: "Branch Steward" },
{ at: 10, name: "Heng Technique Lesson" },
{ at: 12, name: "Eternal" }
];
const KIND_LABEL = { slash:"Slash", pierce:"Pierce", crit:"Blade", true:"True", multi:"Chain",
void:"Void", shield:"Guard", drain:"Devour", healself:"Rite" };
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
let r = "Trainee Member";
RANKS.forEach((x) => { if (done >= x.at) r = x.name; });
return r;
}
function gainExp(amount, lines) {
setTimeout(() => { try { refreshQuests(true); } catch (e) {} }, 10);
S.exp += amount;
lines.push(["l-sys", "Gained " + amount + " EXP."]);
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
lines.push(["l-crit", "Level up to Lv." + S.level + "（+" + ups * 2 + " potential points), HP fully restored."]);
const fresh = checkUnlocks(S.level);
if (fresh.length) {
lines.push(["l-sys", "New Skill Unlocked:" + fresh.map((id) => DATA.abilities[id].name).join("、") +
" — swap it in the Skill panel."]);
}
}
}
function applyAward(aw, lines, onlyMax) {
if (!aw) return;

const _dc = (typeof diffConf === "function") ? diffConf() : { exp:1, honor:1 };
if (aw.exp && _dc.exp !== 1) aw = Object.assign({}, aw, { exp: Math.round(aw.exp * _dc.exp) });
if (aw.honor && _dc.honor !== 1) aw = Object.assign({}, aw, { honor: Math.round(aw.honor * _dc.honor) });
const label = { atk:"Strength", def:"Defense", spd:"Speed", will:"Will" };
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
lines.push(["l-sys", "Max HP +" + aw.hp + "。"]);
}
if (aw.unlockCodex) markCodex(aw.unlockCodex);

if (aw.honor) {
S.honor = (S.honor || 0) + aw.honor;
lines.push(["l-crit", "Gained Honor " + aw.honor + "。"]);
}
if (aw.items) {
aw.items.forEach((it) => {
gainItem(it[0], it[1]);
const d = DATA.items.find((x) => x.id === it[0]);
lines.push(["l-sys", "Obtained Item: " + (d ? d.name : it[0]) + " ×" + it[1]]);
});
}
if (aw.mat) {
Object.keys(aw.mat).forEach((k) => {
gainMat(k, aw.mat[k]);
lines.push(["l-sys", "Obtained Material: " + DATA.materials[k].name + " ×" + aw.mat[k]]);
});
}
if (aw.weapons) {
S.weapons = S.weapons || [];
aw.weapons.forEach((w) => {
if (S.weapons.indexOf(w) < 0) S.weapons.push(w);
const d = DATA.weapons.find((x) => x.id === w);
lines.push(["l-crit", "Unlocked Weapon: " + (d ? d.name : w)]);
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
name: obj.name || "Nameless",
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
if (ok) toast("Saved to " + key + " slot · " + fmtTime(S.__savedAt));
else toast("Save failed: browser storage may be full");
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
toast("Archive Unlocked:" + codexTitle(id));
}
}
function codexTitle(id) {
const d = DATA.codex.find((x) => x.id === id);
if (d) return d.title;
const e = DATA.ever.find((x) => x.id === id);
return e ? e.no + " · " + e.name : id;
}

function newState(name, origin, school, oath) {
const st = { name: name || "the Nameless", origin: origin, school: school, oath: oath,
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
"\"Original author: JMiaoC (Jiumiaoci Siyuan)\"",
"\"I want to be a mortal, but the world\'s pressure will not allow me to be one.\"",
"\"Fate cannot be changed. Neither can you or I.\"",
"\"Manbo, Hajimi Manbo\"",
"\"The one hiding in the back flew up, because the one in front was flexing (jk\"",
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
el("inpName").value = pick(["Ling Shuang", "Chen Wuming", "Ji Heng", "Su Weimian", "Yan Changgeng"]);
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
div.innerHTML = '<span class="ch-idx">' + (cs.done ? "✓" : (locked ? "Lock" : ch.order)) + "</span>" +
'<div class="ch-info"><div class="ch-name">' + (locked ? "？？？" : ch.name) + "</div>" +
'<div class="ch-sub">' + (locked ? "Not Yet Unlocked" : ch.no + " · " + ch.subtitle) + "</div></div>";
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
? "<em>This Chronicle is not yet unlocked. Finish the previous one first.</em>"
: tr(ch.desc).replace(/\n/g, "<br>") + "<br><br><em>" +
(cs.done ? tr("Cleared.") : tr("当前进度：") + cs.stages + " / " + ch.stages.length + " " + tr("幕")) + "</em>";
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
btn.textContent = locked ? "Locked"
: (cs.done ? (i === DATA.chapters.length - 1 ? "Replay Finale" : "Cleared") : (cs.stages === 0 ? "Begin This Chronicle" : "Advance Story"));

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
if (!S) { toast("Create an archive first."); return; }
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
if (!pair) { toast("The cricket-fight roster is empty."); return; }
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
if (next > (S.honor || 0)) { toast("Not enough Honor, maximum stake " + (S.honor || 0) + "。"); return; }
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
if (!D_.side) { toast("First choose who to stake on."); return; }
if ((D_.bet || 0) < 10) { toast("Stake at least 10 Honor."); return; }
if ((S.honor || 0) < D_.bet) { toast("Not enough Honor."); return; }
D_.phase = "fight";
D_.round = 0;
D_.log = [];

S.honor = Math.max(0, (S.honor || 0) - D_.bet);
D_.staked = true;
duelLog("l-sys", "—— Stake deducted " + D_.bet + " Honor. You staked on [" + D_[D_.side].name +
"], multiplier x" + duelSideOdds(D_.side).toFixed(1) + "。");
duelLog("l-sys", "—— Begin.");
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
function saveLangPref(v) {
try { localStorage.setItem(LANG_KEY, v); } catch (e) {}
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
DATA.langGetter = function () { return "en"; };
} catch (e) {}
function isEn() { return true; }
function tr(s) {
if (!isEn()) return s;
if (s == null) return s;
const k = String(s);

const es = DATA.enStory;
if (es && Object.prototype.hasOwnProperty.call(es, k)) return es[k];
return (typeof DATA.t === "function") ? DATA.t(k) : k;
}

function trf(obj, field) {
if (!obj || !isEn()) return obj;
const v = obj[field];
if (v != null) obj[field] = tr(v);
return obj;
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
try { localStorage.setItem("heng_rpg_lang_v1", code); } catch (e) {}
location.href = (code === "zh") ? "index.html" : "index.en.html";
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
duelLog("l-sys", "—— No. " + r + " rounds.");
duelStrike(first, second, r);
if (second.hp > 0 && first.hp > 0) duelStrike(second, first, r);

[A, B].forEach((f) => {
if (f.bleed > 0 && f.hp > 0) {
const d = Math.max(1, Math.round(f.bleedDmg));
f.hp = Math.max(0, f.hp - d);
duelLog("l-dead", "　　" + f.name + " lost from Bleed " + d + " EXP.");
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
const m = DATA.moves[mid] || { name:"Bite", power:1.0, acc:96, type:"Blade" };
if (m.weak) defF.weakNext = 1;
if (m.shield) {
const cap = defF.maxHp * 0.20;
atkF.shield = Math.min(cap, (atkF.shield || 0) + atkF.maxHp * m.shield);
duelLog("l-heal", "　　【" + atkF.name + "】" + m.name + ": Shield +" + Math.round(atkF.maxHp * m.shield) + "。");
return;
}
if (!m.power) {
if (m.heal) {
const h = Math.round(atkF.maxHp * m.heal);
atkF.hp = Math.min(atkF.maxHp, atkF.hp + h);
duelLog("l-heal", "　　【" + atkF.name + "】" + m.name + ": Restore " + h + " EXP.");
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
duelLog("l-dead", "　　【" + atkF.name + "】" + m.name + "（" + m.type + ") rolled " + Math.round(roll) + " → Miss.");
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
duelLog("l-hit", "　　【" + atkF.name + "】" + m.name + "（" + m.type + "）→ " + defF.name + " takes " +
dmg + " pts" + (m.multi && m.multi > 1 ? "（" + m.multi + " hits)" : "") + "。");
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
duelLog("l-crit", "—— your stake [" + D_[D_.side].name + "] wins. Return " + D_.bet +
" + won " + D_.payout + ", total +" + gross + " Honor (stake " + D_.bet +
" × " + odds.toFixed(1) + "）。");
} else {
D_.payout = -D_.bet;
duelLog("l-dead", "—— your stake [" + D_[D_.side].name + "] lost. Stake " + D_.bet +
" Honor deducted (stake " + D_.bet + " × " + odds.toFixed(1) + "）。");
}
refreshHonor();

try {
if (win) toast("Bet won! +" + gross + " Honor (principal " + D_.bet + " returned + won " + D_.payout + "）");
else toast("Wrong bet, " + D_.bet + " Honor deducted.");
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
if (!S) { toast("Create an archive first."); return; }
const done = spDone();
let html = "<p style='color:var(--muted)'>" + (DATA.specialBossNote || "") + "</p>";
html += "<div class='stat-grid'>" +
box("Chronicle Cleared", chaptersCleared() + " / " + DATA.chapters.length) +
box("Special Character", done ? "Obtained (the other is closed)" : "Not Yet Obtained") +
box("Party Limit", SP_SQUAD_CAP + " members (this battle only)") +
box("Current Honor", S.honor || 0) +
"</div>";
if (done) {
const got = DATA.specialBosses.find((b) => b.id === done);
html += "<p style=\'color:var(--gold2)\'>You have already chosen and defeated <b>" + (got ? got.name : done) +
"</b>. The other Full-Power Form is permanently closed.</p>";
}
html += "<h4>Two Full-Power Forms</h4><div class=\'codex-grid\'>";
DATA.specialBosses.forEach(function (b) {
const unlock = spUnlocked(b);
const locked = !!done && done !== b.id;
const got = spHasReward(b);
const e = DATA.enemies[b.enemy] || {};
html += "<div class='codex-card" + ((!unlock || locked) ? " locked" : "") + "' data-spboss='" + b.id + "'>" +
"<div class='cc-name' style='color:" + b.color + "'>" + b.glyph + " " + b.name + "</div>" +
"<div class='cc-sub'>" + b.form + " ｜ Full Power</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + (b.intro || "") + "</div>" +
"<div class=\'cc-sub\' style=\'color:var(--gold2)\'>Defeat reward:" + b.reward.name +
(got ? "(Obtained)" : "") + "</div>" +
"<div class='cc-sub'>" +
(!unlock ? "Requires Clear " + (b.unlockChapters || 12) + " Bio"
: locked ? "Closed (you chose the other)"
: "Click → Character Select") + "</div></div>";
});
html += "</div>";
openModal("Special BOSS · Full-Power Form", html);
$$("#modalBody [data-spboss]").forEach(function (c) {
c.onclick = function () {
const id = c.getAttribute("data-spboss");
const b = DATA.specialBosses.find((x) => x.id === id);
if (!b) return;
if (!spUnlocked(b)) { toast("Requires Clear " + (b.unlockChapters || 12) + " Bio."); return; }
if (done && done !== b.id) { toast("This one is permanently closed."); return; }
if (spHasReward(b)) { toast("You have already defeated him and obtained the matching special character."); return; }
openSpSquad(b.id);
};
});
}

function openSpSquad(bossId) {
const b = DATA.specialBosses.find((x) => x.id === bossId);
if (!b) return;

if (!S.spDraft) S.spDraft = (S.squad || []).slice();
const draft = S.spDraft;
const allies = S.allies || [];
let html = "<p style=\'color:var(--muted)\'>For this battle your <b>Party limit is temporarily raised to " + SP_SQUAD_CAP +
" members</b>. Choose who you take to the stage — battle begins the moment you finish, and <b>once it begins the other Full-Power Form is permanently shut down</b>.</p>";
html += "<div class='stat-grid'>" +
box("Opponent", b.short) +
box("Selected", draft.length + " / " + SP_SQUAD_CAP) +
box("Available This Run", SP_SQUAD_CAP + " people") +
box("Roster Size", allies.length) +
"</div>";
html += "<h4>Select Party Members</h4><div class=\'codex-grid\'>";
allies.forEach(function (a) {
const on = draft.indexOf(a.id) >= 0;
const st = allyStats(a);
const ji = jobInfo(jobOfAlly(a));
html += "<div class='codex-card" + (on ? " hot" : "") + "' data-sppick='" + a.id + "'>" +
"<div class='cc-name' style='color:" + (a.color || "#fff") + "'>" + a.name + (on ? " ◆" : "") + "</div>" +
"<div class='cc-sub'>" + ji.glyph + " " + ji.name + " ｜ Lv." + (a.level || 1) + "</div>" +
"<div class=\'cc-sub\'>HP " + st.hp + " ｜ Strength " + st.atk + " ｜ Speed " + st.spd + "</div>" +
"</div>";
});
html += "</div>";
html += "<div class='set-row set-btns' style='margin-top:12px'>" +
"<button class=\'btn\' data-spact=\'all\'>Select All</button>" +
"<button class=\'btn\' data-spact=\'clear\'>Clear All</button>" +
"<button class=\'btn\' data-spact=\'squad\'>Use Current Party</button>" +
"<button class=\'btn btn-primary\' data-spact=\'go\'>Enter the Stage</button>" +
"<button class=\'btn btn-ghost\' data-spact=\'back\'>Back</button>" +
"</div>";
html += "<p style=\'color:#ff9d84;margin-top:8px\'>Note: once you enter the stage, the other Full-Power Form is permanently shut down, and the choice cannot be taken back.</p>";
openModal("Special BOSS · Character Select", html);
$$("#modalBody [data-sppick]").forEach(function (c) {
c.onclick = function () {
const id = c.getAttribute("data-sppick");
const i = S.spDraft.indexOf(id);
if (i >= 0) S.spDraft.splice(i, 1);
else {
if (S.spDraft.length >= SP_SQUAD_CAP) { toast("Max " + SP_SQUAD_CAP + " people."); return; }
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
if (!S.spDraft.length) { toast("Bring at least one member."); return; }

askConfirm("确认挑战",
"Confirm Challenge [" + b.name + "】？<br><br>进入后另一位将永久关闭，无法反悔。",
"进 入 会 台",
function () {
const draft = (S.spDraft || []).slice();
S.spDraft = null;
startSpecialBoss(bossId, draft);
}, true);
}
};
});
}

function startSpecialBoss(bossId, draftSquad) {
const b = DATA.specialBosses.find((x) => x.id === bossId);
if (!b) return;
if (spDone() && spDone() !== bossId) { toast("The other is already closed."); return; }
const e = DATA.enemies[b.enemy];
if (!e) { toast("BOSS data missing."); return; }


const clean = (draftSquad || S.squad || []).filter((id) => allyById(id)).slice(0, SP_SQUAD_CAP);
if (!clean.length) {
toast("这一战需要至少 1 名可用成员。先去「Party」安排上场的人。");
return;
}
S.spPrevSquad = (S.squad || []).slice();
S.squad = clean;
S.specialBoss = bossId; 
S.spActive = true; 
closeModal();

try {
const stage = {
type: "battle", boss: true, bossId: b.enemy, spBoss: bossId,
title: "Full Power · " + b.short,
enemy: b.enemy, enemyKeys: [b.enemy],
enemyScale: 1,
award: { exp: 1200, honor: 5000 },
intro: b.intro,
win: "The stage went quiet. He did not rise again.",
lose: b.lose || { text: "You were carried off." }
};
startBattle(stage);
if (B) {
B.boss = true;
B.bossId = b.enemy;
B.spBoss = bossId;
B.noItem = true;
B.noHeal = true;

const bossHp = Math.round(1500 + S.level * 420);
(B.enemies || []).forEach(function (en) {
en.maxHp = bossHp;
en.hp = bossHp;
en.atkLevel = Math.round(16 + S.level * 1.5);
en.defLevel = Math.round(11 + S.level * 1.1);
en.speed = Math.round(15 + S.level * 0.45);
en.isBoss = true;
en.dmgMul = 1.45;
if (b.pool && b.pool.length) en.moves = b.pool.filter((m) => DATA.moves[m]);
});
renderBattle();
logLine("l-boss", "【" + b.name + "] Seal fully released. For this battle your Party expands to " + SP_SQUAD_CAP + " members, but you have closed the door on the other side.");
}

if (!B || !B.enemies || !B.enemies.length || (typeof UI === "undefined" || UI.screen !== "battle")) {
throw new Error("战斗场景没有建立（B=" + (B ? "有" : "无") +
" 敌人=" + (B && B.enemies ? B.enemies.length : 0) + "）");
}
} catch (err) {

if (S) {
S.spActive = false;
if (S.spPrevSquad) { S.squad = S.spPrevSquad.slice(); S.spPrevSquad = null; }
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
level: Math.max(1, S.level), glyph: r.glyph, color: r.color,
base: r.base || 150, atkBonus: r.atkBonus || 0,
hpBonus: r.hpBonus || 0, speedBonus: r.speedBonus || 0, defBonus: r.defBonus || 0,
coins: r.coins || 0, sp: r.sp || 20,
weaponId: r.weaponId || "orb_void", job: r.job || "mage",
loadout: null, summonId: null, note: r.note || "Special Character",
spBoss: b.id, spPower: r.power || "∞",
hp: null, sp: 20
});
invalidateAllyIndex();
S.honor = (S.honor || 0) + 8000;
saveGame(true);
toast("Special Character obtained:" + r.name + "(Power " + (r.power || "∞") + "）");
openModal("Special Character Obtained",
"<p>You defeated <b style=\'color:" + b.color + "'>" + b.name + "</b>。</p>" +
"<p>He stood up and walked to your side.</p>" +
"<div class='stat-grid'>" + box("Character", r.name) + box("Power", r.power || "∞") +
box("Class", (DATA.jobs[r.job] || {}).name || "—") +
box("Weapon", (DATA.weapons.find((w) => w.id === r.weaponId) || {}).name || "—") + "</div>" +
"<p style=\'color:var(--gold2)\'>The other Full-Power Form is permanently shut down. A special character can hold only one.</p>" +
"<p style=\'color:var(--muted)\'>He has joined the Roster and can be fielded from the \"Party\" panel.</p>");
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
'<div class="duel-role">' + (side === "a" ? "Left Seat" : "Right Seat") + "</div>" +
'<div class="duel-name">' + f.name + "</div>" +
'<div class="duel-tag">' + (f.no ? f.no + " · " : "") + f.tag + "</div>" +
'<div class=\"duel-power\">Power Scale <b>' + f.power.toFixed(1) + "</b></div>" +
duelHpBar(f) +
'<div class=\"duel-odds\">Bet it → odds <b>×' + odds.toFixed(1) + "</b></div>" +
(picked ? '<div class=\"duel-pick\">◆ You bet on this one</div>' : "") +
"</div>";
}
function renderDuel() {
if (!D_) return;

if (!el("modalBody")) return;
const A = D_.a, B = D_.b;
let html = "";
if (D_.phase === "bet") {
html += "<p style=\'color:var(--muted)\'>The system drew two story characters at random to fight automatically." +
"Before the match you can bet — <b>minimum 10 Honor, 10 Honor per raise</b>, " +
"A correct bet pays Honor by the odds; a wrong bet loses the stake.</p>";
html += "<div class='duel-arena'>" + duelCardHTML(A, "a") +
"<div class=\'duel-vs\'>VS<br></div>" + duelCardHTML(B, "b") + "</div>";
html += "<div class='stat-grid'>" +
box("Current Honor", S.honor || 0) +
box("Bet", D_.bet) +
box("Which side?", D_.side ? D_[D_.side].name : "Unselected") +
box("Obtainable on Hit", D_.side ? Math.round(D_.bet * duelSideOdds(D_.side)) : "—") +
"</div>";
html += "<h4>Bet</h4><div class=\'duel-bet\'>" +
"<button class='btn btn-tiny' data-duelbet='-10'>− 10</button>" +
"<button class='btn btn-tiny' data-duelbet='10'>＋ 10</button>" +
"<button class='btn btn-tiny' data-duelbet='-100'>− 100</button>" +
"<button class='btn btn-tiny' data-duelbet='100'>＋ 100</button>" +
"<button class=\'btn btn-tiny\' data-duelbet=\'max\'>All In</button>" +
"<button class=\'btn btn-tiny\' data-duelbet=\'reset\'>Reset</button>" +
"</div>";
html += "<div class='set-row set-btns' style='margin-top:12px'>" +
"<button class='btn btn-primary' data-duelact='fight'" +
(D_.side ? "" : " disabled") + ">Start Spectating</button>" +
"<button class='btn' data-duelact='new'>换 一 批（100 Honor)</button>" +
"<button class=\'btn btn-ghost\' data-duelact=\'close\'>Close</button>" +
"</div>";
if (!D_.side) html += "<p style=\'color:var(--gold2)\'>First tap one of the two above to choose who you back.</p>";
} else {
html += "<div class='duel-arena'>" + duelCardHTML(A, "a") +
"<div class=\'duel-vs\'>No.<br>" + D_.round + "<br>Back</div>" + duelCardHTML(B, "b") + "</div>";
html += "<div class='stat-grid'>" +
box("You bet", D_.side ? D_[D_.side].name : "—") +
box("Stake (deducted)", D_.bet) +
box("Odds", "×" + duelSideOdds(D_.side).toFixed(1)) +
box("Current Honor", S.honor || 0) +
"</div>";
if (D_.phase === "fight" && !D_.settled) {
html += "<p style=\'color:var(--gold2)\'>Bet deducted from Honor <b>" + D_.bet +
"</b>. Win and the stake is returned and paid out at the odds.</p>";
}
html += "<h4>Situation</h4><div class=\'duel-log\' id=\'duelLog\'></div>";
if (D_.phase === "fight") {
html += "<div class='set-row set-btns' style='margin-top:10px'>" +
"<button class=\'btn btn-primary\' data-duelact=\'next\'>Next Turn</button>" +
"<button class=\'btn btn-ghost\' data-duelact=\'auto\'>Auto-Finish</button>" +
"</div>";
} else {
const won = D_.winner === D_.side;
html += "<h4 style='color:" + (won ? "var(--ok)" : "#ff9d84") + "'>" +
(won ? "You win" : "You lose") + "</h4>";
html += "<p>The winner is <b class=\'k\'>" + D_[D_.winner].name + "</b>。</p>";
if (won) {
html += "<p>Principal returned <b>" + D_.bet + "</b> + won <b style=\'color:var(--ok)\'>" +
D_.payout + "</b>, total credited <b style=\'color:var(--ok)\'>+" + (D_.gross || 0) +
"</b> Honor (stake " + D_.bet + " × " + (D_.oddsUsed || 2).toFixed(1) + "）。</p>";
} else {
html += "<p>Bet <b style=\'color:#ff9d84\'>" + D_.bet + "</b> Honor deducted (bet " +
D_.bet + " × " + (D_.oddsUsed || 2).toFixed(1) + "）。</p>";
}
html += "<p>Current Honor: <b class=\'k\'>" + (S.honor || 0) + "</b></p>";
html += "<div class='set-row set-btns' style='margin-top:10px'>" +
"<button class=\'btn btn-primary\' data-duelact=\'again\'>Another Round</button>" +
"<button class='btn' data-duelact='new'>换 一 批（100 Honor)</button>" +
"<button class=\'btn btn-ghost\' data-duelact=\'close\'>Close</button>" +
"</div>";
}
}

if (!onModalOpen()) openModal("Cricket Fight", "");
el("modalTitle").textContent = "Cricket Fight";
el("modalBody").innerHTML =
"<p style=\'color:var(--muted)\'>Cricket Fight — wagers are paid in Honor, staked on the outcome between story characters.</p>" + html;

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
return h + " hours " + (m < 10 ? "0" + m : m) + " pts";
}
const COMMISSION_POOL = [
{ kind:"killTag", key:"cult", title:"Clear the Cult Outposts", brief:"Leave no Cult member around the outpost alive.",
need:()=> 6 + Math.floor(Math.random()*5) },
{ kind:"arenaWins", title:"Debt of the Boundless Hall", brief:"Win a few matches in the Arena. Win streaks give extra bonuses.",
need:()=> 3 + Math.floor(Math.random()*3) },
{ kind:"battleWin", title:"Routine Patrol", brief:"Fight a few rounds. Let the branch know you are still alive.",
need:()=> 3 + Math.floor(Math.random()*2) },
{ kind:"materials", title:"Material Recovery", brief:"Bring back what is left on the battlefield. Take everything.",
need:()=> 8 + Math.floor(Math.random()*8) },
{ kind:"killAny", title:"Suppression Op", brief:"Hold a region down until they no longer dare to surface.",
need:()=> 8 + Math.floor(Math.random()*6) },
{ kind:"bossWin", title:"Take the Stage", brief:"Go to the stage and beat an Eternal. The first time may not look pretty.",
need:()=> 1 },
{ kind:"arenaBattle", title:"Designated Battlefield · Training Ground", brief:"Fight one battle on Arena Layer 1.", need:()=>1, tier:0 },
{ kind:"arenaBattle", title:"Designated Battlefield · Otherworld Rift", brief:"Fight one battle on Arena Layer 2.", need:()=>1, tier:1 },
{ kind:"arenaBattle", title:"Designated Battlefield · Bonefield Outskirts", brief:"Fight one battle on Arena Layer 3.", need:()=>1, tier:2 }
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
if ((S.commissionClaimed || {})[id]) { toast("This one has already been delivered."); return; }
if (!commissionReady(cm)) { toast("Conditions not yet met."); return; }
S.commissionClaimed = S.commissionClaimed || {};
S.commissionClaimed[id] = true;
S.honor = (S.honor || 0) + cm.honor;
const lines = [];
gainExp(cm.exp, lines);
saveGame(true);
toast("Commission Complete: +" + cm.honor + " Honor · +" + cm.exp + " EXP");
openCommissions();
}
function commissionHonorLeft() {
const claimed = S.commissionClaimed || {};
return (S.commissions || []).reduce((a, x) => a + (claimed[x.id] ? 0 : x.honor), 0);
}
function openCommissions() {
if (!S) { toast("Create an archive first."); return; }
ensureCommissions();
ensureBaseline();
const claimed = S.commissionClaimed || {};
const allItems = (S.commissions || []).map((cm) => {
const have = commissionProgress(cm);
const pct = Math.min(100, Math.round(have / cm.need * 100));
const ok = have >= cm.need;
const got = !!claimed[cm.id];
let acts = "";
if (cm.kind === "arenaBattle") acts += "<button class='btn btn-tiny btn-primary' data-cmgo='" + cm.tier + "' data-cmdiff='" + (cm.arenaDiff || "normal") + "\'>Go to the Arena</button>";
if (cm.kind === "bossWin") acts += "<button class=\'btn btn-tiny\' data-cmboss=\'1\'>Go to the Stage</button>";
if (ok && !got) acts += "<button class='btn btn-tiny btn-primary' data-cmclaim='" + cm.id + "\'>Deliver</button>";
const html = "<div class='cm" + (got ? " claimed" : (ok ? " ready" : "")) + "'>" +
"<div class='cm-top'><span class='cm-name'>" + cm.title + "</span>" +
"<span class='cm-honor'>+" + cm.honor + "</span></div>" +
"<div class='cm-brief'>" + cm.brief + "</div>" +
"<div class='qbar'><i style='width:" + pct + "%'></i></div>" +
"<div class='cm-sub'>" + have + " / " + cm.need + " · EXP +" + cm.exp +
(got ? " · Delivered" : "") + "</div>" +
(acts ? "<div class='cm-act'>" + acts + "</div>" : "") +
"</div>";

return { id: cm.id, got: got, html: html };
});

const cards = allItems.filter((x) => !x.got).map((x) => x.html).join("");
const doneCards = allItems.filter((x) => x.got).map((x) => x.html).join("");
openModal("Commission · Daily Quest",
"<div class='cm-head'>" +
"<span><b class=\'k\'>6</b> per day; completing all grants <b class=\'k\'>" + DATA.recruit.costTen +
"</b> Honor (exactly a ten-pull), plus EXP.</span>" +
"<span class=\'cm-timer\'>Refresh in <b id=\'cmTimer\'>" + fmtDur(msUntilReset()) + "</b></span>" +
"</div>" +
"<div class='stat-grid'>" +
"<div class=\'stat-box\'><div class=\'s-name\'>Delivered</div><div class=\'s-val\'>" +
Object.keys(claimed).length + " / 6</div></div>" +
"<div class=\'stat-box\'><div class=\'s-name\'>Claimable Today</div><div class=\'s-val\'>" + commissionHonorLeft() + "</div></div>" +
"<div class=\'stat-box\'><div class=\'s-name\'>Refresh Day</div><div class=\'s-val\'>" + S.commissionDay + "</div></div>" +
"</div>" +
"<h4>Commissions in Progress</h4>" +
(cards ? "<div class='cm-grid'>" + cards + "</div>"
: "<p class=\'muted\'>Today\'s commissions are all delivered. Refresh at 0:00 tomorrow.</p>") +
(doneCards ? "<h4>Completed (no longer counts toward rewards)</h4><div class=\'cm-grid cm-done\'>" + doneCards + "</div>" : "") +
"<p style=\'color:var(--muted);margin-top:12px\'>Refresh follows your device\'s local time, resetting at 0:00 each day. Undelivered commissions are voided; progress is counted from the first time you open this panel that day.</p>");
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
MyMusic.list.push({ name: f.name || ("Music " + (MyMusic.list.length + 1)), url: url, size: f.size || 0 });
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
html += "<div class='stat-grid'>" + box("Current", cur ? cur.name : "—") +
box("列表", MyMusic.list.length + " 首") + box("状态", playing ? "播放中" : "已暂停") + "</div>";
html += "<p><button class='btn btn-tiny' data-mm='prev'>上 一 首</button> " +
"<button class='btn btn-primary' data-mm='toggle'>" + (playing ? "暂 停" : "播 放") + "</button> " +
"<button class='btn btn-tiny' data-mm='next'>下 一 首</button> " +
"<button class='btn btn-tiny' data-mm='stop'>停 止</button></p>";
html += "<div class='set-row'><span>音量</span><input type='range' id='mmVol' min='0' max='100' value='" +
Math.round(MyMusic.volume * 100) + "'></div>";
html += "<div class='set-row'><span>单曲循环</span><button class='btn btn-tiny " +
(MyMusic.loop ? "btn-primary" : "") + "' data-mm='loop'>" + (MyMusic.loop ? "On" : "Off") + "</button></div>";
html += "<div class='set-row'><span>播放时停掉游戏 BGM</span><button class='btn btn-tiny " +
(MyMusic.duckGame ? "btn-primary" : "") + "' data-mm='duck'>" + (MyMusic.duckGame ? "On" : "Off") + "</button></div>";
html += "<h4>播放列表</h4><div class='codex-grid'>";
MyMusic.list.forEach(function (t, i) {
const on = (i === MyMusic.idx);
html += "<div class='codex-card" + (on ? " hot" : "") + "'>" +
"<div class='cc-name'>" + (on ? "\u266a " : "") + t.name + "</div>" +
"<div class='cc-sub'>" + fmtSize(t.size) + "</div>" +
"<div class='cc-sub'>" + (on ? "<span style='color:var(--gold2)'>Current</span>"
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
function openSettings() {
const on = (b) => (b ? "On" : "Off");
const musicOn = !(S && S.music === false);
const sfxOn = !(S && S.sfx === false);
const sp = (S && S.textSpeed !== undefined) ? S.textSpeed : 26;
const spLabel = sp === 0 ? "Instant" : (sp <= 12 ? "Fast" : (sp <= 26 ? "Medium" : "Slow"));
const html =
"<p>Options panel. Music, sound, saves and exit all live here.</p>" +
"<h4>Language</h4>" +
"<div class=\'set-row\'><span>Interface and Content Language</span></div>" +
"<div class='set-row set-btns'>" +
DATA.langCodes.map((c) =>
"<button class='btn btn-tiny" + (curLang() === c ? " btn-primary" : "") +
"' data-lang='" + c + "'>" + DATA.langNames[c] + "</button>").join("") +
"</div>" +
"<h4>Audio</h4>" +

"<div class='set-row'><span>自定音乐</span>" +
"<button class='btn btn-tiny" + (MyMusic.list.length ? " btn-primary" : "") +
"' data-set='mymusic'>" +
(MyMusic.list.length ? ("已加 " + MyMusic.list.length + " 首") : "添 加 音 乐") + "</button></div>" +
"<div class=\'set-row\'><span>BGM</span>" +
"<button class='btn btn-tiny " + (musicOn ? "btn-primary" : "") + "' data-set='music'>" + on(musicOn) + "</button></div>" +
"<div class=\'set-row\'><span>Sound Effects</span>" +
"<button class='btn btn-tiny " + (sfxOn ? "btn-primary" : "") + "' data-set='sfx'>" + on(sfxOn) + "</button></div>" +
"<div class=\'set-row\'><span>Music Volume</span><input type=\'range\' id=\'setVolMusic\' min=\'0\' max=\'100\' value=\'" +
Math.round(((S && S.musicVol !== undefined) ? S.musicVol : 0.7) * 100) + "'></div>" +
"<div class=\'set-row\'><span>Sound Volume</span><input type=\'range\' id=\'setVolSfx\' min=\'0\' max=\'100\' value=\'" +
Math.round(((S && S.sfxVol !== undefined) ? S.sfxVol : 0.8) * 100) + "'></div>" +
"<h4>Text</h4>" +
"<div class=\'set-row\'><span>Dialogue Speed (current: " + spLabel + "）</span></div>" +
"<div class='set-row set-btns'>" +
[["40","Slow"],["26","Medium"],["12","Fast"],["0","Instant"]].map((x) =>
"<button class='btn btn-tiny" + (String(sp) === x[0] ? " btn-primary" : "") +
"' data-speed='" + x[0] + "'>" + x[1] + "</button>").join("") +
"</div>" +
"<h4>Data</h4>" +
"<div class=\'set-row\'><span>Save Slots</span><button class=\'btn btn-tiny btn-primary\' data-set=\'slots\'>Open Save Slots</button></div>" +
"<div class='set-row set-btns'>" +
"<button class=\'btn btn-tiny\' data-set=\'export\'>Export Save</button>" +
"<button class=\'btn btn-tiny\' data-set=\'import\'>Import Save</button>" +
"</div>" +
"<h4>Leave</h4>" +
"<div class='set-row set-btns'>" +
"<button class=\'btn btn-tiny\' data-set=\'title\'>Back to Title</button>" +
"<button class=\'btn btn-tiny\' data-set=\'quit\'>Quit Game</button>" +
"</div>";
openModal("Settings", html);

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
askConfirm("Back to Title", "Return to the title screen?<br>Current progress is saved.", "Back", () => {
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
if (c === "en") return;
setLang("zh");
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
if (id === cur) { toast("Already at this difficulty."); return; }
if (diffRank(id) < diffRank(cur)) {
toast("难度不能回退 —— 选了【" + DATA.difficulties[cur].name + "】就只能往前走。");
return;
}
if (id === "hard" && !S.hardUnlocked) { toast("Hard is not unlocked yet."); return; }
if (id === "true" && !S.trueUnlocked) { toast("True is not unlocked yet."); return; }
const nm = DATA.difficulties[id].name;
if (force) {

doRestartTo(id, nm);
return;
}
askConfirm("重启主线",
"重启到【" + nm + "】？<br><br>· 主线会从第一传第一幕重新开始<br>· 等级、功勋、队友、Weapon、招募到的角色都会保留<br>· 关卡进度清零<br><br><b style='color:var(--bad)'>注意：这是不可逆的。重启后回不到更低的难度。</b>",
"重 启 到 【" + nm + "】",
function () {
doRestartTo(id, nm);
}, true);
}
function quitGame() {
if (isApp()) {
if (!confirm("Quit the game? Progress is saved; you can continue from a save slot next time.")) return;
saveGame(true);
try { if (window.HengAudio) window.HengAudio.stop(); } catch (e) {}
try { window.HengApp.quit(); return; } catch (e) {}
toTitle();
return;
}

if (!confirm("A browser cannot truly close the program.\\n\\nReturn to the title screen? Progress is saved.")) return;
saveGame(true);
try { if (window.HengAudio) window.HengAudio.stop(); } catch (e) {}
toTitle();
toast("Returned to the title screen. The browser version cannot close the window itself.");
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
(okLabel || "OK") + "</button>" +
"<button class=\'btn btn-ghost\' data-ask=\'no\'>Cancel</button>" +
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
"<div class='slot-no'>" + s.key + " slot" + (isAct ? " <span class=\'slot-tag\'>Current</span>" : "") + "</div>" +
(s.has
? "<div class='slot-main'><span class='slot-name'>" + m.name + "</span>" +
"<span class='slot-lv'>Lv." + m.level + "</span></div>" +
"<div class='slot-time'>" + fmtTime(m.at) + "</div>" +
"<div class='slot-sub'>" + (DATA.chapters[m.chapter] ? DATA.chapters[m.chapter].no : "—") +
"　·　" + (DATA.difficulties[m.difficulty] ? DATA.difficulties[m.difficulty].name : "Normal") +
"  ·  Honor " + (m.honor || 0) + "</div>" +
"<div class='slot-act'>" +
"<button class='btn btn-tiny btn-primary' data-load='" + s.key + "\'>Load</button>" +
"<button class='btn btn-tiny' data-save='" + s.key + "\'>Overwrite</button>" +
"<button class='btn btn-tiny btn-ghost' data-del='" + s.key + "\'>Delete</button>" +
"</div>"
: "<div class=\'slot-main\'><span class=\'slot-name muted\'>Empty</span></div>" +
"<div class='slot-time'>—</div>" +
"<div class='slot-act'>" +
"<button class='btn btn-tiny btn-primary' data-save='" + s.key + "\'>Save to This Slot</button>" +
"</div>") +
"</div>";
}).join("");
openModal("Save Slots",
"<div class='slot-head'>" +
"<span style=\'color:var(--muted)\'>Total " + SLOT_COUNT + " save slots. Each record shows the <b class=\'k\'>save time</b>, <b class=\'k\'>character name</b> and <b class=\'k\'>Lv level</b>.</span>" +
"<button class=\'btn btn-tiny warn-btn\' id=\'saveWarn\' title=\'Save notes\'>❗ Notes</button>" +
"</div>" +
"<div class='slot-grid'>" + rows + "</div>" +
"<div class='set-row set-btns' style='margin-top:14px'>" +
"<button class=\'btn btn-tiny\' data-set=\'export\'>Export Current Save</button>" +
"<button class=\'btn btn-tiny\' data-set=\'import\'>Import Save</button>" +
"<button class=\'btn btn-tiny btn-ghost\' data-set=\'close\'>Close</button>" +
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
askConfirm("Delete Save", "Delete " + k + "\'s save?<br>This cannot be undone.", "Delete", () => {
deleteSlot(k);
toast("Deleted " + k + " slot");
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
if (!raw) { toast("This save slot is empty."); return; }
askConfirm("Load Save", "Load " + key + " slot?<br>Unsaved progress will be lost.", "Load", () => {
doLoadSlot(key);
});
}
function doLoadSlot(key) {
const raw = loadFromSlot(key);
if (!raw) { toast("This save slot is empty."); return; }

try {
setActiveSlot(key);
const loaded = applyLoadedSave(raw);
if (!loaded) throw new Error("Invalid save data");
S = loaded;
saveGame(true);
closeModal();
renderMap();
show("map");
toast("Loaded " + key + " slot · " + (S.name || "") + " Lv." + (S.level || 1));
} catch (e) {
toast("Load Failed: " + (e && e.message ? e.message : "Save may be corrupted"));
if (S) { try { renderMap(); } catch (e2) {} }
}
}

function openSaveNotes() {
openModal("Save Notes",
"<p><b class=\'k\'>1. Desktop (browser)</b><br>" +
"Saves are stored locally by the browser. So long as you <b>do not clear browser data</b>, do not use private mode and do not switch browsers, deleting the game folder and downloading it again will <b>keep the saves</b> — because they follow the \"origin + browser\", not the game files.</p>" +
"<p style=\'color:var(--bad)\'>But if the game folder moves (a change of drive or path), the browser treats it as another origin, and the old saves become unreadable.</p>" +
"<p><b class=\'k\'>2. Mobile (APK)</b><br>" +
"Saves are stored in the application data directory. <b>Uninstalling the app deletes the saves with it</b>, and reinstalling will not restore them automatically. (Some Android systems with \"auto backup\" enabled may recover them, but do not count on it.)</p>" +
"<p><b class=\'k\'>3. The most reliable way: export</b><br>" +
"In the save-slot panel, tap <b>Export Save</b> to copy a block of text. Keep it in a note / cloud drive / chat log. After changing devices or reinstalling, tap <b>Import Save</b> and paste it back.</p>" +
"<p style=\'color:var(--muted)\'>Advice: export each save slot separately, naming it \"Name + Date\".</p>");
}

function exportSave() {
const payload = {
v: 1,
game: "Eternal Order: Blade Soul",
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
openModal("Export Save",
"<p>The text below is your entire save (all slots). <b class=\'k\'>Copy it</b> and keep it in a note, cloud drive, or chat log.</p>" +
"<p>After changing devices or reinstalling, use \"Import Save\" to paste it back.</p>" +
"<div class='stat-grid'>" +
box0("Save Slots", Object.keys(slotData()).length) +
box0("Size", Math.round(b64.length / 1024) + " KB") +
box0("Export Time", fmtTime(payload.at)) +
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
row.innerHTML = "<button class=\'btn btn-tiny btn-primary\' id=\'copySave\'>Copy</button>" +
"<button class=\'btn btn-tiny btn-ghost\' id=\'closeSave\'>Close</button>";
host.appendChild(row);
const cp = document.getElementById("copySave");
if (cp) cp.onclick = () => {
ta.select();
let ok = false;
try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
if (!ok && navigator.clipboard) {
navigator.clipboard.writeText(b64).then(() => toast("Copied to clipboard")).catch(() => toast("Long-press to select and copy manually"));
return;
}
toast(ok ? "Copied to clipboard" : "Long-press to select and copy manually");
};
const cs = document.getElementById("closeSave");
if (cs) cs.onclick = () => closeModal();
}
}
function box0(label, val) {
return "<div class='stat-box'><div class='s-name'>" + label + "</div><div class='s-val'>" + val + "</div></div>";
}
function importSave() {
openModal("Import Save",
"<p>Paste the exported text below and click \"Import\".</p>" +
"<p style=\'color:var(--bad)\'>Note: importing will <b>overwrite</b> all of your existing save slots.</p>");
const host = document.getElementById("modalBody");
if (!host) return;
const ta = document.createElement("textarea");
ta.className = "export-box";
ta.placeholder = "Paste save text here...";
host.appendChild(ta);
const row = document.createElement("div");
row.className = "set-row set-btns";
row.style.marginTop = "12px";
row.innerHTML = "<button class=\'btn btn-tiny btn-primary\' id=\'doImport\'>Import</button>" +
"<button class=\'btn btn-tiny btn-ghost\' id=\'cancelImport\'>Cancel</button>";
host.appendChild(row);
const di = document.getElementById("doImport");
if (di) di.onclick = () => {
const raw = (ta.value || "").trim();
if (!raw) { toast("Paste save text first."); return; }
let txt = raw;
if (raw.charAt(0) !== "{") {
try { txt = decodeURIComponent(escape(atob(raw))); } catch (e) { txt = raw; }
}
let obj = null;
try { obj = JSON.parse(txt); } catch (e) { toast("This text is not a valid save."); return; }
if (obj && obj.slots) obj = obj.slots;
if (!obj || typeof obj !== "object") { toast("Save data not recognized."); return; }
const data = {}, meta = {};
Object.keys(obj).forEach((k) => {
if (!/^\d+$/.test(k)) return;
data[k] = obj[k];
meta[k] = metaOf(obj[k]);
});
if (!Object.keys(data).length) { toast("There is no available save slot."); return; }
writeJSON(SLOTS_KEY, data);
writeJSON(SLOTS_META, meta);
setActiveSlot(String(Object.keys(data)[0]));
toast("Import Succeeded: " + Object.keys(data).length + " save slots");
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
if (S.spPrevSquad && S.spPrevSquad.length) {
S.squad = S.spPrevSquad.slice();
S.spPrevSquad = null;
}
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
'<span class=\"tl-power\">Power ' + power + "</span>" +
"</div>" +
(e.becomeNote ? '<div class="tl-note">' + e.becomeNote + "</div>" : "");
}).join('<div class=\"tl-gap\">· · ·   between generations   · · ·</div>');
openModal("Eternal Chronicle",
"<p style=\'color:var(--muted)\'>The table gives <b class=\'k\'>age at investiture</b>. Apart from the third, every holder took office at that age.</p>" +
"<h4>Generation Tiers</h4>" +
"<p>The Eternals are not contemporaries. When the fourth took office at twenty, the fifth was not yet born —" +
"By the time the fifth took office, the fourth had lived more years than anyone could count.</p>" +
"<p>So this ledger is <b class=\'k\'>layer pressed upon layer</b>: the further you leaf, the more those earlier people remain — only grown too old to be reckoned by age." +
"The third is the only exception — he does not follow this rule.</p>" +
"<div class='tl-wrap'>" + rows + "</div>" +
"<p style=\'color:var(--muted);margin-top:14px\'>Note: in the source material most holders\' birth years are not fully given," +
"So the <b>exact number of years between generations cannot be calculated</b>. Only what can be confirmed is kept here — age at investiture and order of succession.</p>");
}


function refreshDifficultyButton() {
const b = document.querySelector('[data-act="difficulty"]');
if (!b) return;
const showIt = !!(S && (S.gameCleared || S.hardUnlocked || S.trueUnlocked));
b.style.display = showIt ? "" : "none";
if (showIt) b.textContent = "Difficulty · " + diffConf().name;
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
host.innerHTML = '<span class=\"qs-title\">Side Quest</span>' +
'<span class=\"qs-none\">No active Side Quests — open \"Side Quest\" in the menu above to take a commission.</span>';
return;
}
const rows = tracked.map((q) => {
const p = questProgress(q);
const pct = Math.min(100, Math.round(p.have / p.need * 100));
const done = p.have >= p.need;
return '<div class="qs-row">' +
'<div class="qs-head"><span class="qs-name">' + q.name + "</span>" +
'<span class="qs-num">' + (done ? "Deliverable ✔" : p.have + " / " + p.need) + "</span></div>" +
'<div class="qbar"><i style="width:' + pct + '%"></i></div></div>';
}).join("");
host.innerHTML = '<span class=\"qs-title\">Side Quest</span><div class=\"qs-items\">' + rows + "</div>";
}
function renderHud() {
const bs = baseStats(S);
el("hudGlyph").textContent = S.name.slice(0, 1);
el("hudName").textContent = S.name;
el("hudRank").textContent = currentRank();
el("hudStats").innerHTML =
'<span class="lv">Lv.<b>' + S.level + "</b></span>" +
'<span class="diff-tag d-' + diffId() + '">' + diffConf().short + "</span>" +
(strictNoSkip() ? '<span class=\"strict-tag\" title=\"At this difficulty a loss blocks progress; you can only retry or withdraw for now to level up\">◆ No Skipping</span>' : "") +
"<span>HP <b>" + Math.round(S.hp) + "/" + bs.hp + "</b></span>" +
"<span>Strength <b>" + bs.atk + "</b></span>" +
"<span>Defense <b>" + bs.def + "</b></span>" +
"<span>Speed <b>" + bs.spd + "</b></span>" +
"<span>Will <b>" + bs.will + "</b></span>" +
"<span>EXP <b>" + Math.floor(S.exp) + "/" + expNeeded(S.level) + "</b></span>" +
"<span>Honor <b>" + (S.honor || 0) + "</b></span>" +
"<span>Party <b>" + ((S.squad || []).length) + "/" + squadCap() + "</b></span>" +
"<span>Members <b>" + ((S.allies || []).length) + "</b></span>" +
(S.points ? '<span style=\"color:var(--gold2)\">Potential Points <b>' + S.points + "</b></span>" : "") +
(devOn() ? '<span style=\"color:#ffd76b\">Dev Mode <button class=\"btn btn-tiny\" data-act=\"dev\" style=\"margin-left:6px\">DEV</button></span>' : "") +
'<span><button class=\"btn btn-tiny\" data-act=\"speed\">Presentation:' + (S.animSpeed === "slow" ? "Slow" : S.animSpeed === "fast" ? "Fast" : "Standard") + "</button></span>";
}

function enterChapter() {
const i = UI.selectedChapter;
const ch = DATA.chapters[i];
const cs = chapterState(i);
const isFinal = i >= DATA.chapters.length - 1;
if (cs.stages >= ch.stages.length) {
if (cs.done) {

if (isFinal) { replayChapter(i); return; }
toast("This Chronicle is already complete.");
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
toast("Replay the finale · will not affect your progress");
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
toast("Replay finished. Progress was not changed.");
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
allyLine = "<h4>Bond</h4><p class=\'k\'>" + ever.no + " · " + ever.name + "</p><p>" +
ever.summon.name + "：" + ever.summon.text + "</p>" +
(S.summonId ? "" : "<p style=\'color:var(--gold2)\'>You have not yet chosen a Fated Bond. Go to the \"Party\" panel and select one to call their \"Descent\" in battle.</p>");
}
}

if (i >= DATA.chapters.length - 1) {
const wasCleared = !!S.gameCleared;
const clearedOn = diffId();
onGameCleared();
if (!wasCleared) {
setTimeout(() => {
openModal("Cleared · Heng",
"<p>You have finished all twelve chronicles. From the first, \"Heng\", to the eleventh, \"Mang\", and that old debt with the [X] squad.</p>" +
"<p style=\'color:var(--gold2)\'>Cleared difficulty: " + DATA.difficulties[clearedOn].name + "</p>" +
"<h4>A New Path</h4>" +
"<p>A <b>Difficulty</b> button has appeared on the map page. You can switch now.</p>" +
"<p>" + (clearedOn === "normal"
? "[Hard] unlocked — enemy HP +55%, Attack Level +22%, Defense +12%; EXP +45%, Honor +60%."
: (clearedOn === "hard"
? "[True] unlocked — enemy HP ×2.2, Attack Level +45%, Defense +28%; EXP ×2.1, Honor ×2.4."
: "You have already finished it on True difficulty."))
+ "</p><p style=\'color:var(--muted)\'>Difficulty affects only battles entered afterward, and can be switched back to Normal at any time.</p>");
}, 400);
}
}
saveGame(true);
const next = DATA.chapters[i + 1];
openModal("Chronicle Complete · " + ch.no + " " + ch.name,
"<p>" + ch.name + "\'s life has been entered into the Organization archive.</p>" +
(next ? "<p style=\'color:var(--ok)\'>A new Chronicle is unlocked: " + next.no + " · " + next.name + "</p>" : "") +
(ch.unlock ? "<h4>Motto</h4><p class=\'k\'>" + ch.unlock + "</p>" : "") +
allyLine +
"<p style=\'color:var(--dim)\'>Return to the chronicle map to continue.</p>");
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
el("storyProgress").textContent = "No. " + (S.stage + 1) + " / " + ch.stages.length + " Act";
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
if (advanceHint) advanceHint.textContent = "Click anywhere to speed up";
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
setNext("Continue", () => {
if (queue.length) nextStory();
else renderStoryEnd();
});
if (advanceHint) advanceHint.textContent = "Click anywhere to speed up";
});
}
function renderChoice(item) {
storyHead();
el("storyGlyph").textContent = "Pick";
el("storySpeaker").textContent = "Choice";
const t = el("storyText");
t.className = "story-text"; t.textContent = "What will you do?";
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
setNext("Continue", () => {
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
el("storyGlyph").textContent = "Record";
el("storySpeaker").textContent = "Chronicle";
const t = el("storyText");
t.className = "story-text narr";
t.textContent = lines.length ? lines.map((l) => l[1]).join("\n") : "……";
el("choiceList").innerHTML = "";
setNext("Continue", () => nextStory());
saveGame(true);
}
function renderBattleIntro(stage) {
storyHead();
const ch = DATA.chapters[S.chapterIndex];
el("storyProgress").textContent = "Encounter · Battle";
el("storyGlyph").textContent = ch.enemy.glyph;
el("storySpeaker").textContent = "Encounter";
prepStage(stage);
const t = el("storyText");
t.className = "story-text";
t.textContent = "【" + tr(stage.title) + "】\n\n" + tr(stage.intro || "") +
"\\n\\nEnemy:" + (stage.enemyKeys || [stage.enemy]).map((k) => DATA.enemies[k].name).join("、");
el("choiceList").innerHTML = "";
setNext("Enter Battle", () => startBattle(stage));
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
openModal("This scene has ended",
"<p>Current progress: Chapter " + cs.stages + " / " + ch.stages.length + " Act.</p>" +
"<p style=\'color:var(--muted)\'>Return to the chronicle map to keep advancing.</p>");
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

function finalPower(unit, skill, nCoins) {
const coins = Math.max(0, nCoins === undefined ? skill.coins : nCoins);
if (coins <= 0) return { power: 0, heads: 0, marks: [], base: 0 };
const f = flipCoins(coins, safeNum(unit.sp, 0));
const cb = safeNum(skill.coin, 1) + safeNum(unit.coinBonus, 0);
const base = safeNum(skill.base, 6) + safeNum(unit.atkLevel, 6);
var pw = base + f.heads * Math.max(1, cb);
if (!isFinite(pw)) pw = 1;
return { power: Math.max(1, Math.round(pw)), heads: f.heads, marks: f.marks, base: base };
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
function effDefMult(u) {
let m = 1;
u.buffs.forEach((b) => { if (b.stat === "def" && b.mult) m *= b.mult; });
return m;
}
function effSpd(u) {
let m = 1;
u.buffs.forEach((b) => { if (b.stat === "spd" && b.mult) m *= b.mult; });
return Math.max(1, Math.round(u.speed * m));
}
function effAtkLevel(u) {
let m = 1;
u.buffs.forEach((b) => { if (b.stat === "atk" && b.mult) m *= b.mult; });
return Math.max(1, Math.round((u.atkLevel + (u.weapon ? (u.weapon.atk || 0) : 0)) * m));
}
function weaponCoinBonus(u) {
let n = u.weapon ? (u.weapon.coin || 0) : 0;
u.buffs.forEach((b) => { if (b.stat === "coin") n += (b.amount || 0); });
return n;
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
"Sword": ["sword_still", "sword_guard"],
"Bow": ["bow_return", "bow_early"],
"Blade": ["blade_vein", "blade_silent"],
"Spear": ["spear_line", "spear_pierce"],
"Axe": ["axe_break", "axe_quake"],
"Fist": ["fist", "broken_shell"],
"Leg": ["kick"],
"General": ["kick", "fist"]
};
function allyAbilities(ally, w) {
if (ally.loadout && ally.loadout.length) return ally.loadout.slice();
const set = SCHOOL_ABIL[(w && w.school) || "General"] || SCHOOL_ABIL["General"];
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
abilities: eSkills.length ? eSkills.map((c) => c.name) : ["Bite"]
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
function unitSkillList(u) {
if (u.side === "enemy") {
const def = B.enemyDefs[u.uid];
return enemyCoinSkills(def);
}
return u.abilities.map(abilityToCoin).filter(Boolean);
}

function startBattle(stage) {

const bad = squadLegality();
if (bad) {
toast(bad);
try { if (typeof openSquad === "function") openSquad(); } catch (e) {}
return false;
}
const squad = squadUnits();
if (!squad.length) { toast("The Party is empty. Set your lineup in \"Party\" first."); return false; }
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
(assistList.length ? "　＋ Assistance " + assistList.map((u) => u.name).join("、") : "") +
(isNormalDiff() ? "" : "　【" + diffConf().name + "】");
el("battleLog").innerHTML = "";
el("floatZone").innerHTML = "";
show("battle");
logLine("l-sys", "【" + stage.title + "】");
if (stage.intro) logLine("l-act", tr(stage.intro));
const note = DATA.enemies[keys[0]] && DATA.enemies[keys[0]].note;
if (note) logLine("l-boss", note);
if (assistList.length) assistBanner(assistList);
logLine("l-sys", "Move Combination rules: combine at most " + ((DATA.combo && DATA.combo.maxMoves) || 4) +
" Moves chained into one strike. The first Move always hits; after that, each Move\'s success rate is decided by \"Affinity with the previous Move\" —" +
"Moves of the same category (Fist→Leg, Fist→Sword) link cleanly; melee into ranged loses a great deal of rate. If any move misses, the chain breaks at once.");
const ev = DATA.ever.find((x) => x.id === S.summonId);
if (ev) logLine("l-boss", "Natal Bond: " + ev.summon.name + " is ready (party-wide buff + a single-target Descent strike).");
beginRound();
}
function beginRound() {
if (B.over) return;
B.round++;
el("btlTurn").textContent = "Round " + B.round;
B.phase = "assign";

B.units.concat(B.enemies).forEach((u) => {
if (!u.alive) return;
if (u.isPlayer) u.sp = clamp(u.sp + 2, SP_MIN, SP_MAX);
tickUnitBuffs(u);
Object.keys(u.cds).forEach((k) => { if (u.cds[k] > 0) u.cds[k]--; });
if (u.sp <= PANIC_AT) {
if (!u.panic) { u.panic = true; logLine("l-dead", u.name + " Sanity below " + PANIC_AT + ", falls into [Panic] — drops the turn."); }
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
logLine("l-sys", "—— No. " + B.round + " Turn · setup phase. Build one chain for each member and set their targets.");
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
if (ph && ph[0] && !B.phaseShown) {  }
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
function autoActionFor(u) {
if (!u.alive) return null;
if (u.panic) return { kind: "panic" };
const live = B.enemies.filter((e) => e.alive);
if (!live.length) return null;
const C = window.HengCombo;
const chain = u.isPlayer ? autoComboFor(u) : (C ? C.enemyCombo(u) : ["m_jab"]);
let tgt = live[Math.floor(Math.random() * live.length)];
if (u.isPlayer) {

const my = B.enemies.findIndex((e) => e.intent && e.intent.targetUid === u.uid && e.alive);
if (my >= 0) tgt = B.enemies[my];
else if (u.actionTarget) {
const t2 = live.find((e) => e.uid === u.actionTarget);
if (t2) tgt = t2;
}
}
return { chain: chain, targetUid: tgt.uid, kind: "combo" };
}

function selectUnit(uid) {

const raw = String(uid || "");
let i = B.units.findIndex((u) => u.uid === raw);
if (i < 0) {
const bare = bareUid(raw);
i = B.units.findIndex((u) => u.uid === bare);
}
if (i < 0) return;
if (B.units[i].assist) { toast("Assist characters are run by the story. You cannot command them."); return; }
B.sel = i;
renderBattle();
}

function nextControllable(from) {
const n = B.units.length;
for (let k = 1; k <= n; k++) {
const i = ((from + k) % n + n) % n;
const u = B.units[i];
if (u && u.isPlayer && u.alive && !u.assist) return i;
}
return -1;
}
function selectSkill(idx) {  }


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
if (!tgt || !tgt.alive) { toast("The target has already fallen."); return; }
u.actionTarget = tgt.uid;
logLine("l-act", u.name + " target → " + tgt.name);
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
logLine("l-sys", "Chains have been auto-built for all members.");
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
if (el("ccRound")) el("ccRound").textContent = "Clash " + st.round + " / " + res.log.length;
const lside = lc && lc.parentNode, rside = rc && rc.parentNode;
if (lside && lside.classList) { lside.classList.toggle("winning", st.allyPow > st.enemyPow); lside.classList.toggle("losing", st.allyPow < st.enemyPow); }
if (rside && rside.classList) { rside.classList.toggle("winning", st.enemyPow > st.allyPow); rside.classList.toggle("losing", st.enemyPow < st.allyPow); }
const m = el("ccVs");
if (m) { m.classList.toggle("win", st.allyPow > st.enemyPow); m.classList.toggle("lose", st.enemyPow > st.allyPow); }
await delay((i === 0 ? 300 : 165) * animScale());
if (st.broke === "enemy") { ccShatter(rc, destroyedEnemy++); await delay(140 * animScale()); }
else if (st.broke === "ally") { ccShatter(lc, destroyedAlly++); await delay(140 * animScale()); }
else { if (el("ccRound")) el("ccRound").textContent = "Draw · Both keep one coin"; await delay(110 * animScale()); }
for (let k = 0; k < res.log.length; k++) {  break; }
}
const v = el("ccVerdict");
if (v) {
try { window.__clashVerdict = (window.__clashVerdict || 0) + 1; window.__clashLastWinner = res.winner; } catch (e) {}
v.textContent = res.winner === "ally" ? "Clash Victory" : res.winner === "enemy" ? "Clash Defeat" : "Draw";
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
try { logLine("l-sys", "　" + target.name + " dodge, negate " + Math.round(cut) + " damage."); } catch (e) {}
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
logLine("l-act", "[Union]" + u.name + " → " + a.chain.map((id) => (C.move(id) || {}).name).join(" ⇢ ") +
"　Objective:" + tgt.name);
let total = 0;
for (let i = 0; i < res.steps.length; i++) {
const st = res.steps[i];
await delay(150 * (typeof animScale === "function" ? animScale() : 1));
if (!st.ok) {
logLine("l-dead", "　" + (i + 1) + ". 【" + st.name + "] Success Rate " + st.pct + "% ｜ Rolled " + st.roll +
" → Miss, the chain breaks.");
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
logLine("l-hit", "　" + (i + 1) + ". 【" + st.name + "】（" + st.type + ") Success Rate " + st.pct +
"% ｜ Rolled " + st.roll + " → Hit " + Math.round(hitDmg) + " pts" +
(m.multi && m.multi > 1 ? "（" + m.multi + " hits)" : "") + ". (Affinity " +
(st.affPct === null ? "—" : st.affPct + "%") + "）");
if (m.aoe) {
foeList.forEach((e) => { if (e.alive && e.uid !== tgt.uid) applyHp(e, C.damage(u, m, e, enemySide) * 0.6, ""); });
logLine("l-hit", "　　(hits the remaining targets in range)");
}
} else {
logLine("l-heal", "　" + (i + 1) + ". 【" + st.name + "】" + (st.note || "Active") + "。");
}
}
if (res.shield) {
const cap = u.maxHp * 0.18;
const amt = Math.max(0, Math.min(u.maxHp * res.shield, cap - u.shield));
u.shield += amt;
if (amt > 0) { floatNum(targetNodeOf(u), "+" + Math.round(amt), "heal"); logLine("l-heal", "　Shield +" + Math.round(amt) + "。"); }
}
if (res.dodge) {
u.dodgeReady = res.dodge;
logLine("l-heal", "　Enter Dodge stance (negates the next incoming attack by " + Math.round(res.dodge * 100) + "%）。");
}

const lastMove = res.steps.length ? C.move(res.steps[res.steps.length - 1].id) : null;
if (lastMove && lastMove.weak) { tgt.weakNext = 1; logLine("l-sys", "　" + tgt.name + " next hit accuracy down."); }
if (res.landed >= 2) logLine("l-crit", " Chain formed: Hit " + res.landed + " Moves, damage x" + (res.bonus || 1).toFixed(2) + "。");
if (total > 0) floatNum(targetNodeOf(tgt), "-" + Math.round(total), res.landed >= 3 ? "crit" : "");

u.sp = clamp(u.sp + res.landed * 2, SP_MIN, SP_MAX);
return res;
}
async function resolveActionAsync(act) {

const u = B.units.find((x) => x.uid === act.uid) || B.enemies.find((x) => x.uid === act.uid);
if (!u || !u.alive) return null;
const a = u.action;
if (!a || a.kind === "panic") {
if (u.panic) logLine("l-dead", u.name + " cannot act from Panic.");
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
"[Clash]" + u.name + "\'s [" + sk.name + "] vs " + tgt.name + "\'s [" + eSkill.name + "】：" +
(res.winner === "ally" ? "Won (" + res.wins + " suppression)" : res.winner === "enemy" ? "negative (Suppressed " + res.losses + " times)" : "Tie") +
" ｜ Remaining Coins " + res.allyCoins + " vs " + res.enemyCoins + " ｜ Clash " + res.rounds + " times");

coinRow(u, sk.coins, res.marks[0] ? res.marks[0].a : 0, res.marks[0] ? res.marks[0].a : 0);
coinRow(tgt, eSkill.coins, res.marks[0] ? res.marks[0].e : 0, res.marks[0] ? res.marks[0].e : 0);
if (res.winner === "ally") {
const hits = Math.min(7, Math.max(1, res.allyCoins + (sk.extraCoin || 0)));
if (sk.aoe) {
let tot = 0;
B.enemies.forEach((e) => { if (e.alive) tot += applyHp(e, coinDamage(u, e, sk, hits, clashWins), ""); });
floatNum("enemy_" + tgt.uid, "-" + Math.round(tot / Math.max(1, B.enemies.filter((e) => e.alive).length)), "crit");
logLine("l-crit", "Area attack hits all enemies, totaling " + Math.round(tot) + " damage.");
} else {
const dmg = coinDamage(u, tgt, sk, hits, clashWins);
applyHp(tgt, dmg, "");
logLine("l-hit", "Deal " + Math.round(dmg) + " damage (" + hits + " coins).");
applySkillEffect(u, sk, tgt);
}
} else if (res.winner === "enemy") {
const hits = Math.min(7, Math.max(1, res.enemyCoins));
const dmg = coinDamage(tgt, u, eSkill, hits, clashWins);
applyHp(u, dmg, "");
logLine("l-hit", u.name + " takes " + Math.round(dmg) + " damage (" + hits + " coins).");
if (eSkill.kind === "drain") healActorBy(tgt, dmg * (eSkill.heal || 0.4));
if (eSkill.debuff) {
u.buffs.push({ stat: eSkill.debuff.stat, mult: eSkill.debuff.mult || 0.8, turns: eSkill.debuff.turns || 3, label: eSkill.debuff.label });
logLine("l-dead", u.name + " was inflicted with \"" + eSkill.debuff.label + "」。");
}
if (eSkill.aoe) {
B.units.forEach((x) => { if (x.alive && x.uid !== u.uid) applyHp(x, coinDamage(tgt, x, eSkill, Math.max(1, hits - 1), clashWins) * 0.7, ""); });
logLine("l-hit", tgt.name + "\'s area attack also hits other members.");
}
} else {
logLine("l-sys", res.rounds + " Clashes ended with no winner; both sides keep their coins.");
}
return res;
}
function applySkillEffect(u, sk, tgt) {
if (sk.heal) {
const amt = u.maxHp * sk.heal + (sk.powerHeal ? u.atkLevel * sk.powerHeal : 0);
healActorBy(u, amt);
logLine("l-heal", u.name + " restore " + Math.round(amt) + " HP.");
}
if (sk.shield || sk.baseShield || sk.powerShield) {
let amt = u.maxHp * (sk.shield || sk.baseShield || 0.08) + (sk.powerShield ? u.atkLevel * sk.powerShield : 0);

const cap = u.maxHp * 0.18;
amt = Math.max(0, Math.min(amt, cap - u.shield));
u.shield += amt;
floatNum(targetNodeOf(u), "+" + Math.round(amt), "heal");
logLine("l-heal", u.name + " gained Shield " + Math.round(amt) + "。");
}
if (sk.kind === "cleanse") {
u.buffs = u.buffs.filter((b) => (b.mult || 1) >= 1);
u.sp = clamp(u.sp + 10, SP_MIN, SP_MAX);
logLine("l-heal", u.name + " clears all negative status. Sanity +10.");
}
if (sk.buff) {
u.buffs.push({ stat: sk.buff.stat, mult: sk.buff.mult, turns: sk.buff.turns, label: sk.buff.label });
logLine("l-heal", u.name + " enters 「" + sk.buff.label + "」。");
}
if (sk.debuff && tgt) {
tgt.buffs.push({ stat: sk.debuff.stat, mult: sk.debuff.mult || 0.8, turns: sk.debuff.turns || 3, label: sk.debuff.label });
logLine("l-sys", tgt.name + " was inflicted with \"" + sk.debuff.label + "」。");
}
if (sk.bleed && tgt) {
const b = Math.round((u.atkLevel + (sk.atkBonus || 0)) * sk.bleed * 0.6);
tgt.buffs.push({ stat: "bleed", mult: 1, turns: (sk.bleedTurns || 3) + 1, label: "Bleed", bleed: b });
logLine("l-crit", tgt.name + " starts Bleeding (each turn " + b + " pts).");
}
if (sk.selfCost) {
const c = u.maxHp * sk.selfCost;
u.hp = Math.max(1, u.hp - c);
floatNum(targetNodeOf(u), "-" + Math.round(c), "");
logLine("l-hit", u.name + " endures " + Math.round(c) + " self-damage.");
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
logLine("l-hit", u.name + " lost from Bleed " + b.bleed + " HP.");
}
b.turns = (b.turns || 1) - 1;
return b.turns > 0;
});
u.shield = Math.max(0, u.shield - u.maxHp * 0.05);
}

const DESCEND_FX = {
heng: { tint:"#d8b45c", aura:{ label:"Heng Sword Stance", def:1.25, turns:3 }, shield:0.22,
text:"The sword\'s momentum does not disperse. A back appeared before you — the blow he failed to block in life, blocked this time." },
liguangyang: { tint:"#e0a04b", aura:{ label:"Discipline of Hatred", atk:1.25, turns:3 },
text:"\"The living have to finish this.\" The whole party\'s strength was pulled taut by that one line." },
siyuan: { tint:"#f2dfa4", aura:{ label:"Seat of the Chief", atk:1.25, def:1.2, turns:3 }, shield:0.4, sp:20,
text:"He did not strike. He only stepped in front of you — as he once stepped in front of everyone." },
liyaohui: { tint:"#7fd8ff", aura:{ label:"Sovereign of Ice Crystals", def:1.35, turns:3 }, shield:0.35,
text:"The cold arrives first, the sound after. Frost spreads across the ground to the enemy\'s feet." },
chengmoge: { tint:"#e0a04b", aura:{ label:"Godslayer", atk:1.3, turns:3 },
text:"He fights with an apprentice\'s seriousness — every Move he checks whether he learned it right." },
xiaoran: { tint:"#b48cff", aura:{ label:"Lord of the Void", atk:1.2, sp:16, turns:3 },
text:"A void spreads out from underfoot. Every rule written in advance is void here." },
luolan: { tint:"#d8b45c", aura:{ label:"Talent x128", atk:1.3, turns:3 },
text:"He learns impossibly fast — he saw that Move only once." },
sihuiyan: { tint:"#ffd76b", aura:{ label:"Godmaker", atk:1.2, def:1.2, turns:3 }, sp:14,
text:"The approval of an entire divine remains rests on this blow. She did not use a sword, as if in disdain." },
xiaoyahui: { tint:"#7fd8ff", aura:{ label:"Enforcer", atk:1.25, turns:3 }, sp:12,
text:"He laid out the Heng Sword Arts like a clause, then executed it on the spot." },
jiangmoran: { tint:"#ffe08a", aura:{ label:"Beloved of the Stars", atk:1.2, turns:3 }, shield:0.2,
text:"When the stars fell, he still smiled for the camera." },
mang: { tint:"#b48cff", aura:{ label:"Vessel of Bewilderment", def:1.2, sp:22, turns:3 },
text:"The dial clicked. For that second, time was his to command." }
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
b.textContent = "Descent · " + ev.name;
mic.parentNode.appendChild(b);
setTimeout(() => b.remove(), 1000);
}
}
async function runSummonSkill(userUid) {
const ev = DATA.ever.find((x) => x.id === S.summonId);
if (!ev) { toast("You have not yet chosen a destined bond."); return; }
const u = B.units.find((x) => x.uid === userUid) || B.units.find((x) => x.isPlayer && x.alive);
if (!u) return;
u.action = { kind: "summon", skillId: "__summon", skill: { name: ev.summon.name, coins: 1, base: 1 } };
B.summoner = u.uid;
logLine("l-boss", "[Descent]" + u.name + " called " + ev.no + " · " + ev.name + "。");
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
logLine("l-hit", u.name + " took on the part the body could not bear:" + Math.round(self) + " self-damage.");

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
logLine("l-boss", "[Descent · Party Buff]" + (fx.aura ? fx.aura.label + "（" + fx.aura.turns + " rounds)" : "—") +
(fx.shield ? " ｜ Party Shield +" + Math.round(fx.shield * 100) + "%" : "") +
(fx.sp ? " ｜ Party Sanity +" + fx.sp : ""));

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
logLine("l-crit", "The power of Descent sweeps the field, totaling " + Math.round(total) + " damage (ignores Defense, ignores Shield).");
u.cds.__summon = 5;
B.summoner = null;
}

function livingAllies() { return B.units.filter((u) => u.alive); }
function livingEnemies() { return B.enemies.filter((u) => u.alive); }
function checkDeaths() {
B.units.concat(B.enemies).forEach((u) => {
if (u.alive && u.hp <= 0) {
u.alive = false;
logLine("l-dead", u.name + " has fallen.");
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
logLine("l-sys", "（" + u.name + "\'s action had a resolution error and was skipped:" + (err && err.message) + "）");
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
logLine("l-boss", "（" + e.name + "\'s momentum shifted.)");
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
el("btlPhase").textContent = "Clash Phase";

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
logLine("l-sys", "—— Moves resolve jointly (in Speed order).");
renderSkills();
try {
return resolveNext(0);
} catch (err) {
logLine("l-sys", "(Clash sequence error, going straight to end of turn:" + (err && err.message) + "）");
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
logLine("l-sys", "—— Turn end.");
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
function shakeNode(id) {
const n = nodeById(id);
if (!n || !n.classList) return;
n.classList.add("hit");
setTimeout(() => n.classList.remove("hit"), 340);
}
function castNode(id) {
const n = nodeById(id);
if (!n || !n.classList) return;
n.classList.add("cast");
setTimeout(() => n.classList.remove("cast"), 480);
}
function coinRow(u, total, heads, _h2) {
let s = "";
for (let i = 0; i < total; i++) s += '<span class="coin ' + (i < heads ? "h" : "t") + '"></span>';
return s;
}
function spBar(u) {
const pct = ((u.sp - SP_MIN) / (SP_MAX - SP_MIN)) * 100;
return '<div class="bar bar-sp"><div class="bar-fill sp-fill" style="width:' + clamp(pct, 0, 100) + '%"></div>' +
'<span class=\"bar-text\">Sanity ' + Math.round(u.sp) + "</span></div>";
}
function hpBar(u) {
const pct = clamp((u.hp / u.maxHp) * 100, 0, 100);
return '<div class="bar"><div class="bar-fill hp-fill" style="width:' + pct + '%"></div>' +
'<span class="bar-text">' + Math.round(u.hp) + " / " + u.maxHp + (u.shield > 0 ? "(Shield " + Math.round(u.shield) + "）" : "") + "</span></div>";
}
function renderBattle() {
if (!B) return;
el("btlTurn").textContent = "Round " + B.round;
el("btlPhase").textContent = B.phase === "assign" ? (B.locked ? "Clash Phase" : "Formation Phase") : "Clash Phase";
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
'<div class="nm">' + e.name + (e.panic ? " ｜ Panic" : "") + "</div>" +
'<div class="hpbig">' + hpBar(e) + "</div>" + spBar(e) +
'<div class="intent">' + (sk ? "Intent: " + sk.name + "（" + sk.base + "+" + sk.coins + "×" + sk.coin + "）" +
" → " + (e.intent.targetName || "—") : "(Down)") + "</div>";
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
'<div class="an"><span>' + u.name + (u.timelineTwin ? " <b class=\'twin-mark\'>Counterpart</b>" : "") +
'</span><span class="ar">' +
(u.assist ? "Assist · Uncontrollable" : (u.ally ? (DATA.recruit.tiers[u.rarity] || {}).name || "" : "")) + "</span></div>" +
hpBar(u) + spBar(u) +
'<div class="asel">' + (u.alive
? (u.assist ? "Story Assist · acts on its own via the script"
: (u.panic ? "Panic · Fumble"
: (chainTxt ? "Chain: " + chainTxt + (tgt ? "　→ " + tgt.name : "")
: "Not set · tap Moves below to build a chain, then tap an enemy to set the target")))
: (u.assist ? "Assistance Withdrawn" : "Down")) + "</div>" +
(chainTxt && !u.assist ? '<div class="chain-badge">' + u.chain.length + " Moves</div>" : "");
slot.onclick = () => { if (u.assist) toast("Assist characters are run by the story. You cannot command them."); else selectUnit(u.uid); };
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
chainHost.innerHTML = '<span class=\"combo-empty\">Select a member above first.</span>';
return;
}
if (u.assist) {
chainHost.innerHTML = '<span class=\"combo-empty\">[Assist Character]' + u.name +
' acts on his own via the story; you cannot build chains for him. (He still fights in the party)</span>';
return;
}
u.chain = u.chain || [];
const foeList = B.enemies.filter((e) => e.alive);
const tgt = foeList.find((e) => e.uid === u.actionTarget) || foeList[0] || null;
const pv = C.preview(u, u.chain, tgt, false);
if (!u.chain.length) {
chainHost.innerHTML = '<span class=\"combo-empty\">No Move chosen yet — tap a Move below to start a chain (up to ' +
(DATA.combo.maxMoves || 4) + ' move)' + (tgt ? "　Objective:" + tgt.name : "") + "</span>";
} else {
u.chain.forEach((id, i) => {
const st = pv.steps[i];
const m = C.move(id) || {};
const step = document.createElement("div");
step.className = "combo-step " + typeCls(st ? st.type : m.type);
step.innerHTML =
'<span class=\"cs-idx\">No. ' + (i + 1) + " Moves</span>" +
'<span class="cs-name">' + (st ? st.glyph + " " + st.name : m.name) + "</span>" +
'<span class="cs-hit' + (st && st.pct < 60 ? " low" : "") + '\">Hit ' + (st ? st.pct : "?") + "%" +
(i === 0 ? "(first Move always hits)" : "") + "</span>" +
'<span class="cs-aff">' + (st && st.affPct !== null ? "Affinity " + st.affPct + "%" : "Opening") + "</span>" +
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
tail.innerHTML = '<span class=\"cs-name\">Chain Success Rate</span><span class=\"cs-hit\">' + rest + "%</span>" +
'<span class=\"cs-aff\">Can chain ' + Math.max(0, (DATA.combo.maxMoves || 4) - u.chain.length) + " Moves</span>";
chainHost.appendChild(tail);
}

const maxed = u.chain.length >= (DATA.combo.maxMoves || 4);
const ids = C.unitMoves(u);
ids.forEach((id) => {
const m = C.move(id);
if (!m) return;
const prev = u.chain.length ? u.chain[u.chain.length - 1] : null;
const h = C.hitChance(u, prev, id, tgt, false);
const affTxt = prev ? ("Affinity " + (h.affPct !== null ? h.affPct + "%" : "—") + " ｜ Hit " + h.pct + "%")
: ("Opener ｜ Hit " + h.pct + "%");
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
mk("Clear Chain", "btn-ghost", () => { u.chain = []; renderBattle(); }, !u.chain.length);
mk("Auto Combine", "", () => { u.chain = autoComboFor(u); renderBattle(); });
mk("Select Target" + (tgt ? "：" + tgt.name : ""), "btn-ghost", () => {
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
if (u.chain.length >= max) { toast("Chain at maximum (" + max + " move)."); return; }
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
logLine("l-sys", "(resolution failed to start:" + (err && err.message) + "）");
B.locked = false;
try { endRound(); } catch (e2) { B.locked = false; }
return;
}
if (pr && typeof pr.then === "function") {
pr.catch(function (err) {
logLine("l-sys", "(resolution error, forcing the turn to end:" + (err && err.message) + "）");
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
btn.innerHTML = '<div class=\"skill-name\"><span>Confirm Strike</span><span class=\"skill-cost\">resolves by Speed</span></div>' +
'<div class=\"skill-desc\">All members\' chains resolve in Speed order, and the enemy strikes back.</div>';
btn.onclick = () => commitAll();
bar.appendChild(btn);
const auto = document.createElement("button");
auto.className = "skill";
auto.disabled = B.locked;
auto.innerHTML = '<div class=\"skill-name\"><span>Auto-Join All</span></div>' +
'<div class=\"skill-desc\">Automatically assembles a chain for every member and assigns targets.</div>';
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
nb.textContent = "Stage Rule: Items disabled";
nb.disabled = true;
node.appendChild(nb);
mk("Medical Division · restore 30% HP (Honor 250)", () => useHeal(), B.locked || (S.honor || 0) < 250);
return;
}
mk("Medical Division · restore 30% HP (Honor 250)", () => useHeal(), B.locked || (S.honor || 0) < 250);
const bag = S.bag || {};
const usable = DATA.items.filter((it) => (bag[it.id] || 0) > 0);
if (!usable.length) mk("Item · Empty", () => toast("You have no Items. Check the \"Item\" panel, or farm Honor in the Arena to buy some."), true, "btn-ghost");
usable.slice(0, 5).forEach((it) => mk("Use " + it.name + " ×" + bag[it.id], () => useItemBattle(it.id), B.locked));
const ev = DATA.ever.find((x) => x.id === S.summonId);
if (ev) {
const cd = (B.units[B.sel] && B.units[B.sel].cds.__summon) || 0;
mk("[Descent]" + ev.summon.name + (cd > 0 ? "(Cooldown " + cd + "）" : ""), () => runSummonSkill(B.sel),
B.locked || cd > 0, "btn-primary");
}
}

function winBattle() {
if (!B) return; 
if (B.over) return;
B.over = true; B.locked = true; B.stageWin = true;
livingEnemies().forEach((e) => { e.alive = false; });
renderBattle();
logLine("l-crit", "Battle over — you win.");
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
logLine("l-crit", "[First Win] Honor gained " + bb.honor + "。");
if (bb.reward) {
var rw = DATA.weapons.filter(function (w) { return w.id === bb.reward; })[0];
var ri = DATA.items.filter(function (x) { return x.id === bb.reward; })[0];
if (rw) {
S.weapons = S.weapons || [];
if (S.weapons.indexOf(rw.id) < 0) { S.weapons.push(rw.id); logLine("l-crit", "[First Win] Weapon unlocked:" + rw.name); }
} else if (ri) {
gainItem(ri.id, 3);
logLine("l-crit", "[First Win] Item gained:" + ri.name + " ×3");
}
}
} else {
var hon = Math.round((bb.honor || 0) * 0.25);
S.honor = (S.honor || 0) + hon;
logLine("l-sys", "Repeat Challenge reward: Honor " + hon + "。");
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
logLine("l-dead", "Everyone has fallen...");
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
el("resTitle").textContent = win ? "Result · Win" : "Result · Loss";
if (win) {
lines.push(["l-crit", (B.boss ? "defeated on the stage " : "Defeat [") + B.enemies.map((e) => e.name).join("、") + (B.boss ? "" : "】")]);
if (st.award) applyAward(st.award, lines, true);
let bonus = Math.round(48 + (B.enemies[0] ? B.enemies[0].maxHp / 30 : 30));
if (arenaTier) {
const streakMul = 1 + (S.arena.streak - 1) * DATA.arena.streakBonus;
const aD = arenaDiff(B.arenaDiff || "normal");
bonus = Math.round((86 + (B.enemies[0] ? B.enemies[0].maxHp / 34 : 40)) *
(arenaTier.expScale || 1) * streakMul * aD.exp);
const honor = Math.round((arenaTier.honor || 50) * (1 + (S.arena.streak - 1) * 0.1) * aD.honor);
S.honor += honor;
lines.push(["l-crit", arenaTier.name + " · " + aD.name + " ｜ Streak " + S.arena.streak +
" rounds (EXP x" + streakMul.toFixed(2) + ", difficulty x" + aD.exp.toFixed(2) + "）"]);
lines.push(["l-sys", "Gained Honor " + honor + ". (Current Honor:" + S.honor + "）"]);

const drop = rollDrop(arenaTier);
if (drop) {
gainItem(drop.id, 1);
lines.push(["l-crit", "Obtained: [" + (DATA.weaponRarity[drop.rarity] || {}).name + "] " + drop.name]);
}
}
gainExp(bonus, lines);
lines.push(["l-sys", "(battle reward EXP " + bonus + " pts)"]);
} else {
lines.push(["l-dead", "Everyone was brought to the rear."]);
if (st.lose && st.lose.text) lines.push(["l-act", tr(st.lose.text)]);
const half = Math.round(((st.award && st.award.exp) || 0) * 0.4) + 20;
if (arenaTier) lines.push(["l-sys", "Arena results do not count toward the chronicle. Win streak reset to zero."]);
gainExp(half, lines);
lines.push(["l-sys", "If you cannot win, get stronger first: farm in the \"Arena\", recruit teammates in \"Roster\", swap weapons in \"Weapon\"."]);
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
if (!win) mk("Challenge Again", "btn-primary", () => startBoss(B.bossId, bd));
mk("Challenge List", "btn", () => openBosses());
mk("Back to Chronicles", "btn-ghost", () => { healSquad(0.55); renderMap(); show("map"); });
} else if (B.arena) {
mk(win ? "Fight Again" : "Try Again", "btn-primary", () => startArena(B.arenaTier, B.arenaDiff || "normal"));
mk("Return to Arena", "btn", () => openArena());
mk("Back to Chronicles", "btn-ghost", () => { healSquad(0.55); renderMap(); show("map"); });
} else {
const strict = strictNoSkip();
if (!win) mk("Try Again", "btn-primary", () => startBattle(st));
if (strict) {

mk("Retreat for Now (go level up)", win ? "btn-primary" : "btn", () => leaveToGrind());
const lock = document.createElement("button");
lock.className = "btn btn-ghost";
lock.disabled = true;
lock.textContent = "Not Victorious · Cannot Advance";
lock.style.opacity = ".45";
lock.style.cursor = "not-allowed";
btns.appendChild(lock);
} else {
mk(win ? "Continue Chronicle" : "Carry This Loss Forward", win ? "btn-primary" : "btn-ghost", () => afterBattle());
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
toast("Retreated. This stage is not cleared — go level up in the Arena, or rework your Party and Weapons and come back.");
}
function spRestoreSquad() {
if (S && S.spPrevSquad && S.spPrevSquad.length) {
S.squad = S.spPrevSquad.slice(0, squadCap());
S.spPrevSquad = null;
saveGame(true);
}
}
function afterBattle() {

if (strictBlocked(B.stage) && !B.stageWin) {
toast("【" + (DATA.difficulties[diffId()] || {}).name + "] On this difficulty you cannot advance with a loss — replay it, or retreat for now to level up.");
renderBattle();
return;
}

if (S) {
S.spActive = false;
if (S.spPrevSquad && S.spPrevSquad.length) {

const normalCap = clamp(2 + Math.floor(Object.values(S.chapters || {}).filter((c) => c.done).length / 3), 2, 4);
S.squad = S.spPrevSquad.slice(0, normalCap);
S.spPrevSquad = null;
}
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
if ((S.honor || 0) < cost) { toast("Not enough Honor."); return; }
S.honor -= cost;
const u = B.units[B.sel] && B.units[B.sel].alive ? B.units[B.sel] : livingAllies()[0];
if (!u) return;
u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.30);
u.sp = clamp(u.sp + 6, SP_MIN, SP_MAX);
floatNum(targetNodeOf(u), "+" + Math.round(u.maxHp * 0.30), "heal");
logLine("l-heal", "Medical Division Intervention:" + u.name + " restores 30% HP, Sanity +6 (costs Honor " + cost + "）。");
renderBattle();
renderHud();
}
function useItemBattle(id) {
if (!B || B.over || B.locked) return;
const it = DATA.items.find((x) => x.id === id);
if (!it || !(S.bag || {})[id]) { toast("No such Item."); return; }
const u = B.units[B.sel] && B.units[B.sel].alive ? B.units[B.sel] : livingAllies()[0];
if (!u) return;
useItemOn(it, u);
S.bag[id]--;
if (S.bag[id] <= 0) delete S.bag[id];
logLine("l-heal", "Use [" + it.name + "】。");
renderBattle();
saveGame(true);
}
function useItemOn(it, u) {
if (it.kind === "heal") { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * it.val); floatNum(targetNodeOf(u), "+" + Math.round(u.maxHp * it.val), "heal"); }
else if (it.kind === "sanity") { u.sp = clamp(u.sp + it.val, SP_MIN, SP_MAX); floatNum(targetNodeOf(u), "Sanity +" + it.val, "heal"); }
else if (it.kind === "sanall") { B.units.forEach((x) => { if (x.alive) x.sp = clamp(x.sp + it.val, SP_MIN, SP_MAX); }); }
else if (it.kind === "shield") { u.shield += u.maxHp * it.val; floatNum(targetNodeOf(u), "+" + Math.round(u.maxHp * it.val), "heal"); }
else if (it.kind === "coin") { u.buffs.push({ stat:"coin", amount: it.val, turns: it.turns || 3, label:"Seal +" + it.val }); }
else if (it.kind === "shred") {
const t = livingEnemies()[0];
if (t) t.buffs.push({ stat:"def", mult:0.75, turns:2, label:"Defense↓" });
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
if (!(S.bag || {})[id]) { toast("No such Item."); return 0; }
const list = jarTargets();
if (!list.length) { toast("没有可以使用的角色。"); return 0; }
UI.jarPick = { jar: id, ally: list[0].id };
openJarPicker();
return 0;
}
function openJarPicker() {
const P = UI.jarPick;
if (!P) return;
const it = DATA.items.find((x) => x.id === P.jar);
if (!it) return;
const list = jarTargets();
if (!list.some((a) => a.id === P.ally)) P.ally = list.length ? list[0].id : null;
const target = list.find((a) => a.id === P.ally);
let html = "<p style='color:var(--muted)'>" + tr(it.name) + "：" + tr(it.desc).replace(/\n/g, "<br>") + "</p>";
html += "<p>当前持有 <b class='k'>×" + ((S.bag || {})[P.jar] || 0) + "</b>。选择要给哪位角色使用：</p>";
html += "<div class='codex-grid'>";
const groups = groupByLevel(list);
groups.forEach((grp) => {
html += "<div style='flex:1 1 100%;margin:8px 0 2px;color:var(--muted);font-size:12px;letter-spacing:2px'>" +
grp.band.name + "（" + grp.items.length + "）</div>";
grp.items.forEach((a) => {
const st = allyStats(a);
const on = (a.id === P.ally);
const role = (ROLE_NAMES[roleOfAlly(a)] || "战斗型");
html += "<div class='codex-card" + (on ? " hot" : "") + "' data-jarpick='" + a.id + "'" +
(on ? " style='border-color:var(--gold);background:rgba(214,178,90,.12)'" : "") + ">" +
"<div class='cc-name' style='color:" + (a.color || "#ddd") + "'>" + a.name + (on ? " ◆" : "") + "</div>" +
"<div class='cc-sub'>" + role + " ｜ Lv." + a.level + " ｜ " +
(DATA.recruit.tiers[a.rarity] || DATA.recruit.tiers[a.tier] || {}).name + "</div>" +
"<div class=\'cc-sub\'>HP " + st.hp + " ｜ Attack Level " + st.atk + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>EXP " + Math.floor(a.exp || 0) + " / " +
(a.level >= MAX_LEVEL ? "满级" : expNeeded(a.level)) + "</div></div>";
});
});
html += "</div>";
if (target) {
if (it.kind === "lvup") {
const n = Math.min(it.val || 1, MAX_LEVEL - target.level);
html += "<p style='color:var(--gold2)'>给 <b>" + target.name + "</b> 使用 → 等级 " +
target.level + " → " + (target.level + Math.max(0, n)) +
(n > 0 ? "（+" + n + "）" : "（已满级）") + "</p>";
} else {
const amount = it.val || 0;
let sim = target.level, rem = (target.exp || 0) + amount, ups = 0;
while (sim < MAX_LEVEL && rem >= expNeeded(sim)) { rem -= expNeeded(sim); sim++; ups++; }
html += "<p style='color:var(--gold2)'>给 <b>" + target.name + "</b> 使用 → EXP +" + amount +
(ups > 0 ? "，等级 " + target.level + " → " + sim + "（+" + ups + "）" : "，不满一级") + "</p>";
}
}
html += "<p><button class='btn btn-primary' data-jarok='1'>确 定 使 用</button> " +
"<button class='btn btn-tiny' data-jarcancel='1'>取 消</button></p>";
openModal("使用 " + it.name, html);
$$("#modalBody [data-jarpick]").forEach((c) => {
c.onclick = () => { P.ally = c.getAttribute("data-jarpick"); openJarPicker(); };
});
$$("#modalBody [data-jarok]").forEach((c) => {
c.onclick = () => applyJar(P.jar, P.ally);
});
$$("#modalBody [data-jarcancel]").forEach((c) => {
c.onclick = () => { UI.jarPick = null; openBag(); };
});
}

function applyJar(jarId, allyId) {
const it = DATA.items.find((x) => x.id === jarId);
const a = (S.allies || []).find((x) => x.id === allyId);
if (!it || !a) { toast("选择有误。"); return 0; }
if (!(S.bag || {})[jarId]) { toast("没有这个道具了。"); return 0; }
if (a.level >= MAX_LEVEL) { toast(a.name + " 已经满级了。"); return 0; }
S.bag[jarId]--;
if (S.bag[jarId] <= 0) delete S.bag[jarId];
const before = a.level;
let amount, ups;
if (it.kind === "lvup") {

amount = 0;
ups = Math.min(it.val || 1, MAX_LEVEL - a.level);
a.level += ups;
if (a.level >= MAX_LEVEL) { a.level = MAX_LEVEL; a.exp = 0; }
ups = a.level - before;
if (a.id === HERO_ID) { S.level = a.level; S.exp = a.exp || 0; syncHero(); }
} else {

amount = it.val || 0;
ups = allyGiveExp(a, amount);
}

if (a.id === HERO_ID) {
S.level = Math.max(S.level || 1, a.level);
S.exp = a.exp || 0;
syncHero();
}
UI.jarPick = null;
saveGame(true);
toast(a.name + "：" + it.name + " → " +
(it.kind === "lvup" ? "等级 " + before + " → " + a.level + "（+" + ups + "）"
: "EXP +" + amount + (ups > 0 ? "，等级 " + before + " → " + a.level + "（+" + ups + "）" : "")));
openBag();
return amount;
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
function devVisible() { return devOn(); }
function equipAbility(id) {
if (!DATA.abilities[id]) return "No such Skill.";
if (!isUnlocked(id)) return "Not yet unlocked: requires Lv." + DATA.abilities[id].unlock + "。";
if (S.equipped.indexOf(id) >= 0) return "It is already in your Skill slots.";
if (S.equipped.length >= MAX_EQUIP) return "Skill slots full (" + MAX_EQUIP + " tiles).";
S.equipped.push(id); saveGame(true); return null;
}
function unequipAbility(id) {
if (S.equipped.length <= 1) return "Keep at least one Skill.";
S.equipped = S.equipped.filter((x) => x !== id); saveGame(true); return null;
}
function checkUnlocks(level) {
return abilityOrder().filter((id) => { const a = DATA.abilities[id]; return a && a.unlock && a.unlock === level; });
}


function normalizeSquad() {
if (!S) return { changed: false, removed: 0, trimmed: 0, cap: 2 };
const cap = squadCap();
const before = (S.squad || []).slice();
const idx = allyIndex();
let clean = before.filter((id) => idx[id]);
const removed = before.length - clean.length;
let trimmed = 0;
if (clean.length > cap) { trimmed = clean.length - cap; clean = clean.slice(0, cap); }
S.squad = clean;
return { changed: (removed + trimmed) > 0, removed: removed, trimmed: trimmed, cap: cap };
}

function squadLegality() {
if (!S) return "没有存档。";
normalizeSquad();
const cap = squadCap();
if (!(S.squad || []).length) return "编队是空的。先到「Party」安排上场的人。";
if (S.squad.length > cap) return "编队超编（" + S.squad.length + " / " + cap + "）。";
const aidx = allyIndex();
if ((S.squad || []).some((id) => !aidx[id])) return "编队里有已经不存在的成员。";
return null;
}
function squadCap() {

if (S && S.spActive) return SP_SQUAD_CAP;
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

function usableWeaponsFor(a) {
const j = jobOfAlly(a);
return DATA.weapons.filter((w) => weaponUsableBy(w.id, j));
}
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
return makeAlly(name, "eternal", { base: 88, weaponId: "relic_sheath", note: "Eternal-class" });
}
function starterAllies() {
return [
makeAlly("Luo Yan", "common", { base: 26, weaponId: "sword_std", note: "The first partner sent by the branch." }),
makeAlly("Su Weimian", "advance", { base: 34, weaponId: "bow_std", note: "From a rescue corps — faster than anyone." })
];
}
function allyPower(a) {
const w = wpOf(a.weaponId);
const lv = a.level || 1;
return Math.round(a.base + lv * 7 + (w.atkBonus || 0) * 4);
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
function _allyStatsRaw(a) {
const w = wpOf(a.weaponId);
const lv = a.level || 1;
const R = ROLE_MOD[roleOfAlly(a)] || ROLE_MOD.battle;
return {
hp: Math.round((a.base + lv * 46 + (w.atkBonus || 0) * 8 + (a.hpBonus || 0)) * BAL.playerHp * R.hp),
atk: Math.round((8 + Math.floor(lv * 1.15) + (w.atkBonus || 0) + (a.atkBonus || 0)) * BAL.playerAtk * R.atk),
def: Math.round((5 + Math.floor(lv * 0.55) + (a.defBonus || 0)) * R.def),
spd: Math.round((6 + Math.floor(lv * 0.4) + (a.speedBonus || 0)) * R.spd),
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
function renderBattleSoon() {
if (_rafPending) return;
_rafPending = true;
const run = function () { _rafPending = false; try { renderBattle(); } catch (e) {} };
try {
if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
else setTimeout(run, 0);
} catch (e) { run(); }
}

let _heroPoolCache = null, _heroPoolSig = "";
function invalidateHeroPool() { _heroPoolCache = null; _heroPoolSig = ""; }

const HERO_ID = "hero_self";
const MAX_LEVEL = 200; 

const SCHOOL_CN2ID = { "Sword":"sword", "Bow":"bow", "Blade":"blade", "Spear":"spear", "Axe":"axe",
"Fist":"fist", "Leg":"leg", "法":"arcane", "械":"tech", "医":"medic", "General":"common" };
function schoolIdOf(w) {
if (!w) return null;
const cn = String(w.school || "");
for (const k in SCHOOL_CN2ID) if (cn.indexOf(k) >= 0) return SCHOOL_CN2ID[k];
return null;
}

const TYPE_CN2ROLE = { "Fist":"battle", "Leg":"battle", "Sword":"battle", "Blade":"battle",
"Spear":"battle", "Axe":"battle", "Bow":"support", "法":"support",
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
function heroWeaponId() {
try {
const sch = (DATA.schools || {})[S && S.school];
if (sch && sch.weapons && sch.weapons.length) return sch.weapons[0];
} catch (e) {}
return "sword_std";
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
name: S.name || "the Nameless",
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
function squadAllies() {

const all = (S.squad || []).map((id) => allyById(id)).filter(Boolean);

S.squad = all.map((a) => a.id);
return all;
}
function squadUnits() {
return squadAllies().map((a) => playerUnitFor(a));
}
function effectiveCoins(a) {
return Math.min(8, (a.ally && a.ally.coins) || a.coins || 4);
}

function openSquad() {
if (!S) return;
const cap = squadCap();
let html = "<p style=\'color:var(--muted)\'>At most <b class=\'k\'>" + cap + "</b> members (increases as the Chronicle advances)." +
"In battle each member picks a Skill and a target, and Clashes with the incoming enemy.</p>";
html += "<h4>Deployed Party (" + (S.squad || []).length + " / " + cap + "）</h4><div class='codex-grid'>";
(S.squad || []).forEach((id) => {
const a = allyById(id);
if (!a) return;
const st = allyStats(a);
const w = wpOf(a.weaponId);
html += "<div class='codex-card hot' data-unfield='" + id + "'>" +
"<div class='cc-name' style='color:" + a.color + "'>" + a.name + " <span style='font-size:10px'>［" + (DATA.recruit.tiers[a.tier] || {}).name + "］</span></div>" +
"<div class='cc-sub'>[" + (ROLE_NAMES[roleOfAlly(a)] || "战斗型") + "] Lv." + a.level + " ｜ HP " + st.hp + " ｜ Attack Level " + st.atk + " ｜ Speed " + st.spd + " ｜ Coins " + st.coins + "</div>" +
"<div class=\'cc-sub\'>Weapon: " + w.name + "</div>" +
"<div class=\'cc-sub\' style=\'color:var(--gold2)\'>Tap → Withdraw</div></div>";
});
html += "</div>";
const bench = (S.allies || []).filter((a) => (S.squad || []).indexOf(a.id) < 0);
html += "<h4>Standby Members (" + bench.length + "）</h4><div class='codex-grid'>";
if (!bench.length) html += "<p class=\'muted\'>No one else. Go to \"Roster\" to recruit.</p>";
const benchGroups = groupByLevel(bench);
benchGroups.forEach((grp) => {
html += "<div style='flex:1 1 100%;margin:8px 0 2px;color:var(--muted);font-size:12px;letter-spacing:2px'>" +
grp.band.name + "（" + grp.items.length + "）</div>";
grp.items.forEach((a) => {
const st = allyStats(a);
const w = wpOf(a.weaponId);
html += "<div class='codex-card' data-field='" + a.id + "'>" +
"<div class='cc-name' style='color:" + a.color + "'>" + a.name + " <span style='font-size:10px'>［" + (DATA.recruit.tiers[a.tier] || {}).name + "］</span></div>" +
"<div class='cc-sub'>Lv." + a.level + " ｜ HP " + st.hp + " ｜ Attack Level " + st.atk + " ｜ Speed " + st.spd + "</div>" +
"<div class=\'cc-sub\'>Weapon: " + w.name + (a.note ? " ｜ " + a.note : "") + "</div>" +
"<div class=\'cc-sub\' style=\'color:var(--gold2)\'>Tap → Field</div></div>";
});
});
html += "</div>";

const bs = baseStats(S);
html += "<h4>Profile Subject</h4><p>" + S.name + " ｜ " + currentRank() + " ｜ Lv." + S.level +
" ｜ HP " + bs.hp + " ｜ Attack Level " + (12 + S.level * 2) + " ｜ Honor " + (S.honor || 0) + "</p>";
openModal("Party", html);
$$("#modalBody [data-field]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-field");
S.squad = S.squad || [];
if (S.squad.length >= squadCap()) { toast("Party is full (" + squadCap() + " members). Withdraw one first."); return; }
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
function openDissolve() {
if (!S) return;
S.allies = S.allies || [];
const list = (S.allies || []).filter((a) => a.id !== HERO_ID);
let html = "<p style='color:var(--muted)'>把不要的角色交回组织，组织按他的等级与资历折成功勋返还。" +
"溶解后<b style='color:var(--bad)'>无法恢复</b>。专属角色与全功率奖励角色不能溶解。</p>";
html += "<p>Current Honor：<b class='k'>" + (S.honor || 0) + "</b>　可溶解 " + list.length + " 名</p>";
if (!list.length) {
html += "<p class='muted'>没有可以溶解的角色。</p>";
} else {
const groups = groupByLevel(list);
html += "<div class='codex-grid'>";
groups.forEach((grp) => {
html += "<div style='flex:1 1 100%;margin:8px 0 2px;color:var(--muted);font-size:12px;letter-spacing:2px'>" +
grp.band.name + "（" + grp.items.length + "）</div>";
grp.items.forEach((a) => {
const v = dissolveValue(a);
const locked = !canDissolve(a);
html += "<div class='codex-card" + (locked ? " locked" : "") + "'>" +
"<div class='cc-name' style='color:" + (a.color || "#ddd") + "'>" + a.name + "</div>" +
"<div class='cc-sub'>" + (DATA.recruit.tiers[a.rarity] || DATA.recruit.tiers[a.tier] || {}).name +
" ｜ " + (ROLE_NAMES[roleOfAlly(a)] || "战斗型") + " ｜ Lv." + a.level + "</div>" +
(locked
? "<div class='cc-sub' style='color:var(--muted)'>不可溶解</div>"
: "<div class='cc-sub' style='color:var(--gold2)'>返还 " + v + " 功勋</div>" +
"<div class='cc-sub'><button class='btn btn-tiny btn-danger' data-dissolve='" + a.id + "'>溶 解</button></div>") +
"</div>";
});
});
html += "</div>";
}
html += "<p style='margin-top:12px'><button class='btn btn-tiny' data-disall='1'>一键溶解全部见习成员</button></p>";
openModal("溶解", html);
$$("#modalBody [data-dissolve]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-dissolve");
const a = (S.allies || []).find((x) => x.id === id);
if (!a || !canDissolve(a)) { toast("这个角色不能溶解。"); return; }
const v = dissolveValue(a);
askConfirm("确认溶解", "把 <b>" + a.name + "</b>（Lv." + a.level + "）交回组织？<br>返还 <b>" + v +
"</b> 功勋。<br><br><span style='color:var(--bad)'>此操作不可恢复。</span>", "溶 解", function () {
S.honor = (S.honor || 0) + v;
S.allies = S.allies.filter((x) => x.id !== id);
invalidateAllyIndex();
S.squad = (S.squad || []).filter((x) => x !== id);
if (!S.squad.length && (S.allies || []).length) S.squad = [S.allies[0].id];
saveGame(true);
toast("已溶解 " + a.name + "，+" + v + " 功勋");
openDissolve();
}, true);
};
});
$$("#modalBody [data-disall]").forEach((c) => {
c.onclick = () => {
const targets = (S.allies || []).filter((a) => canDissolve(a) && (a.rarity || a.tier) === "common");
if (!targets.length) { toast("没有可以溶解的见习成员。"); return; }
const total = targets.reduce((n, a) => n + dissolveValue(a), 0);
askConfirm("批量溶解", "溶解全部 <b>" + targets.length + "</b> 名见习成员？<br>共返还 <b>" + total +
"</b> 功勋。<br><br><span style='color:var(--bad)'>此操作不可恢复。</span>", "全 部 溶 解", function () {
const ids = targets.map((a) => a.id);
S.honor = (S.honor || 0) + total;
S.allies = S.allies.filter((a) => ids.indexOf(a.id) < 0);
invalidateAllyIndex();
S.squad = (S.squad || []).filter((id) => ids.indexOf(id) < 0);
if (!S.squad.length && (S.allies || []).length) S.squad = [S.allies[0].id];
saveGame(true);
toast("已溶解 " + ids.length + " 名，+" + total + " 功勋");
openDissolve();
}, true);
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
note: (DATA.recruit.tiers[rar] || {}).name + " · Branch Transfer" });
}
function doRecruit(times) {
const cost = times === 10 ? DATA.recruit.costTen : DATA.recruit.costSingle;
if ((S.honor || 0) < cost) { toast("Not enough Honor (need " + cost + "). Go farm in the Arena, or push the Chronicle."); return; }
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
html += "<p>Honor <b class=\'k\'>" + (S.honor || 0) + "</b> ｜ Recruited " + S.allies.length + " members ｜ still need " +
Math.max(0, (DATA.recruit.pityAt || 80) - S.pulls) + " times</p>";
html += "<h4>Appearance Rate</h4><div class=\'stat-grid\'>";
["eternal", "relic", "elite", "advance", "common"].forEach((k) => {
const t = DATA.recruit.tiers[k];
html += "<div class='stat-box'><div class='s-name' style='color:" + t.color + "'>" + t.name + "</div>" +
"<div class='s-val'>" + (r[k] * 100).toFixed(0) + "%</div></div>";
});
html += "</div>";
html += "<p style=\'color:var(--gold2)\'>The Eternal tier has only " + (r.eternal * 100).toFixed(0) +
"%, and each " + (DATA.recruit.pityAt || 80) + " pulls guarantee one — the list is the eleven from the Organization archive.</p>";
if (newOnes && newOnes.length) {
html += "<h4>This Roster Result</h4><div class=\'codex-grid\'>";
newOnes.forEach((a) => {
const t = DATA.recruit.tiers[a.tier] || {};
html += "<div class='codex-card' style='border-color:" + a.color + "'>" +
"<div class='cc-name' style='color:" + a.color + "'>" + a.name + "［" + t.name + "］" + (a.dupe ? "(duplicate, converts to 400 Honor)" : "") + "</div>" +
"<div class='cc-sub'>" + (a.note || "") + "</div>" +
"<div class=\'cc-sub\'>Attack Level " + allyStats(a).atk + " ｜ HP " + allyStats(a).hp + " ｜ Speed " + allyStats(a).spd + "</div></div>";
});
html += "</div>";
}
html += "<div style='display:flex;gap:10px;margin-top:18px;flex-wrap:wrap'>" +
"<button class=\'btn\' data-roll=\'1\'>Roster 1x (" + DATA.recruit.costSingle + " Honor)</button>" +
"<button class=\'btn btn-primary\' data-roll=\'10\'>Roster 10x (" + DATA.recruit.costTen + " Honor · guaranteed Elite or above)</button>" +
"<button class=\'btn btn-ghost\' data-act=\'close-modal\'>Close</button></div>";
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
let html = "<p style=\'color:var(--muted)\'>Weapon determines Attack Level and Skill coin count — more coins means a sturdier Clash." +
"Already unlocked. No need to buy again.</p>";
html += "<h4>Equip For Whom</h4><div class=\'codex-grid\'>";
(S.allies || []).forEach((a) => {
const sel = target && a.id === target.id;
html += "<div class='codex-card" + (sel ? " hot" : "") + "' data-armtarget='" + a.id + "'>" +
"<div class='cc-name' style='color:" + a.color + "'>" + a.name + (sel ? " ◆" : "") + "</div>" +
"<div class='cc-sub'>" + ((DATA.weapons.find((w) => w.id === (S.weaponOf || {})[a.id]) || {}).name || "Bare Hands (Fist · Leg)") + "</div></div>";
});
html += "</div>";
if (!target) html += "<p class=\'muted\'>Recruit someone first.</p>";
html += "<h4>Weapon Archive (Honor " + (S.honor || 0) + "）</h4><div class='codex-grid'>";
if (target) {
const ji = jobInfo(jobOfAlly(target));
html += "<p style=\'color:var(--muted)\'>Current member: <b style=\'color:" + (ji.color || "#fff") + "'>" +
target.name + "</b>　Class: <b class=\'k\'>" + ji.glyph + " " + ji.name + "</b>　·　" + (ji.desc || "") +
"<br>Weapons are not shared across classes — off-class weapons are flagged and refuse to equip.</p>";
}
DATA.weapons.forEach((w) => {
const owned = w.id === "fist_bare" || (S.weapons || []).indexOf(w.id) >= 0;
const equipped = !!target && (((S.weaponOf || {})[target.id] || target.weaponId || "fist_bare") === w.id);
const price = canBuyWeapon(w);
const rar = DATA.weaponRarity[w.rarity] || {};
const jobW = DATA.weaponJobs[w.id] || null;
const jobNames = jobW ? weaponJobsOf(w.id).map((x) => (DATA.jobs[x] || {}).name).join(" / ") : "General";
const allowed = !target || weaponUsableBy(w.id, jobOfAlly(target));
html += "<div class='codex-card" + (owned ? "" : " locked") + (equipped ? " hot" : "") +
(allowed ? "" : " job-block") + "' data-weapon='" + w.id + "'>" +
"<div class='cc-name' style='color:" + (rar.color || "#fff") + "'>" + w.name + (equipped ? " ◆ Equipped" : "") + "</div>" +
"<div class=\'cc-sub\'>Attack Level +" + (w.atkBonus || 0) + " ｜ Coins +" + (w.coinCount || 0) + " ｜ Sanity " + (w.sanity >= 0 ? "+" : "") + w.sanity + "</div>" +
"<div class=\'cc-sub\' style=\'color:var(--gold)\'>Class:" + jobNames + (allowed ? "" : " ✗ Wrong class") + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + w.desc + "</div>" +
"<div class='cc-sub' style='color:var(--gold2)'>" +
(!allowed ? "This class cannot equip it" : (owned ? "Click → Equip" : "Click → " + price + " Honor to unlock")) + "</div></div>";
});
html += "</div>";
openModal("Armory", html);
$$("#modalBody [data-armtarget]").forEach((c) => {
c.onclick = () => { S.armoryTarget = c.getAttribute("data-armtarget"); openArmory(); };
});
$$("#modalBody [data-weapon]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-weapon");
const w = DATA.weapons.find((x) => x.id === id);
if (!w) return;
if (!target) { toast("No member can equip it."); return; }

if (!weaponUsableBy(id, jobOfAlly(target))) {
const ji = jobInfo(jobOfAlly(target));
const need = weaponJobsOf(id).map((x) => (DATA.jobs[x] || {}).name).join(" / ");
toast("【" + ji.name + "] cannot equip \"" + w.name + "\" —— this Weapon belongs to:" + need);
return;
}
const owned = id === "fist_bare" || (S.weapons || []).indexOf(id) >= 0;
if (!owned) {
const price = canBuyWeapon(w);
if ((S.honor || 0) < price) { toast("Not enough Honor (need " + price + "）。"); return; }
S.honor -= price;
S.weapons.push(id);
toast("Unlocked Weapon: " + w.name);
}
S.weaponOf = S.weaponOf || {};
S.weaponOf[target.id] = id;
target.weaponId = id;
toast(target.name + " equipped " + w.name);
saveGame(true); renderHud(); openArmory();
};
});
}
function canBuyWeapon(w) {
return w.rarity === "eternal" ? 6000 : w.rarity === "relic" ? 2400 : w.rarity === "elite" ? 1100 : 500;
}

function openBag() {
if (!S) return;
S.bag = S.bag || {};
let html = "<p style='color:var(--muted)'>道具在战斗里可用（占用该成员的编成，不额外耗回合）。击败敌人与刷怪都会掉落。" +
"经验罐可以在这里直接使用。</p>";
html += "<h4>Carried Stock</h4><div class=\'codex-grid\'>";
const owned = DATA.items.filter((it) => (S.bag[it.id] || 0) > 0);
if (!owned.length) html += "<p class=\'muted\'>The bag is empty. Farm enemies in the Arena, or advance the chronicles.</p>";
owned.forEach((it) => {
const useBtn = (it.kind === "exp" || it.kind === "lvup")
? "<div class='cc-sub'><button class='btn btn-tiny btn-primary' data-usejar='" + it.id + "'>使 用</button></div>"
: "";
html += "<div class='codex-card'><div class='cc-name'>" + it.name + " ×" + S.bag[it.id] + "</div>" +
"<div class='cc-sub'>" + (DATA.weaponRarity[it.rarity] || {}).name + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + it.desc + "</div>" + useBtn + "</div>";
});
html += "</div><h4>Available Items</h4><div class=\'codex-grid\'>";
DATA.items.filter((it) => !(S.bag[it.id] > 0)).forEach((it) => {
html += "<div class='codex-card locked'><div class='cc-name'>" + it.name + "</div>" +
"<div class='cc-sub'>" + (DATA.weaponRarity[it.rarity] || {}).name + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + it.desc + "</div></div>";
});
html += "</div>";
html += "<p style=\'margin-top:14px\'><button class=\'btn btn-tiny\' data-buykit=\'1\'>Supply: Medkit +2 (200 Honor)</button> " +
"<button class=\'btn btn-tiny\' data-buykit=\'2\'>Supply: Book Copied by Si Xiaoya +2 (300 Honor)</button></p>";
html += "<p style='margin-top:6px'><b class='k'>恒组织科技部 · 经验罐</b>（随时可用，按当前等级需求结算）</p>" +
"<p><button class='btn btn-tiny' data-buyjar='jar_low'>低级经验罐 ×1（400 Honor)</button> " +
"<button class='btn btn-tiny' data-buyjar='jar_mid'>中级经验罐 ×1（1000 Honor)</button> " +
"<button class='btn btn-tiny' data-buyjar='jar_high'>高级经验罐 ×1（2200 Honor)</button></p>";
html += "<p><button class='btn btn-tiny' data-buyjar='jar_t1'>稀释后的时间经验罐 ×1（6000 Honor)</button> " +
"<span style='color:var(--muted)'>非稀释的时间经验罐只能在真实模式的第 3、4、5 关打到。</span></p>";
openModal("Item", html);
$$("#modalBody [data-buykit]").forEach((c) => {
c.onclick = () => {
const kind = c.getAttribute("data-buykit");
const cost = kind === "1" ? 200 : 300;
const ids = kind === "1" ? ["kit_std"] : ["sp_tea"];
if ((S.honor || 0) < cost) { toast("Not enough Honor."); return; }
S.honor -= cost;
ids.forEach((id) => gainItem(id, 2));
toast("Supplies stored.");
saveGame(true); renderHud(); openBag();
};
});

$$("#modalBody [data-usejar]").forEach((c) => {
c.onclick = () => giveExpJar(c.getAttribute("data-usejar"));
});

const JAR_COST = { jar_low: 400, jar_mid: 1000, jar_high: 2200, jar_t1: 6000 };
$$("#modalBody [data-buyjar]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-buyjar");
const cost = JAR_COST[id] || 400;
if ((S.honor || 0) < cost) { toast("Not enough Honor (need " + cost + "）。"); return; }
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
let html = "<h4>Profile</h4><p>" +
"<span class='k'>" + S.name + "</span> ｜ " + currentRank() +
" ｜ Lv." + S.level + " ｜ EXP " + Math.floor(S.exp) + "/" + expNeeded(S.level) + "</p>" +
"<p>" + DATA.origins[S.origin].name + " · " + DATA.schools[S.school].name + " · " + DATA.oaths[S.oath].name + "</p>" +
"<h4>Attributes</h4><div class=\'stat-grid\'>" +
box("Max HP", bs.hp) + box("Strength", bs.atk) + box("Defense", bs.def) +
box("Speed", bs.spd) + box("Will", bs.will) + box("Potential Point", S.points) + "</div>";
if (S.points > 0) {
html += "<div class=\'point-note\'>You have <b>" + S.points + "</b> Potential Points." +
(["atk","def","spd","will"].map((k) =>
'<button class="btn btn-tiny" style="margin:4px" data-spend="' + k + '">' +
({atk:"Strength",def:"Defense",spd:"Speed",will:"Will"})[k] + " +1</button>").join("")) + "</div>";
}
html += "<h4>Destined Bond (Descent)</h4>";
if (!allies.length) {
html += "<p style=\'color:var(--muted)\'>You have not yet bonded with any Eternal. Finish each chronicle and you will receive their \"Descent\" at a key point.</p>";
} else {
html += "<p style=\'color:var(--muted)\'>Choose one as your Fated Bond. In battle you may call their \"Descent\", at the cost of bearing part of the drain yourself.</p><div class=\'codex-grid\'>";
allies.forEach((id) => {
const e = DATA.ever.find((x) => x.id === id);
if (!e) return;
const sel = S.summonId === id;
html += "<div class='codex-card' data-summon=\"" + id + "\" style='" + (sel ? "border-color:var(--gold);background:rgba(214,178,90,.12)" : "") + "'>" +
"<div class='cc-name'>" + e.no + " · " + e.name + (sel ? " ◆Natal" : "") + "</div>" +
"<div class='cc-sub'>" + e.summon.name + "(Self-damage " + Math.round(e.summon.selfCost * 100) + "%）</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + e.title + "</div></div>";
});
html += "</div>";
}
openModal("Party & Bonds", html);
$$("#modalBody [data-spend]").forEach((b) => {
b.onclick = () => {
if (S.points <= 0) return;
S.points--;
S.spent[b.getAttribute("data-spend")]++;
const nb = baseStats(S); S.hp = Math.min(S.hp + 9, nb.hp);
toast("Potential Points allocated.");
renderHud(); openParty();
};
});
$$("#modalBody [data-summon]").forEach((c) => {
c.onclick = () => {
const id = c.getAttribute("data-summon");
S.summonId = (S.summonId === id) ? null : id;
const e = DATA.ever.find((x) => x.id === id);
toast(S.summonId ? ("Natal Bond: " + e.summon.name) : "Destined Bond released.");
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
const tag = "[" + (a.school || "Skill") + "]";
const meta = (a.cost ? "Will " + a.cost : "Free") + (a.cd ? " ｜ Cooldown " + a.cd : "") +
(a.unlock ? " ｜ Requires Lv." + a.unlock : "");
return "<div class='" + cls + "' data-abil=\"" + id + "\"" + (mode === "pool" && on ? " style='border-color:var(--gold);background:rgba(214,178,90,.12)'" : "") + ">" +
"<div class='cc-name'>" + tag + " " + a.name + (on ? " ◆" : "") + "</div>" +
"<div class='cc-sub'>" + meta + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + a.desc + "</div></div>";
}
function openSkills() {
if (!S) return;
equipList();
const pool = knownAbilities();
let html = "<p style=\'color:var(--muted)\'>Skill bar <b style=\'color:var(--gold2)\'>" + S.equipped.length + " / " + MAX_EQUIP +
"</b>. Tap a Skill on the left to equip it, tap an equipped Skill on the right to remove it. In battle only Skills in the bar can be used.</p>";

(function () {
const hs = heroSchools();
const pool = heroWeaponPool();
const cur = (heroAlly() || {}).weaponId;
html += "<h4>专属角色 · 体系与武器（" + (S.name || "the Nameless") + "）</h4>";
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
"<div class='cc-sub'>攻击 +" + (w.atkBonus || 0) + " ｜ Coins " + (w.coinCount || 0) + "</div>" +
(on ? "<div class='cc-sub' style='color:var(--gold2)'>当前武器</div>"
: "<div class='cc-sub'><button class='btn btn-tiny' data-heroweapon='" + w.id + "'>换 上</button></div>") +
"</div>";
});
html += "</div>";
})();
html += "<h4>Equipped · Battle Skill Bar</h4><div class=\'codex-grid\'>";
if (!S.equipped.length) html += "<p class=\'muted\'>(Empty)</p>";
S.equipped.forEach((id) => { html += abilityCard(id, "equipped"); });
html += "</div>";
html += "<h4>Warehouse · Unlocked " + pool.length + " entries</h4><div class=\'codex-grid\'>";
pool.forEach((id) => { html += abilityCard(id, "pool"); });
html += "</div>";
const locked = abilityOrder().filter((id) => !isUnlocked(id));
if (locked.length) {
html += "<h4>Not Yet Unlocked</h4><div class=\'codex-grid\'>";
locked.forEach((id) => {
const a = DATA.abilities[id];
html += "<div class='codex-card locked'><div class='cc-name'>[" + (a.school || "Skill") + "] " + a.name + "</div>" +
"<div class=\'cc-sub\'>Requires Lv." + a.unlock + "</div><div class='cc-sub' style='color:var(--muted)'>" + a.desc + "</div></div>";
});
html += "</div>";
}
openModal("Skill · Loadout", html);
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
squad: (S && S.squad ? S.squad.slice() : []),
prevSquad: (S && S.spPrevSquad ? S.spPrevSquad.slice() : null) };
},
spOpen: function () { openSpecialBosses(); return true; },
spSquad: function (id) { openSpSquad(id); return true; },
spStart: function (id) { startSpecialBoss(id); return B ? { boss: B.bossId, sp: B.spBoss } : null; },
spPick: function (id) {
S.squad = S.squad || [];
if (S.squad.indexOf(id) < 0) S.squad.push(id);
saveGame(true); return S.squad.slice();
},
spSetSquad: function (ids) { S.squad = (ids || []).slice(); S.spActive = true; saveGame(true); return S.squad.slice(); },
spGrant: function (id) { grantSpReward(id); return { has: spHasReward(DATA.specialBosses.find(function (b) { return b.id === id; })) }; },
spSquadCap: function () { return squadCap(); },
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
function diffLabel() {
const d = diffConf();
return d.short + (d.id === "normal" ? "" : " ｜ " + d.name);
}

function onGameCleared() {
const d = diffId();
S.gameCleared = true;
if (d === "normal") S.hardUnlocked = true;
if (d === "hard") { S.trueUnlocked = true; S.hardCleared = true; }
if (d === "true") S.trueCleared = true;
saveGame(true);
}
function openDifficulty() {
if (!S) { toast("Create an archive first."); return; }
const cur = diffId();
const rows = ["normal", "hard", "true"].map((id) => {
const d = DATA.difficulties[id];
let unlocked = true, why = "";
if (id === "hard") { unlocked = !!S.hardUnlocked; why = "Requires clearing the final Chronicle (Normal difficulty)"; }
if (id === "true") { unlocked = !!S.trueUnlocked; why = "Clear the final Chronicle on Hard difficulty"; }
const cur2 = id === cur;
return '<div class="qcard ' + (cur2 ? "ready" : "") + '" data-diff="' + id + '">' +
'<div class="q-top"><span class="q-name">' + d.glyph + "　" + d.name + "　<span class='muted small'>" + d.short + "</span></span>" +
'<span class="q-npc">' + (cur2 ? "Current" : (unlocked ? "Switchable" : "Locked")) + "</span></div>" +
'<div class="q-brief">' + d.desc + "</div>" +
(unlocked ? "" : '<div class=\"q-award\">Unlock condition: ' + why + "</div>") +
(unlocked && !cur2 && diffRank(id) > diffRank(cur)
? '<div class="q-act"><button class="btn btn-tiny btn-primary" data-setdiff="' + id + '">重 启 主 线 到 此 难 度</button></div>'
: (unlocked && !cur2 ? '<div class="q-award">难度不能回退 —— 已锁定在【' + DATA.difficulties[cur].name + '】</div>' : "")) +
"</div>";
}).join("");
openModal("Difficulty Mode",
"<p style='color:var(--muted)'>难度<b>只能往上升</b>，不能回退。重启主线会清空关卡进度，" +
"但保留等级、功勋、队友、兵装与招募到的角色。</p>" +
"<div class='qgrid'>" + rows + "</div>" +
"<h4>Clear Record</h4><div class=\'stat-grid\'>" +
"<div class=\'stat-box\'><div class=\'s-name\'>Normal</div><div class=\'s-val\'>" + (S.gameCleared ? "Cleared" : "—") + "</div></div>" +
"<div class=\'stat-box\'><div class=\'s-name\'>Hard</div><div class=\'s-val\'>" + (S.hardCleared ? "Cleared" : (S.hardUnlocked ? "Unlocked" : "Locked")) + "</div></div>" +
"<div class=\'stat-box\'><div class=\'s-name\'>True</div><div class=\'s-val\'>" + (S.trueCleared ? "Cleared" : (S.trueUnlocked ? "Unlocked" : "Locked")) + "</div></div>" +
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
x.name = a.name + "·Alternate Timeline Counterpart";
}
});
});
return B.assists;
}
function assistBanner(list) {
if (!list || !list.length) return;
list.forEach((u) => {
const a = (DATA.assists || []).find((x) => x.id === u.assistId) || {};
logLine("l-boss", "[Assist Enters]" + u.name + (a.title ? "（" + a.title + "）" : "") + "　" + (a.join || ""));
if (a.quote) logLine("l-act", "　" + a.quote);
});
logLine("l-sys", "Assist characters are not under your control — they act on their own.");
}
function assistLeaveLines(list) {
(list || []).forEach((u) => {
if (!u.alive) {
logLine("l-dead", "[Assist Leaves]" + u.name + " took the last blow for you and fell.");
return;
}
const a = (DATA.assists || []).find((x) => x.id === u.assistId) || {};
logLine("l-boss", "[Assist Leaves]" + (a.leave || u.name + "left the battlefield."));
});
}


function enemyTags(key) {
const e = DATA.enemies[key] || {};
const n = e.name || "";
const tags = [];
if (key.indexOf("cult_") === 0 || n.indexOf("the Cult") >= 0) tags.push("cult");
if (key.indexOf("boss_") === 0) tags.push("boss", "ever");
if (n.indexOf("Ice") >= 0 || key === "boss_liyaohui") tags.push("ice");
if (key.indexOf("abyss") >= 0 || n.indexOf("Void") >= 0) tags.push("void");
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

const jarRoll = Math.random();
if (jarRoll < 0.06) gainItem("jar_high", 1);
else if (jarRoll < 0.20) gainItem("jar_mid", 1);
else if (jarRoll < 0.45) gainItem("jar_low", 1);

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
logLine("l-sys", "Material: " + ks.map((k) => DATA.materials[k].icon + " " + DATA.materials[k].name + " ×" + got[k]).join("　"));
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
if (turned && announce !== false) toast("Has " + turned + " Side Quest(s) ready to deliver (menu → Side Quest)");
return turned;
}
function acceptQuest(id) {
const q = DATA.sideQuests.find((x) => x.id === id);
if (!q) return;
if (questState(id) !== "offer") { toast("This Side Quest is already in progress."); return; }
S.quests[id] = { state: "active" };
saveGame(true);
toast("Side Quest accepted:" + q.name);
refreshQuests(false);
renderMap();
openQuests(id);
}
function turnInQuest(id) {
const q = DATA.sideQuests.find((x) => x.id === id);
if (!q) return;
const st = S.quests[id];
if (!st || st.state !== "done") { toast("Conditions not yet met."); return; }
if (q.obj.kind === "material" && matCount(q.obj.mat) < q.obj.count) { toast("Not enough materials."); return; }

if (q.obj.kind === "material") S.mats[q.obj.mat] -= q.obj.count;
st.state = "claimed";
const lines = [];
applyAward(q.award, lines, false);
if (q.award.title) { S.title = q.award.title; lines.push(["l-crit", "Title obtained: \"" + q.award.title + "」"]); }
if (q.unlockWeapon) {
S.weapons = S.weapons || [];
if (S.weapons.indexOf(q.unlockWeapon) < 0) S.weapons.push(q.unlockWeapon);
const w = DATA.weapons.find((x) => x.id === q.unlockWeapon);
if (w) lines.push(["l-crit", "Unlocked Weapon: " + w.name]);
}
saveGame(true);
openModal("Side Quest Delivery · " + q.name,
"<p style='color:var(--muted)'>" + q.npc + "</p>" +
"<p>" + (q.award.text || "\"It is done. Take it — do not be shy, this is what the Organization owes you.\"") + "</p>" +
"<div style='margin-top:14px'>" + lines.map((l) => "<div style='color:" +
(l[0] === "l-crit" ? "var(--gold2)" : "var(--ok)") + "'>" + l[1] + "</div>").join("") + "</div>");
refreshQuests(false);
renderMap();
}

function openQuests(focusId) {
if (!S) {
toast("Create a profile first, then take Commissions.");
openModal("Side Quest · Commission Preview",
"<p>Side Quests are independent commissions outside the main story: take one, advance it under its conditions, and deliver on completion for EXP, Honor, Weapons, Items and materials.</p>" +
"<p style=\'color:var(--muted)\'>They usually come from a branch bookkeeper, an armory smith, an Arena bookkeeper, a stage recorder, and — \"Heng\" itself.</p>" +
"<p style=\'color:var(--gold2)\'>Available once the shared save is built " + DATA.sideQuests.length + " Side Quests.</p>" +
"<h4>Issues You Will Also Face</h4>" +
"<p>Battle drops 7 kinds of material (Cult Fragment, Broken Blade, Ice Crystal Shard, Memory Fragment, Stardust, Void Ember, Sealing Scrap)," +
"Items and Weapons can be exchanged at the \"Junk Shop\" at the bottom of the Side Quest panel.</p>");
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
'<div class="qsub">' + p.have + " / " + p.need + (p.have >= p.need ? " ✔ Ready to deliver" : "") + "</div>";
};
const card = (q, kind) => {
const p = questProgress(q);
const st = questState(q.id);
const reward = [];
if (q.award.exp) reward.push("EXP " + q.award.exp);
if (q.award.honor) reward.push("Honor " + q.award.honor);
if (q.award.title) reward.push("Title");
if (q.award.items) q.award.items.forEach((it) => {
const d = DATA.items.find((x) => x.id === it[0]);
reward.push((d ? d.name : it[0]) + " ×" + it[1]);
});
if (q.award.mat) Object.keys(q.award.mat).forEach((m) => reward.push(DATA.materials[m].name + " ×" + q.award.mat[m]));
if (q.award.weapons) q.award.weapons.forEach((w) => {
const d = DATA.weapons.find((x) => x.id === w); reward.push("Weapon · " + (d ? d.name : w));
});
return '<div class="qcard ' + kind + '" data-quest="' + q.id + '">' +
'<div class="q-top"><span class="q-name">' + q.name + "</span>" +
'<span class="q-npc">' + q.npc + "</span></div>" +
'<div class="q-brief">' + q.brief + "</div>" +
(st === "active" || st === "done" ? bar(q) : "") +
'<div class=\"q-award\">Reward: ' + (reward.length ? reward.join("　·　") : "—") + "</div>" +
(st === "offer" ? '<div class="q-act"><button class="btn btn-tiny btn-primary" data-take="' + q.id + '\">Accept</button></div>' : "") +
(st === "done" && p.have >= p.need ? '<div class="q-act"><button class="btn btn-tiny btn-primary" data-in="' + q.id + '\">Deliver</button></div>' : "") +
"</div>";
};
let html = '<div class="stat-grid">' +
"<div class=\'stat-box\'><div class=\'s-name\'>In Progress</div><div class=\'s-val\'>" + active.length + "</div></div>" +
"<div class=\'stat-box\'><div class=\'s-name\'>Deliverable</div><div class=\'s-val\'>" + ready.length + "</div></div>" +
"<div class=\'stat-box\'><div class=\'s-name\'>Completed</div><div class=\'s-val\'>" + done.length + " / " + DATA.sideQuests.length + "</div></div>" +
"<div class=\'stat-box\'><div class=\'s-name\'>Total Materials</div><div class=\'s-val\'>" + totalMats() + "</div></div>" +
"</div>";
if (ready.length) html += "<h4>Deliverable</h4><div class=\'qgrid\'>" + ready.map((q) => card(q, "ready")).join("") + "</div>";
if (active.length) html += "<h4>In Progress</h4><div class=\'qgrid\'>" + active.map((q) => card(q, "active")).join("") + "</div>";
if (offer.length) html += "<h4>Available (unlocked by chronicle progress)</h4><div class=\'qgrid\'>" + offer.map((q) => card(q, "offer")).join("") + "</div>";
if (done.length) html += "<h4>Completed</h4><div class=\'qgrid\'>" + done.map((q) => card(q, "claimed")).join("") + "</div>";
if (!active.length && !ready.length && !offer.length) html += "<p class=\'muted\'>No Side Quests. New Commissions appear as the Chronicle advances.</p>";
html += "<h4>Material Stock</h4><div class=\'mat-grid\'>" + Object.keys(DATA.materials).map((k) => {
const m = DATA.materials[k], c = matCount(k);
return "<div class='mat" + (c ? " has" : "") + "' title='" + m.desc + "(Source: " + m.from + "）'>" +
"<span class='mi'>" + m.icon + "</span><span class='mn'>" + m.name + "</span><span class='mc'>" + c + "</span></div>";
}).join("") + "</div>";
html += "<h4>Junk Shop · Material Exchange</h4><div class=\'qgrid\'>" + DATA.shop.map((sp) => {
const can = Object.keys(sp.cost).every((k) => matCount(k) >= sp.cost[k]);
const cost = Object.keys(sp.cost).map((k) => DATA.materials[k].icon + DATA.materials[k].name + " ×" + sp.cost[k]).join("　");
const give = [];
if (sp.give.items) sp.give.items.forEach((it) => { const d = DATA.items.find((x) => x.id === it[0]); give.push((d ? d.name : it[0]) + " ×" + it[1]); });
if (sp.give.honor) give.push("Honor " + sp.give.honor);
if (sp.give.weapons) sp.give.weapons.forEach((w) => { const d = DATA.weapons.find((x) => x.id === w); give.push("Weapon · " + (d ? d.name : w)); });
if (sp.give.healAll) give.push("Party Fully Restored");
return "<div class='qcard shop'><div class='q-top'><span class='q-name'>" + sp.name + "</span></div>" +
"<div class=\'q-brief\'>Cost: " + cost + "</div><div class=\'q-award\'>Gain: " + give.join("　·　") + "</div>" +
"<div class='q-act'><button class='btn btn-tiny' data-shop='" + sp.id + "'" + (can ? "" : " disabled") + ">Exchange</button></div></div>";
}).join("") + "</div>";
openModal("Side Quest · Commissions & Secondhand Shop", html);
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
if (lack.length) { toast("Insufficient materials:" + lack.map((k) => DATA.materials[k].name).join("、")); return; }
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
toast("Exchange complete:" + sp.name);
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
html += "<p>Biographies cleared <b class=\'k\'>" + done + "</b> / " + DATA.chapters.length +
" ｜ BOSS defeated <b class=\'k\'>" + Object.keys(S.bossWins).length + "</b> / " + DATA.bossArena.list.length + "</p>";
html += "<div class='stat-grid'>" +
"<div class=\'stat-box\'><div class=\'s-name\'>BOSS Strength</div><div class=\'s-val\'>Eternal-class</div></div>" +
"<div class=\'stat-box\'><div class=\'s-name\'>Items Allowed</div><div class=\'s-val\'>No</div></div>" +
"<div class=\'stat-box\'><div class=\'s-name\'>Medical Division</div><div class=\'s-val\'>No</div></div>" +
"<div class=\'stat-box\'><div class=\'s-name\'>Descent</div><div class=\'s-val\'>Available</div></div>" +
"</div>";
html += "<p class=\'small\' style=\'color:var(--muted)\'>The stage is a formal duel: no Items, no Medical Division. Descent and Skills work as usual. Bring a full party above Lv.20, with Weapons fitted and Sanity at maximum.</p>";
html += "<h4>Challenge List</h4><div class=\'codex-grid\'>";
DATA.bossArena.list.forEach(function (b, i) {
var e = DATA.enemies[b.id];
if (!e) return;
var ok = bossUnlocked(b);
var won = !!S.bossWins[b.id];
var best = S.bossBest[b.id];
html += "<div class='codex-card" + (ok ? "" : " locked") + "' data-boss='" + b.id + "'>" +
"<div class='cc-name'>" + (ok ? e.name : "？？？") + (won ? " ✓Won" : "") + "</div>" +
"<div class='cc-sub'>" + (ok ? ("HP " + e.hp + " ｜ Attack Level " + e.atk + " ｜ Coin Skill " + (e.skills || []).length + " types")
: ("Requires Clear " + b.req + " Chronicle (current " + done + "）")) + "</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + (ok ? e.note : "——") + "</div>" +
"<div class='cc-sub' style='color:var(--gold2)'>" +
(won ? "First Win reward claimed" : "First Win: Honor " + b.honor + (b.reward ? " + Weapon" : "")) +
(best ? " ｜ Fastest " + best + " rounds" : "") + "</div></div>";
});
html += "</div>";
openModal(DATA.bossArena.name, html);
$$("#modalBody [data-boss]").forEach(function (c) {
c.onclick = function () {
var id = c.getAttribute("data-boss");
var b = DATA.bossArena.list.filter(function (x) { return x.id === id; })[0];
if (!b) return;
if (!bossUnlocked(b)) { toast("Clear " + b.req + " Chronicle first."); return; }
closeModal();
startBoss(id, b);
};
});
}
function startBoss(id, b) {
var e = DATA.enemies[id];
if (!e) { toast("BOSS data missing."); return; }
var stage = {
type: "battle", boss: true, bossId: id, title: "the stage · " + e.name,
enemy: id, enemyKeys: [id],
enemyScale: 1,
award: { exp: Math.round(400 + e.hp / 6) },
intro: e.note,
win: "No applause on the stage. You only wrote this battle into your own profile.",
lose: { text: "You were carried off the stage. That is no shame — few have ever stood on it." }
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
if (en.bossSkillCoin) {  }


en.atkLevel = Math.max(3, Math.round(en.atkLevel * 0.58));
en.defLevel = Math.max(6, Math.round(en.defLevel * 0.92));
en.dmgMul = 0.85;
en.coinBonus = -2;
en.isBoss = true;
});
renderBattle();
logLine("l-boss", "[the stage]" + e.name + " steps onto the stage. No Items allowed in this match — but the Medical Division stands by as usual.");
}
}


const ARENA_DIFFS = [
{ id:"normal", name:"Normal", short:"Normal", hp:1.00, atk:1.00, exp:1.00, honor:1.00, cls:"d-normal" },
{ id:"hard", name:"Hard", short:"Hard", hp:1.55, atk:1.22, exp:1.45, honor:1.60, cls:"d-hard" },
{ id:"true", name:"True", short:"True", hp:2.20, atk:1.45, exp:2.10, honor:2.40, cls:"d-true" }
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
html += "<p>Win Streak <b class=\'k\'>" + (S.arena.streak || 0) + "</b> ｜ Total Wins <b class=\'k\'>" + (S.arena.wins || 0) +
"</b> ｜ Honor <b class=\'k\'>" + (S.honor || 0) + "</b> ｜ Each win streak tier, EXP +" + Math.round(a.streakBonus * 100) + "%</p>";
S.arenaDiff = S.arenaDiff || "normal";
if (preDiff) S.arenaDiff = preDiff;
const curD = arenaDiff(S.arenaDiff);
html += "<h4>Difficulty</h4><div class=\'arena-diffs\'>";
ARENA_DIFFS.forEach((d) => {
const on = d.id === S.arenaDiff;
html += "<button class='btn btn-tiny " + (on ? "btn-primary" : "") + " " + d.cls +
"' data-arenadiff='" + d.id + "'>" + d.short + "</button>";
});
html += "</div>";
html += "<p style=\'color:var(--muted)\'>Arena difficulty and main-story difficulty <b>do not affect each other</b>. Each floor requires clearing the previous tier before the next unlocks." +
"Current: <b class=\'" + curD.cls + "'>" + curD.name + "</b> (enemy HP x" + curD.hp.toFixed(2) +
", Attack x" + curD.atk.toFixed(2) + "; EXP x" + curD.exp.toFixed(2) + ", Honor x" + curD.honor.toFixed(2) + "）</p>";
html += "<h4>Layers</h4><div class=\'codex-grid\'>";
a.tiers.forEach((t, i) => {
const lvOk = S.level >= t.unlockLv;
const dOk = arenaDiffUnlocked(i, S.arenaDiff);
const ok = lvOk && dOk;
const cleared = arenaClearCount(i, S.arenaDiff);
const prevName = ARENA_DIFFS[Math.max(0, arenaDiffIndex(S.arenaDiff) - 1)].name;
const lockMsg = !lvOk ? " ｜ Requires Lv." + t.unlockLv
: (!dOk ? " ｜ Requires clearing \"" + prevName + "」" : "");
html += "<div class='codex-card" + (ok ? "" : " locked") + "' data-tier='" + i + "'>" +
"<div class='cc-name'>" + t.name + lockMsg + "</div>" +
"<div class=\'cc-sub\'>EXP ×" + (t.expScale * curD.exp).toFixed(2) + " ｜ Honor " +
Math.round(t.honor * curD.honor) + " / round</div>" +
"<div class='cc-sub' style='color:var(--muted)'>" + t.desc + "</div>" +
"<div class=\'cc-sub\' style=\'color:var(--dim)\'>Opponent:" + t.enemies.map((k) => DATA.enemies[k].name).join("、") + "</div>" +
"<div class=\'cc-sub\' style=\'color:var(--gold2)\'>This floor" + curD.name + "Clear " + cleared + " times" + "</div></div>";
});
html += "</div>";
if (S.hp < baseStats(S).hp) {
html += "<p style=\'color:var(--muted)\'>Current HP " + Math.round(S.hp) + " / " + baseStats(S).hp +
". You enter the Arena in your current state — you can also heal with the Medical Division in battle first.</p>";
}
openModal(a.name, html);
$$("#modalBody [data-arenadiff]").forEach((b) => {
b.onclick = () => { S.arenaDiff = b.getAttribute("data-arenadiff"); saveGame(true); openArena(preTier); };
});
$$("#modalBody [data-tier]").forEach((c) => {
c.onclick = () => {
const i = parseInt(c.getAttribute("data-tier"), 10);
const t = a.tiers[i];
if (S.level < t.unlockLv) { toast("Requires Lv." + t.unlockLv + " to enter this layer."); return; }
if (!arenaDiffUnlocked(i, S.arenaDiff)) {
const prev = ARENA_DIFFS[arenaDiffIndex(S.arenaDiff) - 1].name;
toast("This layer\'s \"" + arenaDiff(S.arenaDiff).name + "\" requires clearing \"" + prev + "\" first.");
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
toast("This layer\'s \"" + ad.name + "\" is not unlocked yet.");
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
win: "The opponent fell. The Arena\'s bookkeeper wrote down a line of numbers."
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
" enters. (Power x" + (tier.statScale || 1).toFixed(2) + ", difficulty x" + ad.hp.toFixed(2) + "）");
}
function openCodex() {
const seen = loadCodex();
const everDone = S ? alliedList() : [];
let html = "<h4>Eternal Chronicles · The Eleven</h4><div class=\'codex-grid\'>";
DATA.ever.forEach((e) => {
const ok = !!seen[e.id] || everDone.indexOf(e.id) >= 0;
html += "<div class='codex-card" + (ok ? "" : " locked") + "' data-ever='" + e.id + "'>" +
"<div class='cc-name'>" + (ok ? e.no + " · " + e.name : "？？？") + "</div>" +
"<div class='cc-sub'>" + (ok ? e.title : "Locked") + "</div>" +
(ok ? "<div class=\'cc-sub\' style=\'color:var(--gold2)\'>Age at investiture:" + (e.becomeAge || "—") + "</div>" : "") + "</div>";
});
html += "</div><div class=\'tl-cta\'><button class=\'btn btn-tiny btn-primary\' data-act-timeline=\'1\'>View Eternal Timeline · Age at Investiture and Generational Tiers</button></div>";
html += "<h4>Organization Archive</h4><div class=\'codex-grid\'>";
DATA.codex.forEach((c) => {
const ok = !!seen[c.id];
html += "<div class='codex-card" + (ok ? "" : " locked") + "' data-codex='" + c.id + "'>" +
"<div class='cc-name'>" + (ok ? c.title : "？？？") + "</div>" +
"<div class='cc-sub'>" + (ok ? c.sub : "Locked") + "</div></div>";
});
html += "</div>";
openModal("Archive", html);
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
"<div style=\'margin-top:16px\'><button class=\'btn btn-tiny\' data-act=\'back-codex\'>Back to Archive</button></div>");
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
"<div class='stat-grid'>" + box("Life / Status", e.life) + box("Power Scale", e.power) +
box("Age at Appointment", e.becomeAge || "—") +
box("Descent", e.summon.name) + box("Self-damage", Math.round(e.summon.selfCost * 100) + "%") + "</div>" +
(e.becomeNote ? "<p style='color:var(--gold2)'>" + e.becomeNote + "</p>" : "") +
"<h4>Appearance</h4><p>" + e.look + "</p>" +
"<h4>Relations</h4><p>" + e.bond + "</p>" +
"<h4>Legacy</h4><p>" + e.path + "</p>" +
"<h4>Quotes</h4><p class=\'k\'>" + e.quote + "</p>" +
"<h4>Bio</h4><p>" + e.codex + "</p>" +
"<h4>" + e.summon.name + "</h4><p>" + e.summon.text + "</p>" +
"<div style=\'margin-top:16px\'><button class=\'btn btn-tiny\' data-act=\'back-ever\'>Back to Archive</button></div>");
bindBack();
}

function openCredits() {
const html =
"<div style='text-align:center'>" +
"<h4 style=\'margin-top:4px\'>C R E D I T S</h4>" +
"<p style='line-height:1.9;font-size:15px'>" +
"<b class=\'k\'>Creator</b>: Jiu Miao Ci Si Yuan<br>" +
"<span style='color:var(--muted)'>(《Eternal Order: Blade Soul》整体原作者)</span><br><br>" +
"<b class=\'k\'>Assistant creator - turning ideas into reality</b>: DeepSeek-HARNESS<br><br>" +
"<b class=\'k\'>Legendary bug QA</b>: Zesk" +
"</p>" +
"<img src='credits_tokens.jpg' alt='消费金额 ¥31.36 CNY ｜ API 请求次数 2,417 ｜ Tokens 776,317,095' " +
"style='width:100%;max-width:640px;margin:14px auto 6px;display:block;border-radius:10px;" +
"border:1px solid rgba(214,178,90,.35)'>" +
"<p style='color:var(--gold2);font-size:14px;margin-top:8px'>（钱钱飞升了）</p>" +
"</div>";
openModal("Credits", html);
}
function openAbout() {
openModal("About the [Heng] Organization",
"<p>The [Heng] Organization sits at the exact center of all things. Its chief task is to seek the secret of the birth of all things, and then to grow stronger.</p>" +
"<p>Within are endless departments, each with endless tiers, and every tier staffed by specialists. Members of the Organization are absolutely equal — including AIs, robots, mutants and test subjects. There is no rank authority; only in a mission must a superior\'s orders be obeyed absolutely.</p>" +
"<p>It stands 1000 light-years from the [X] Organization, each checking the other, on excellent terms. Honor can be exchanged for anything but humanoid intelligent life — including a planet.</p>" +
"<h4>Eternal</h4><p>Both a fighting force and a lineage. From the first, \"Heng\", to the eleventh, \"Mang\", what this line left behind is not a post but a whole body of teachable things.</p>" +
"<h4>Classified · Descent / Soul Descent</h4><p>When out on training and facing a situation you cannot survive, you may call inwardly upon the name and number of a superior. Once the one called perceives it, they may lend part or all of their power to that person for a time — at the cost of a body that may not bear it.</p>" +
"<h4>About This Work</h4><p>This is a fan game drawn from the [Heng] Organization Eternal sourcebook. Stats, combat and some lines are dramatized for the game; characters\' histories, relationships and quotations follow the original text.</p>" +
"<p style=\'color:var(--dim)\'>Controls: pick a chapter from the chronicle list on the left → advance the story → choice / battle.</p>" +
"<h4>Skill · Loadout</h4><p>Your battle Skill bar has 6 slots. Every unlocked Skill sits in the store — including Leg Arts, Fist Arts and Secret Arts from outside this chronicle (Blood Bat, Bone Shield, Frenzy, Blood Surge, Mind Mirror, and more)." +
"Tap once in the \"Skill\" panel to equip or remove. Leveling unlocks new Skills by level (Fist Arts Lv.1, Shellbreak Lv.3, Blood Surge Lv.5, Overload Lv.7, Mind Mirror Lv.9, Zeroing Lv.12)." +
"Swapping is free: if the default is a kick and the warehouse has a shield or heal, equip it.</p>" +
"<h4>Arena · Farming Zone</h4><p>A training ground outside the main story, five floors in all; the higher your level, the deeper you may go. Each consecutive win grants +12% EXP." +
"Farming grants Honor, and Honor can be spent in battle on the Medical Division to heal (250 Honor for 35% HP).</p>");
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

const DEV_NAME = "Jiumiao Siyuan";
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
let html = "<p style=\'color:var(--gold2)\'>Developer Mode is on: all characters / all Skills / all Weapons / all Items / all story unlocked, Honor and Potential Points filled.</p>";
html += "<p>Level <b class=\'k\'>" + S.level + "</b> ｜ Honor <b class=\'k\'>" + S.honor + "</b> ｜ Members <b class=\'k\'>" +
(S.allies || []).length + "</b> ｜ Party <b class=\'k\'>" + (S.squad || []).length + "</b></p>";
html += "<h4>Quick Chronicle Jump</h4><div class=\'codex-grid\'>";
DATA.chapters.forEach((ch, i) => {
html += "<div class='codex-card' data-devchap='" + i + "'><div class='cc-name'>" + ch.no + " · " + ch.name + "</div>" +
"<div class=\'cc-sub\'>Jump to Act 1 of this chronicle</div></div>";
});
html += "</div><h4>Tools</h4><p>" +
"<button class=\'btn btn-tiny\' data-devact=\'level\'>Level +10</button> " +
"<button class=\'btn btn-tiny\' data-devact=\'honor\'>Honor +1,000,000</button> " +
"<button class=\'btn btn-tiny\' data-devact=\'heal\'>Heal Party to Full</button> " +
"<button class=\'btn btn-tiny\' data-devact=\'clear\'>Clear All Chronicles</button> " +
"<button class=\'btn btn-tiny btn-ghost\' data-devact=\'off\'>Disable Developer Mode</button></p>";
openModal("Developer Mode", html);
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
toast("Jumped to " + DATA.chapters[i].no);
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
S.dev = false; toast("Developer Mode disabled.");
closeModal(); saveGame(true); renderMap(); renderHud(); return;
}
saveGame(true); renderHud(); renderMap(); openDevPanel();
};
});
}
function requestNewGame() {
const nm = (el("inpName").value || "").trim();
if (nm === DEV_NAME) {
openModal("Developer detected",
"<p>The name you entered is <b class=\'k\'>" + DEV_NAME + "</b>。</p>" +
"<p>Enable <b>Developer Mode</b>? Doing so immediately unlocks: all characters, all story, all Skills, all Weapons, all Items, and fills Honor and Potential Points to maximum.</p>" +
"<div style='display:flex;gap:12px;margin-top:18px;flex-wrap:wrap'>" +
"<button class=\'btn btn-primary\' data-devc=\'1\'>Enable Developer Mode</button>" +
"<button class=\'btn\' data-devc=\'0\'>Start in Normal Mode</button></div>");
$$("#modalBody [data-devc]").forEach((b) => {
b.onclick = () => { const v = b.getAttribute("data-devc") === "1"; closeModal(); newGame(v); };
});
return;
}
newGame(false);
}
function newGame(dev) {
const nm = el("inpName").value.trim() || "the Nameless";
S = newState(nm, el("inpOrigin").value, el("inpSchool").value, el("inpOath").value);
if (dev) {
devUnlockAll();
toast("Developer mode enabled: all characters / all story / all Skills / all Weapons unlocked.");
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
openModal("Enlistment",
"<p>Profile created.<span class=\'k\'>" + S.name + "</span>, origin:" + DATA.origins[S.origin].name +
", Five Branches Initiate:" + DATA.schools[S.school].name + "。</p>" +
"<p>" + DATA.oaths[S.oath].desc + "</p>" +
"<h4>How to Proceed</h4><p>The left lists the chronicles of the eleven Eternals, plus the \"Final Chronicle\". Advance one at a time: read the story, make choices, fight battles.</p>" +
"<p>Finishing a chronicle forms a bond with that Eternal; you may then choose a <b>Fated Bond</b> in \"Party\" and call their <b>Descent</b> in battle.</p>" +
"<p>Potential Points gained from leveling are allocated in the \"Party\" panel. Losing a battle will not block the story.</p>");
}
function loadAndStart() {
const s = loadGame();
if (!s) { toast("No save found."); return; }
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
advanceHint.textContent = "Click \"Continue\" to turn the page";
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
toast("Clash animation speed:" + (S.animSpeed === "slow" ? "Slow" : S.animSpeed === "fast" ? "Fast" : "Standard"));
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
else if (act === "mymusic") openMyMusic();
else if (act === "commissions") openCommissions();
else if (act === "duel") openDuel();
else if (act === "spboss") openSpecialBosses();
else if (act === "lang-zh") {
try { localStorage.removeItem("heng_rpg_lang_v1"); } catch (e) {}
location.href = "index.html";
}
else if (act === "lang-en") {

location.href = "index.en.html";
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
if (!hasSave()) {  }
}, 100);
}
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
})();