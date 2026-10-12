

(function () {
"use strict";
function $(s) { return document.querySelector(s); }
function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
function el(id) { try { return document.getElementById(id) || null; } catch (e) { return null; } }
function need(id) { var n = el(id); if (!n) throw new Error("missing:" + id); return n; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

var lastPress = 0;
function bindPressFeedback() {
function onDown(ev) {
var t = ev.target && ev.target.closest ? ev.target.closest("[data-act], .btn, .skill, .choice-btn, .codex-card, .ally-slot, .enemy-slot") : null;
if (!t) return;
t.classList.add("pressing");
if (window.HengAudio) {
var now = Date.now();
if (now - lastPress > 34) { lastPress = now; window.HengAudio.sfx("press"); }
}
}
function onUp(ev) {
$$(".pressing").forEach(function (n) { n.classList.remove("pressing"); });
}
document.addEventListener("pointerdown", onDown, true);
document.addEventListener("pointerup", onUp, true);
document.addEventListener("pointercancel", onUp, true);
document.addEventListener("touchstart", function () { if (window.HengAudio) window.HengAudio.unlock(); }, { once: true, passive: true });
document.addEventListener("pointerdown", function () { if (window.HengAudio) window.HengAudio.unlock(); }, { once: true });

document.addEventListener("click", function (ev) {
var t = ev.target && ev.target.closest ? ev.target.closest("[data-act], .btn, .skill, .choice-btn") : null;
if (t && window.HengAudio) window.HengAudio.sfx("click");
}, true);
}

function isEnNow() { return true; }
function TB(zh, en) { return en; }

var tw = { node: null, full: "", i: 0, timer: null, done: true, onDone: null };
function typeSpeed() {
try { if (typeof S !== "undefined" && S && S.textSpeed) return S.textSpeed; } catch (e) {}
return 26; 
}

function typeText(node, text, onDone) {
if (!node) { if (onDone) onDone(); return; }
stopType();
tw.node = node; tw.full = String(text == null ? "" : text); tw.i = 0;
tw.done = false; tw.onDone = onDone || null;
tw.step = 0;
node.textContent = "";
node.classList.add("typing");
var speed = typeSpeed();
if (speed <= 0 || tw.full.length === 0) { finishType(); return; }
var tick = function () {
tw.timer = null;
if (tw.done) return;
if (tw.i >= tw.full.length) { finishType(); return; }
tw.step++;
var ch = tw.full.charAt(tw.i);
tw.i++;

if (/[A-Za-z0-9]/.test(ch) && /[A-Za-z0-9]/.test(tw.full.charAt(tw.i)) && tw.step % 2 === 1) {
tw.i++;
}
node.textContent = tw.full.slice(0, tw.i);
if (window.HengAudio && tw.i % 2 === 0) window.HengAudio.sfx("type");
if (tw.i % 24 === 0) { try { node.parentNode.scrollTop = node.parentNode.scrollHeight; } catch (e) {} }
if (!tw.done) tw.timer = setTimeout(tick, speed);
};
tw.timer = setTimeout(tick, speed);
}
function finishType() {
if (tw.timer) { clearTimeout(tw.timer); tw.timer = null; }
tw.done = true;
if (tw.node) {
tw.node.textContent = tw.full;
tw.node.classList.remove("typing");
}
tw.i = tw.full.length;
var cb = tw.onDone; tw.onDone = null;
if (cb) cb();
}
function stopType() {
if (tw.timer) { clearTimeout(tw.timer); tw.timer = null; }
tw.done = true;
}
function skipType() {
if (!tw.done) { finishType(); return true; }
return false;
}
function typing() { return !tw.done; }

function writeText(node, text, onDone) {
if (!node) return false;
if (textSpeedOff()) { node.textContent = text; if (onDone) onDone(); return false; }
typeText(node, text, onDone);
return true;
}
function textSpeedOff() {
try { if (typeof S !== "undefined" && S && S.textSpeed === 0) return true; } catch (e) {}
return false;
}


var DOCK_POS_KEY = "heng_rpg_dock_pos_v1";
function clampDockPos(x, y, btn) {
var pad = 6;
var w = (btn && btn.offsetWidth) || 44;
var h = (btn && btn.offsetHeight) || 44;
var maxX = Math.max(pad, window.innerWidth - w - pad);
var maxY = Math.max(pad, window.innerHeight - h - pad);
return { x: Math.min(Math.max(pad, x), maxX), y: Math.min(Math.max(pad, y), maxY) };
}
function applyDockPos(btn, pos) {
if (!pos) return;
btn.style.left = pos.x + "px";
btn.style.top = pos.y + "px";
btn.style.right = "auto";
btn.style.bottom = "auto";
}
function saveDockPos(x, y) {
try { localStorage.setItem(DOCK_POS_KEY, JSON.stringify({ x: Math.round(x), y: Math.round(y) })); } catch (e) {}
}
function makeDockDraggable(dock, btn) {
if (!btn || typeof btn.addEventListener !== "function") return;
if (typeof btn.getBoundingClientRect !== "function") return;

var saved = null;
try { saved = JSON.parse(localStorage.getItem(DOCK_POS_KEY) || "null"); } catch (e) { saved = null; }
if (saved && typeof saved.x === "number") {
var p0 = clampDockPos(saved.x, saved.y, btn);
applyDockPos(btn, p0);
}
var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
function point(e) {
if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
return { x: e.clientX, y: e.clientY };
}
function down(e) {
var pt = point(e);
var r = btn.getBoundingClientRect();
dragging = true; moved = false;
sx = pt.x; sy = pt.y; ox = r.left; oy = r.top;
btn.classList.add("dragging");
}
function move(e) {
if (!dragging) return;
var pt = point(e);
var dx = pt.x - sx, dy = pt.y - sy;
if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return; 
moved = true;
var p = clampDockPos(ox + dx, oy + dy, btn);
applyDockPos(btn, p);
if (e.cancelable) e.preventDefault();
}
function up() {
if (!dragging) return;
dragging = false;
btn.classList.remove("dragging");
if (moved) {
var r = btn.getBoundingClientRect();
saveDockPos(r.left, r.top);
btn.__dragged = true; 
setTimeout(function () { btn.__dragged = false; }, 60);
}
}
if (window.PointerEvent) {
btn.addEventListener("pointerdown", function (e) {
down(e);
try { btn.setPointerCapture(e.pointerId); } catch (err) {}
});
btn.addEventListener("pointermove", move);
btn.addEventListener("pointerup", up);
btn.addEventListener("pointercancel", up);
} else {
btn.addEventListener("mousedown", down);
document.addEventListener("mousemove", move);
document.addEventListener("mouseup", up);
btn.addEventListener("touchstart", down, { passive: true });
document.addEventListener("touchmove", move, { passive: false });
document.addEventListener("touchend", up);
}

if (window && typeof window.addEventListener === "function") {
window.addEventListener("resize", function () {
var r = btn.getBoundingClientRect();
var p = clampDockPos(r.left, r.top, btn);
applyDockPos(btn, p);
saveDockPos(p.x, p.y);
});
}
}
function buildAudioDock() {
if (el("audioDock")) return;
var dock = document.createElement("div");
dock.id = "audioDock";
dock.innerHTML =
'<button class="dock-btn dock-more" id="dockMore" title="' + TB("Settings", "Settings") + '">⚙</button>' +
'<div class="dock-panel" id="dockPanel">' +
'<div class="dock-row">' +
'<button class="btn btn-tiny btn-primary" data-act="settings">' + TB("Settings", "Settings") + '</button>' +
'<button class="dock-btn" data-act="mymusic">' + TB("音 乐", "Music") + '</button>' +
'<button class="btn btn-tiny" data-act="slots">' + TB("Save Slot", "Saves") + '</button>' +
'</div>' +
'<label>' + TB("Music", "Music") + ' <input type="range" id="volMusic" min="0" max="100" value="70"></label>' +
'<label>' + TB("SFX", "SFX") + ' <input type="range" id="volSfx" min="0" max="100" value="80"></label>' +
'<div class="dock-row">' +
'<button class="btn btn-tiny" data-textspeed="40">' + TB("Text: Slow", "Slow") + '</button>' +
'<button class="btn btn-tiny" data-textspeed="26">' + TB("Text: Medium", "Medium") + '</button>' +
'<button class="btn btn-tiny" data-textspeed="12">' + TB("Text: Fast", "Fast") + '</button>' +
'<button class="btn btn-tiny" data-textspeed="0">' + TB("Text: Instant", "Instant") + '</button>' +
'</div>' +
'<div class="dock-row">' +
'<button class="btn btn-tiny btn-primary" data-act="tutorial">' + TB("Tutorial", "Tutorial") + '</button>' +
'</div>' +
'</div>';
document.body.appendChild(dock);
var musicOn = true, sfxOn = true;
var mBtn = null, sBtn = null, moreBtn, panel, vM, vS;
try {
moreBtn = need("dockMore"); panel = need("dockPanel");
vM = need("volMusic"); vS = need("volSfx");
} catch (e) {

if (dock && dock.parentNode) dock.parentNode.removeChild(dock);
return;
}
try {
if (typeof S !== "undefined" && S) {
musicOn = S.music !== false; sfxOn = S.sfx !== false;
if (S.musicVol !== undefined) vM.value = Math.round(S.musicVol * 100);
if (S.sfxVol !== undefined) vS.value = Math.round(S.sfxVol * 100);
}
} catch (e) {}
if (mBtn) mBtn.classList.toggle("off", !musicOn);
if (sBtn) sBtn.classList.toggle("off", !sfxOn);
if (mBtn) mBtn.onclick = function () {
musicOn = !musicOn;
this.classList.toggle("off", !musicOn);
try { if (typeof S !== "undefined" && S) { S.music = musicOn; if (typeof saveGame === "function") saveGame(true); } } catch (e) {}
if (window.HengAudio) {
if (musicOn) window.HengAudio.forScreen(currentScreen());
else window.HengAudio.stop();
window.HengAudio.sfx("click");
}
};
if (sBtn) sBtn.onclick = function () {
sfxOn = !sfxOn;
this.classList.toggle("off", !sfxOn);
try { if (typeof S !== "undefined" && S) { S.sfx = sfxOn; if (typeof saveGame === "function") saveGame(true); } } catch (e) {}
if (sfxOn && window.HengAudio) window.HengAudio.sfx("click");
};
moreBtn.onclick = function () {

if (moreBtn.__dragged) { moreBtn.__dragged = false; return; }
panel.classList.toggle("on");
if (window.HengAudio) window.HengAudio.sfx("click");
};
makeDockDraggable(dock, moreBtn);
vM.oninput = function () {
var v = this.value / 100;
try { if (typeof S !== "undefined" && S) S.musicVol = v; } catch (e) {}
if (window.HengAudio) window.HengAudio.setVolume("music", v);
};
vS.oninput = function () {
var v = this.value / 100;
try { if (typeof S !== "undefined" && S) S.sfxVol = v; } catch (e) {}
if (window.HengAudio) window.HengAudio.setVolume("sfx", v);
};
$$("#dockPanel [data-textspeed]").forEach(function (b) {
b.onclick = function () {
var v = parseInt(b.getAttribute("data-textspeed"), 10);

if (window.setTextSpeed) {
window.setTextSpeed(v);
} else {
try { if (typeof S !== "undefined" && S) { S.textSpeed = v; if (typeof saveGame === "function") saveGame(true); } } catch (e) {}
}
$$("#dockPanel [data-textspeed]").forEach(function (x) { x.classList.remove("btn-primary"); });
b.classList.add("btn-primary");
if (window.HengAudio) window.HengAudio.sfx("click");
if (typeof toast === "function") toast(v === 0 ? TB("\u6587\u5b57\uff1a\u77ac\u95f4\u663e\u793a", "Text: Instant") : TB("\u6587\u5b57\u901f\u5ea6\u5df2\u8c03\u6574", "Text speed updated"));
};
});

if (window.HengAudio) {
window.HengAudio.setVolume("music", vM.value / 100);
window.HengAudio.setVolume("sfx", vS.value / 100);
if (!musicOn) window.HengAudio.stop();
}

document.addEventListener("click", function (ev) {
if (!panel) return;
if (!ev.target.closest || !ev.target.closest("#audioDock")) panel.classList.remove("on");
});
}
function currentScreen() {
var ids = ["battle", "story", "map", "title", "create", "result"];
for (var i = 0; i < ids.length; i++) {
var n = el("scr-" + ids[i]);
if (n && n.classList.contains("active")) return ids[i];
}
return "map";
}

var TUT = [
{ t: "Welcome to the [Heng] Organization",
b: "<p>You are a newly inducted member. This tutorial covers every control across 8 pages, and can be reopened anytime from the top-right \"⋯\".</p>" +
"<h4>What you see now is the Chronicle Map</h4>" +
"<p>The left holds twelve chronicles: from the first, <b>Heng</b>, to the eleventh, <b>Mang</b>; the last is the original \"Final Chronicle\".</p>" +
"<p>Tap any entry on the left → its synopsis and act list appear on the right → tap the bottom-right button to begin.</p>" },
{ t: "Story & Choice",
b: "<h4>Text appears one character at a time</h4>" +
"<p>This is galgame-style dialogue presentation. <b>Tap anywhere to reveal the whole passage instantly</b> (tap again to advance to the next line).</p>" +
"<p>Text speed can be set in the top-right <b>⋯</b>: Slow / Medium / Fast / Instant.</p>" +
"<h4>Choice</h4>" +
"<p>When a blue option appears, tap one. Different options grant different Strength / Defense / Speed / Will, and record story flags.</p>" },
{ t: "Move Combination: Core Rules",
b: "<p>Combat here uses the \"Move Union System\" — several Moves are chained into a single strike.</p>" +
"<h4>1. The first Move always hits</h4>" +
"<p>The first Move of a chain has a fixed <b>100%</b> success rate.</p>" +
"<h4>2. Every Move after that is judged by \"Success Rate\"</h4>" +
"<p>Rather than comparing values, a percentage is rolled outright. Roll below the success rate and it hits, and a hit carries on to the next; <b>if any move misses, the chain breaks at once</b> and later moves are never thrown.</p>" +
"<h4>3. Success rate is decided by \"Affinity\"</h4>" +
"<p>The next move\'s success rate = its affinity with the <b>previous move</b>. Moves fall into three categories: <b>melee</b> (fist / leg / sword / blade / spear / axe), <b>ranged</b> (bow / formation), <b>guard</b> (block / dodge).</p>" +
"<p>Same-category links flow best (Fist→Leg about 97%, Sword→Sword up to 100%); <b>melee into ranged loses a great deal of rate</b> (Fist→Bow leaves only 45%); guard into melee also drops a tier below same-category.</p>" +
"<h4>4. Longer chains hit harder</h4>" +
"<p>Hitting 2 Moves deals ×1.12 damage; 3 or more ×1.25.</p>" },
{ t: "How to Build a Chain",
b: "<h4>Controls</h4>" +
"<p>Tap a member card above to select someone → tap <b>Move buttons</b> below to add moves one by one → the chain area shows each move\'s <b>affinity</b> and <b>hit rate</b> in real time.</p>" +
"<p>Tap the <b>✕</b> at a move\'s top-right to remove it; tap <b>Clear Chain</b> to start over.</p>" +
"<p>Tap an enemy = set this attack\'s target (the chain Clashes as usual).</p>" +
"<h4>Strike</h4>" +
"<p>Tap <b>Confirm Strike</b>; every member\'s chain resolves in Speed order, and the enemy strikes back with its own chain.</p>" +
"<p>If you would rather not build one, use <b>Auto-Join All</b>; the system will assemble a well-matched chain for you.</p>" +
"<h4>Practical Setups</h4>" +
"<p>Safe: <b>Straight Punch → Leg → Sword</b> (three melee moves, high overall success)</p>" +
"<p>Brutal: <b>Spinning Kick → Sword → Axe</b> (high power, but every step is a gamble)</p>" +
"<p>Survival: <b>Slide Step → Wall Stance → Straight Punch</b> (dodge, then guard, then cushion with a punch)</p>" +
"<p>Avoid: <b>Fist → Bow</b> (melee into ranged; the second move drops to 45%)</p>" },
{ t: "Setup: Chains & Targets",
b: "<h4>Two clicks set the target</h4>" +
"<p>Tap a <b>member card</b> below to select them, then tap an <b>enemy</b> to set who that member attacks.</p>" +
"<h4>Build Your Own Chains</h4>" +
"<p>Select a member, then tap Move buttons to build a chain, up to 4 moves. Members without a chain get one assembled automatically.</p>" +
"<p>Tap <b>Auto-Join All</b> to fill every gap at once; tap <b>Confirm Strike</b> to begin resolution.</p>" },
{ t: "Sanity (SP) & Panic",
b: "<h4>Sanity range -45 ~ +45</h4>" +
"<p>The higher your Sanity, the steadier your chains: each Move that hits gives Sanity <b>+2</b>.</p>" +
"<p>Sanity also shifts the success-rate variance of your Moves and the enemy\'s. The lower it is, the more likely you miss.</p>" +
"<h4>Panic</h4>" +
"<p>If Sanity falls to <b>-30 or lower</b>, that member enters [Panic] and drops out on the following turn.</p>" +
"<p>Ways to restore Sanity: the Items \"Book Copied by Si Xiaoya\" and \"Silver-Green Flame\", the Skill \"Mind Mirror\", and every Descent.</p>" },
{ t: "Descent: Call the Eternal",
b: "<p>Finishing a chronicle forms a <b>bond</b> with that Eternal. Then choose one in the \"archive\" panel as your <b>Fated Bond</b>.</p>" +
"<h4>Descent has two effects</h4>" +
"<p>① <b>Party buff</b>: Strength / Defense / Sanity / Shield, varying with that Eternal\'s traits.</p>" +
"<p>② <b>Descent Strike</b>: a field-wide heavy blow that ignores Defense and Shield.</p>" +
"<p>The cost is that the user loses some of their own HP — so do not use it at low HP.</p>" },
{ t: "Party / Roster / Weapon / Item / Class",
b: "<h4>Party</h4><p>Up to 2~4 members on the field (increases as the Chronicle advances).</p>" +
"<h4>Roster</h4><p>Spend Honor to draw members. Rates: Trainee 40%, Regular 35%, Elite 19%, Shouzhen Xiao 5%, <b>Eternal 1%</b>; 80 draws guarantee one Eternal-class.</p>" +
"<h4>Class</h4><p>Members fall into six classes: <b>Warrior / Mage / Medic / Archer / Gunner / Machinist</b>." +
"<b>Weapons cannot be mixed across classes</b> — off-class entries in the armory are shaded grey and refuse to equip.</p>" +
"<h4>Weapon</h4><p>Determines Attack Level and the <b>available Move pool</b>. Changing Weapon means changing an entire playstyle.</p>" +
"<h4>Item</h4><p>Usable in battle: heal, restore Sanity, apply Shield, break armor.</p>" },
{ t: "Cricket Fight: Stakes & Spectating",
b: "<h4>Random Match</h4><p>Each match, the system draws two story characters at random to fight automatically.</p>" +
"<h4>Bet</h4><p>Before the match, tap one side to back, then bet Honor: " +
"<b>minimum 10 Honor, 10 Honor per raise</b>; you can also go all in.</p>" +
"<h4>Odds (2~10x)</h4><p>The weaker side has higher odds, the stronger lower, " +
"A correct bet pays Honor by the odds; a wrong bet loses the stake.</p>" +
"<h4>Spectate</h4><p>You can only click \"Next Turn\". Each turn both sides will " +
"<b>Random</b> Moves, no room for input.</p>" },
{ t: "Full-Power Form: choose only one",
b: "<h4>Two Full-Power Forms</h4><p>The HUD\'s <b>Full Power</b> holds two:" +
"Siyuan\'s <b>Cult God-King Mode</b> and the [X] Leader\'s <b>Creator God Mode</b>.</p>" +
"<h4>Only One</h4><p>Once battle begins, the other is <b>permanently shut down</b>," +
"No taking it back. Defeat someone, and you get them.</p>" +
"<h4>Temporarily Expanded to 8</h4><p>A <b>character select screen</b> opens before entering, " +
"For this battle your Party limit is temporarily expanded to <b>8 members</b>.</p>" +
"<h4>Reward</h4><p>After defeat, the matching Full-Power Form will <b>join the roster</b>" +
"Becomes your character (Power ∞), plus a bonus of Honor.</p>" },
{ t: "Arena / Eternal BOSS",
b: "<h4>Arena</h4><p>A farming zone outside the main story, five floors, yielding EXP, Honor and drops; each consecutive win grants +12% EXP.</p>" +
"<p>The Arena also has its own three-tier difficulty, <b>Normal / Hard / True</b>: stronger enemies, but higher EXP and Honor. Each floor requires clearing the previous tier to unlock the next.</p>" +
"<h4>Eternal BOSS</h4><p>\"BOSS\" in the menu lets you challenge the eleven Eternals and the [X] squad Leader directly. They are far stronger than you; bring a full party above Lv.20 with full Weapons.</p>" }
];
var tutIdx = 0;
function openTutorial(i) {
if (document.body) { try { } catch (e) {} }
tutIdx = clamp(i === undefined ? 0 : i, 0, TUT.length - 1);
var page = TUT[tutIdx];
var host = el("tutBox");
if (!host) {
host = document.createElement("div");
host.id = "tutBox";
host.className = "tut-box";
document.body.appendChild(host);
}
host.innerHTML =
'<div class="tut-progress">' + TUT.map(function (_, k) {
return '<span class="' + (k === tutIdx ? "on" : "") + '"></span>';
}).join("") + "</div>" +
'<h3>' + page.t + "</h3>" +
'<div class="tut-body">' + page.b + "</div>" +
'<div class="tut-foot">' +
'<button class=\"btn btn-tiny btn-ghost\" data-tut=\"first\">Skip to End</button>' +
'<span class="tut-count">' + (tutIdx + 1) + " / " + TUT.length + "</span>" +
'<button class="btn btn-tiny" data-tut="prev"' + (tutIdx === 0 ? " disabled" : "") + '>Previous</button>' +
'<button class="btn btn-tiny btn-primary" data-tut="next">' + (tutIdx === TUT.length - 1 ? "Start Game" : "Next Page") + "</button>" +
"</div>";
host.classList.add("on");
bindTutorial();
if (window.HengAudio) window.HengAudio.sfx("page");
}
function bindTutorial() {
$$("#tutBox [data-tut]").forEach(function (b) {
b.onclick = function () {
var a = b.getAttribute("data-tut");
if (a === "next") { if (tutIdx >= TUT.length - 1) closeTutorial(); else openTutorial(tutIdx + 1); }
else if (a === "prev") openTutorial(tutIdx - 1);
else if (a === "first") openTutorial(TUT.length - 1);
};
});
}
function closeTutorial() {
var host = el("tutBox");
if (host) host.classList.remove("on");
try { if (typeof S !== "undefined" && S) { S.tutDone = true; if (typeof saveGame === "function") saveGame(true); } } catch (e) {}
if (window.HengAudio) window.HengAudio.sfx("page");
}

function maybeFirstRun() {
try { if (typeof S !== "undefined" && S && S.tutDone) return; } catch (e) { return; }
setTimeout(function () { openTutorial(0); }, 700);
}

function bootUi() {
try { bindPressFeedback(); } catch (e) {}
try { buildAudioDock(); } catch (e) {}


try {
if (window.__hengScreenWatcher) { clearInterval(window.__hengScreenWatcher); window.__hengScreenWatcher = null; }
var lastScreen = null;
window.__hengScreenWatcher = setInterval(function () {
try {
var s = (typeof UI !== "undefined" && UI && UI.screen) ? UI.screen : "title";
if (s !== lastScreen) {
lastScreen = s;
if (window.HengAudio && window.HengAudio.forScreen) window.HengAudio.forScreen(s);
}
} catch (e) {}
}, 800);
} catch (e) {}

try {
var kick = function () {
if (window.HengAudio) { window.HengAudio.unlock(); window.HengAudio.forScreen(currentScreen()); }
if (document.removeEventListener) {
document.removeEventListener("pointerdown", kick);
document.removeEventListener("keydown", kick);
}
};
document.addEventListener("pointerdown", kick);
document.addEventListener("keydown", kick);
} catch (e) {}

document.addEventListener("click", function (ev) {
if (ev.target && ev.target.closest && ev.target.closest("[data-act='tutorial']")) openTutorial(0);
}, true);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootUi);
else bootUi();
window.HengFx = {
writeText: writeText, typing: typing, skip: skipType, finish: finishType,
openTutorial: openTutorial, closeTutorial: closeTutorial, maybeFirstRun: maybeFirstRun,

buildAudioDock: buildAudioDock, bootUi: bootUi,

typeSpeed: typeSpeed, isOff: textSpeedOff
};
})();
