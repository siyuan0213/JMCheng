
/* ============================================================
   恒组织 · 交互层
   —— 按键手感 / 打字机对话 / 音频控制条 / 教程系统
   ============================================================ */
(function () {
"use strict";

function $(s) { return document.querySelector(s); }
function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
function el(id) { try { return document.getElementById(id) || null; } catch (e) { return null; } }
function need(id) { var n = el(id); if (!n) throw new Error("missing:" + id); return n; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ============================================================
   一、按键手感：真实的下沉 + 回弹
   （视觉在 style.css 的 .pressing / :active 里，这里负责状态、音效与阻止重复触发）
   ============================================================ */
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
  // 点击反馈音（挂在 document 上，不覆盖各按钮自己的 onclick）
  document.addEventListener("click", function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest("[data-act], .btn, .skill, .choice-btn") : null;
    if (t && window.HengAudio) window.HengAudio.sfx("click");
  }, true);
}

/* ============================================================
   二、打字机对话（galgame 式逐字出现）
   ============================================================ */
var tw = { node: null, full: "", i: 0, timer: null, done: true, onDone: null };

function typeSpeed() {
  try { if (typeof S !== "undefined" && S && S.textSpeed) return S.textSpeed; } catch (e) {}
  return 26;                      // 毫秒/字
}
/* 用 setTimeout 递归而不是 setInterval：
   方便在受限环境里也能工作，并且可以随时中断 */
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
    // 英文/数字两个一组，读起来更顺
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

/* 供游戏调用：带打字机的文本渲染，返回"是否正在打字" */
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

/* ============================================================
   三、音频控制条
   ============================================================ */
/* 让设置浮标可以拖动，位置记在 localStorage 里 */
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
  /* 恢复上次的位置 */
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
    if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return;   /* 小于阈值算点击 */
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
      btn.__dragged = true;      /* 抑制紧随其后的 click */
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
  /* 窗口尺寸变化时把浮标拉回可视范围 */
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
    '<button class="dock-btn dock-more" id="dockMore" title="设置">⚙</button>' +
    '<div class="dock-panel" id="dockPanel">' +
      '<div class="dock-row">' +
        '<button class="btn btn-tiny btn-primary" data-act="settings">设 置</button>' +
        '<button class="btn btn-tiny" data-act="slots">存 档 位</button>' +
      '</div>' +
      '<label>音乐 <input type="range" id="volMusic" min="0" max="100" value="70"></label>' +
      '<label>音效 <input type="range" id="volSfx" min="0" max="100" value="80"></label>' +
      '<div class="dock-row">' +
        '<button class="btn btn-tiny" data-textspeed="40">文字：慢</button>' +
        '<button class="btn btn-tiny" data-textspeed="26">文字：中</button>' +
        '<button class="btn btn-tiny" data-textspeed="12">文字：快</button>' +
        '<button class="btn btn-tiny" data-textspeed="0">文字：瞬显</button>' +
      '</div>' +
      '<div class="dock-row">' +
        '<button class="btn btn-tiny btn-primary" data-act="tutorial">教 程</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(dock);

  var musicOn = true, sfxOn = true;
  var mBtn = null, sBtn = null, moreBtn, panel, vM, vS;
  try {
    moreBtn = need("dockMore"); panel = need("dockPanel");
    vM = need("volMusic"); vS = need("volSfx");
  } catch (e) {
    // DOM 未就绪（或不支持）：安静跳过音频条，不影响游戏
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
    /* 拖动之后的那一次 click 不当作点击 */
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
      try { if (typeof S !== "undefined" && S) { S.textSpeed = v; if (typeof saveGame === "function") saveGame(true); } } catch (e) {}
      $$("#dockPanel [data-textspeed]").forEach(function (x) { x.classList.remove("btn-primary"); });
      b.classList.add("btn-primary");
      if (window.HengAudio) window.HengAudio.sfx("click");
      if (typeof toast === "function") toast(v === 0 ? "文字：瞬间显示" : "文字速度已调整");
    };
  });
  // 初始音量
  if (window.HengAudio) {
    window.HengAudio.setVolume("music", vM.value / 100);
    window.HengAudio.setVolume("sfx", vS.value / 100);
    if (!musicOn) window.HengAudio.stop();
  }
  // 面板外点击收起
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

/* ============================================================
   四、教程系统
   ============================================================ */
var TUT = [
  { t: "欢迎来到 [恒]组织",
    b: "<p>你是一名新入组的成员。这个教程会用 8 页讲清所有操作，随时可以在右上角「⋯」里重新打开。</p>" +
       "<h4>你现在看到的是「列传地图」</h4>" +
       "<p>左边是十二传：从第一任 <b>恒</b> 到第十一任 <b>茫</b>，最后一传是原创的「终传」。</p>" +
       "<p>点左边任一条 → 右边出现这一传的简介与幕列表 → 点右下角按钮开始。</p>" },
  { t: "剧情与抉择",
    b: "<h4>文字是一个一个字出现的</h4>" +
       "<p>这是 galgame 式的对话演出。<b>点任意位置可以直接让整段文字瞬间显示完</b>（再点一次才翻下一句）。</p>" +
       "<p>文字速度可以在右上角 <b>⋯</b> 里调：慢 / 中 / 快 / 瞬显。</p>" +
       "<h4>抉择</h4>" +
       "<p>遇到蓝色选项时，点一个即可。不同选项给的力量/防御/速度/意志不同，也会记录剧情标记。</p>" },
  { t: "招式联合：核心规则",
    b: "<p>本作战斗是「招式联合制」——把好几个招式串成一击打出去。</p>" +
       "<h4>1. 首招必中</h4>" +
       "<p>连段的第一招成功率固定 <b>100%</b>。</p>" +
       "<h4>2. 之后每一招用「成功率」判定</h4>" +
       "<p>不比点数大小，而是直接掷百分比。掷出小于成功率就算命中，命中就继续往下接；<b>任何一招失手，连段立刻中断</b>，后面的招不再出手。</p>" +
       "<h4>3. 成功率由「适配度」决定</h4>" +
       "<p>下一招的成功率 = 与<b>上一招</b>的适配度。招式分三类：<b>近战</b>（拳/腿/剑/刃/枪/斧）、<b>远程</b>（弓/阵）、<b>守御</b>（守/闪）。</p>" +
       "<p>同类相接极顺（拳→腿 约 97%、剑→剑 最高 100%）；<b>近战接远程会大幅掉率</b>（拳→弓只剩 45%）；守御接近战也比同类低一档。</p>" +
       "<h4>4. 连段越长越强</h4>" +
       "<p>命中 2 招伤害 ×1.12，命中 3 招以上 ×1.25。</p>" },
  { t: "怎么拼一条连段",
    b: "<h4>操作</h4>" +
       "<p>点上方成员卡选中人 → 点下方<b>招式按钮</b>逐招加入 → 连段区会实时显示每一招的<b>适配度</b>与<b>命中率</b>。</p>" +
       "<p>点连段里某一招右上角的 <b>✕</b> 可以拆掉它；点<b>清空连段</b>重来。</p>" +
       "<p>点敌人 = 指定这次的攻击目标（连段照常拼）。</p>" +
       "<h4>出手</h4>" +
       "<p>点<b>确认出手</b>，所有成员的连段按速度顺序依次结算，敌方也会用自己的连段回击。</p>" +
       "<p>懒得拼就用<b>全员自动联合</b>，系统会帮你串一条高适配的连段。</p>" +
       "<h4>实用套路</h4>" +
       "<p>稳：<b>直拳 → 腿 → 剑</b>（近战三连，总成功率很高）</p>" +
       "<p>狠：<b>旋身踢 → 剑 → 斧</b>（高威力，但每一步都在赌）</p>" +
       "<p>保命：<b>滑步 → 立壁 → 直拳</b>（先躲再守，最后垫一拳）</p>" +
       "<p>别做：<b>拳 → 弓</b>（近战接远程，第二招只剩 45%）</p>" },
  { t: "编成：连段与目标",
    b: "<h4>两下点击就指定了目标</h4>" +
       "<p>先点一下下方的<b>成员卡</b>选中他，再点一下<b>敌人</b>，就指定了「这个人打谁」。</p>" +
       "<h4>连段自己做主</h4>" +
       "<p>选中成员后点招式按钮拼连段，最多 4 招。没拼的人会自动串一条。</p>" +
       "<p>点 <b>全员自动联合</b> 一键补齐；点 <b>确认出手</b> 开始结算。</p>" },
  { t: "理智（SP）与恐慌",
    b: "<h4>理智范围 -45 ~ +45</h4>" +
       "<p>理智越高，连段越稳：每命中一招，理智 <b>+2</b>。</p>" +
       "<p>理智也影响你与敌人招式的成功率浮动，越低越容易失手。</p>" +
       "<h4>恐慌</h4>" +
       "<p>理智跌到 <b>-30 或更低</b>，该成员会陷入【恐慌】，下一回合直接脱手。</p>" +
       "<p>回理智的手段：道具「思晓雅抄的书」「银绿火焰」、技能「心镜」、以及所有降神。</p>" },
  { t: "降神：呼唤恒永者",
    b: "<p>走完一传会与那位恒永者「结缘」。然后在「档案」面板里择定一位作为 <b>本命结缘者</b>。</p>" +
       "<h4>降神有两个效果</h4>" +
       "<p>① <b>全队增益</b>：力量/防御/理智/护盾，按那位恒永者的特性不同而不同。</p>" +
       "<p>② <b>降神一击</b>：无视防御、无视护盾的全场重击。</p>" +
       "<p>代价是使用者要自损一部分生命——所以别在残血时放。</p>" },
  { t: "队伍 / 征召 / 兵装 / 道具 / 职业",
    b: "<h4>编队</h4><p>上场最多 2~4 人（随列传推进增加）。</p>" +
       "<h4>征召</h4><p>用功勋抽人。出现率：见习 40%、正式 35%、精锐 19%、首镇肖 5%、<b>恒永者 1%</b>；80 次必得一位恒永者级。</p>" +
       "<h4>职业</h4><p>成员分 <b>战士 / 法师 / 医疗 / 射手 / 枪械师 / 机械师</b> 六种。" +
       "<b>不同职业的兵装不能混装</b>——兵装库里非本职业的会灰底标出并拒绝装备。</p>" +
       "<h4>兵装</h4><p>决定「攻击等级」与<b>可用招式池</b>。换兵装就等于换一整套打法。</p>" +
       "<h4>道具</h4><p>战斗里可用：回血、回理智、上盾、破甲。</p>" },
  { t: "斗蜰蜰：押注与观战",
    b: "<h4>随机对打</h4><p>每场系统随机抽两位剧情角色自动对打。</p>" +
       "<h4>下赌</h4><p>开打前先点一位作为你押的一方，再用功勋下注：" +
       "<b>10 功勋起押、10 功勋一加</b>，也可以全押。</p>" +
       "<h4>倍率（2~10 倍）</h4><p>弱的一方倍率高、强的一方低，" +
       "押中按倍率拿功勋，押错扣除押注。</p>" +
       "<h4>观战</h4><p>你只能点「下一回合」。每回合双方都会" +
       "<b>随机</b>出招，没有操作余地。</p>" },
  { t: "全力形态：只能选一个",
    b: "<h4>两位全功率形态</h4><p>HUD 的「<b>全力</b>」里有两位：" +
       "思源的<b>邪神王模式</b>与 [X] 首领的<b>创世神模式</b>。</p>" +
       "<h4>只能得到一个</h4><p>一旦开战，另一位就<b>永久关闭</b>，" +
       "无法反悔。击败谁，就得到谁。</p>" +
       "<h4>临时扩到 8 人</h4><p>进入前会打开<b>选角界面</b>，" +
       "这一战你的编队上限临时扩到 <b>8 人</b>。</p>" +
       "<h4>奖励</h4><p>击败后对应的全功率形态会<b>加入名册</b>" +
       "成为你的角色（战力 ∞），并额外给一笔功勋。</p>" },
  { t: "无垠厅 / 恒永者 BOSS",
    b: "<h4>无垠厅</h4><p>主线之外的刷怪区，五层，刷经验功勋与掉落，连胜每场经验 +12%。</p>" +
       "<p>厅内还能单独选 <b>通常 / 困难 / 真实</b> 三档难度：敌人更强，经验与功勋也更高。每层要先通上一档才能解锁下一档。</p>" +
       "<h4>恒永者 BOSS</h4><p>菜单里的「BOSS」可以直接挑战十一任恒永者与 [X]战队首领。他们比你强得多，建议全员 Lv.20 以上、带满兵装再去。</p>" }
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
      '<button class="btn btn-tiny btn-ghost" data-tut="first">跳到最后</button>' +
      '<span class="tut-count">' + (tutIdx + 1) + " / " + TUT.length + "</span>" +
      '<button class="btn btn-tiny" data-tut="prev"' + (tutIdx === 0 ? " disabled" : "") + '>上一页</button>' +
      '<button class="btn btn-tiny btn-primary" data-tut="next">' + (tutIdx === TUT.length - 1 ? "开 始 游 戏" : "下一页") + "</button>" +
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
/* 首次进游戏自动弹一次 */
function maybeFirstRun() {
  try { if (typeof S !== "undefined" && S && S.tutDone) return; } catch (e) { return; }
  setTimeout(function () { openTutorial(0); }, 700);
}

/* ============================================================
   启动
   —— 注意：不要占用全局名 boot，game.js 里也有一个 boot()，
      同名函数会互相覆盖（后者胜出），导致这里的初始化不执行。
   ============================================================ */
function bootUi() {
  try { bindPressFeedback(); } catch (e) {}
  try { buildAudioDock(); } catch (e) {}
  // 界面切换时切曲
  var lastScreen = null;
  try {
    setInterval(function () {
      var s = currentScreen();
      if (s !== lastScreen) { lastScreen = s; if (window.HengAudio) window.HengAudio.forScreen(s); }
    }, 800);
  } catch (e) {}
  // 首次点击解锁音频
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
  // 教程按钮
  document.addEventListener("click", function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest("[data-act='tutorial']")) openTutorial(0);
  }, true);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootUi);
else bootUi();

window.HengFx = {
  writeText: writeText, typing: typing, skip: skipType, finish: finishType,
  openTutorial: openTutorial, closeTutorial: closeTutorial, maybeFirstRun: maybeFirstRun,
  /* 供 game.js 的 boot() 调用（game.js 的同名 boot 会覆盖本文件的，故显式暴露） */
  buildAudioDock: buildAudioDock, bootUi: bootUi
};
})();
