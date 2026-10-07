// ===== My Little Cafe =====

// ---------- Config ----------
const MENU = [
  { id: "burger", emoji: "🍔", name: "Burger", price: 8 },
  { id: "pizza",  emoji: "🍕", name: "Pizza",  price: 10 },
  { id: "fries",  emoji: "🍟", name: "Fries",  price: 5 },
  { id: "pasta",  emoji: "🍝", name: "Pasta",  price: 9 },
  { id: "drink",  emoji: "🥤", name: "Drink",  price: 3 },
];
const FACES = ["🧑", "👩", "👨", "👧", "👦", "👵", "👴", "🧔", "👱‍♀️", "🧑‍🦰", "👩‍🦱", "🧒"];
const GAME_TIME = 120;    // seconds
const TABLE_COUNT = 4;
const MAX_TRAY = 3;

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const el = {
  score: $("score"), coins: $("coins"), timer: $("timer"),
  happinessBar: $("happinessBar"), muteBtn: $("muteBtn"),
  tables: $("tables"), menu: $("menu"), tray: $("tray"),
  cookProgress: $("cookProgress"), cookBtn: $("cookBtn"), clearBtn: $("clearBtn"),
  hint: $("hint"), floaters: $("floaters"), game: $("game"),
  startScreen: $("startScreen"), startBtn: $("startBtn"),
  gameOverScreen: $("gameOverScreen"), playAgainBtn: $("playAgainBtn"),
  finalScore: $("finalScore"), finalCoins: $("finalCoins"),
  finalServed: $("finalServed"), bestScore: $("bestScore"),
  overTitle: $("overTitle"), overEmoji: $("overEmoji"),
};

// ---------- State ----------
let state = {};
let lastFrame = 0;
let tableEls = [];

function resetState() {
  state = {
    running: false,
    score: 0,
    coins: 0,
    timeLeft: GAME_TIME,
    happiness: 100,
    served: 0,
    elapsed: 0,
    spawnTimer: 1,
    tables: new Array(TABLE_COUNT).fill(null),
    tray: [],
    trayState: "empty", // empty | raw | cooking | ready
    cookTime: 0,
    cookTotal: 0,
  };
}

// ---------- Sound (Web Audio, no files needed) ----------
const Sound = {
  ctx: null,
  muted: false,
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  tone(freq, dur = 0.12, type = "sine", delay = 0, vol = 0.15) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
  click()   { this.tone(660, 0.06, "square", 0, 0.08); },
  arrive()  { this.tone(880, 0.15, "triangle"); this.tone(1175, 0.2, "triangle", 0.12); },
  ready()   { this.tone(1320, 0.15, "sine"); this.tone(1760, 0.25, "sine", 0.1); },
  success() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.15, "triangle", i * 0.08)); },
  fail()    { this.tone(220, 0.25, "sawtooth", 0, 0.1); this.tone(160, 0.3, "sawtooth", 0.15, 0.1); },
  leave()   { this.tone(400, 0.2, "square", 0, 0.08); this.tone(300, 0.3, "square", 0.15, 0.08); },
  over()    { [784, 659, 523, 392].forEach((f, i) => this.tone(f, 0.25, "triangle", i * 0.18)); },
};

// ---------- Build UI ----------
function buildMenu() {
  el.menu.innerHTML = "";
  MENU.forEach((food, i) => {
    const btn = document.createElement("button");
    btn.className = "food-btn";
    btn.innerHTML = `
      <span class="key">${i + 1}</span>
      <span class="emoji">${food.emoji}</span>
      <span class="name">${food.name}</span>
      <span class="price">🪙 ${food.price}</span>`;
    btn.addEventListener("click", () => addToTray(food.id));
    el.menu.appendChild(btn);
  });
}

function buildTables() {
  el.tables.innerHTML = "";
  tableEls = [];
  for (let i = 0; i < TABLE_COUNT; i++) {
    const spot = document.createElement("div");
    spot.className = "table-spot";
    spot.innerHTML = `
      <div class="seat"></div>
      <div class="table"><span class="table-number">${i + 1}</span></div>`;
    spot.addEventListener("click", () => serveTable(i));
    el.tables.appendChild(spot);
    tableEls.push(spot);
    renderTable(i);
  }
}

// ---------- Helpers ----------
const foodById = (id) => MENU.find((f) => f.id === id);
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

function setHint(text, type = "") {
  el.hint.textContent = text;
  el.hint.className = "hint " + type;
}

function floatText(text, target, type = "good", offsetY = 0) {
  const gameRect = el.game.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "floater " + type;
  f.textContent = text;
  f.style.left = r.left - gameRect.left + r.width / 2 + "px";
  f.style.top = r.top - gameRect.top + r.height / 3 + offsetY + "px";
  el.floaters.appendChild(f);
  setTimeout(() => f.remove(), 1100);
}

function bump(node) {
  node.classList.remove("bump");
  void node.offsetWidth; // restart animation
  node.classList.add("bump");
}

function sameOrder(a, b) {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

// ---------- HUD ----------
function updateHUD() {
  el.score.textContent = state.score;
  el.coins.textContent = state.coins;
  el.timer.textContent = Math.ceil(state.timeLeft);
  el.timer.classList.toggle("low", state.timeLeft <= 15);
  const h = Math.max(0, state.happiness);
  el.happinessBar.style.width = h + "%";
  el.happinessBar.className = "meter-fill" + (h < 30 ? " bad" : h < 60 ? " mid" : "");
}

function changeHappiness(amount) {
  state.happiness = Math.max(0, Math.min(100, state.happiness + amount));
  updateHUD();
  if (state.happiness <= 0) endGame("happiness");
}

// ---------- Tray / Kitchen ----------
function addToTray(id) {
  if (!state.running) return;
  Sound.click();
  if (state.trayState === "cooking") return setHint("Wait, it's still cooking! 🔥", "bad");
  if (state.trayState === "ready") return setHint("Food is ready — serve a customer first, or Clear.", "bad");
  if (state.tray.length >= MAX_TRAY) return setHint(`The tray holds only ${MAX_TRAY} items.`, "bad");
  state.tray.push(id);
  state.trayState = "raw";
  setHint("Press 🔥 Cook when the tray matches an order.");
  renderTray();
}

function clearTray() {
  if (!state.running) return;
  Sound.click();
  state.tray = [];
  state.trayState = "empty";
  state.cookTime = 0;
  el.cookProgress.style.width = "0%";
  setHint("Tray cleared. Click food to add it.");
  renderTray();
}

function startCooking() {
  if (!state.running) return;
  if (state.trayState === "empty") return setHint("Add some food to the tray first!", "bad");
  if (state.trayState !== "raw") return;
  Sound.click();
  state.trayState = "cooking";
  state.cookTotal = 0.6 + state.tray.length * 0.4;
  state.cookTime = 0;
  setHint("Cooking... 🍳");
  renderTray();
}

function renderTray() {
  el.tray.className = "tray " + state.trayState;
  if (state.tray.length === 0) {
    el.tray.innerHTML = `<span class="tray-empty">empty</span>`;
  } else {
    el.tray.innerHTML = state.tray
      .map((id) => `<span class="item">${foodById(id).emoji}</span>`)
      .join("");
  }
  el.cookBtn.disabled = state.trayState !== "raw";
  if (state.trayState !== "cooking") {
    el.cookProgress.style.width = state.trayState === "ready" ? "100%" : "0%";
  }
  tableEls.forEach((t, i) =>
    t.classList.toggle("ready-target", state.trayState === "ready" && !!state.tables[i] && !state.tables[i].leaving)
  );
}

// ---------- Customers ----------
function spawnCustomer() {
  const free = state.tables.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
  if (free.length === 0) return;
  const idx = rand(free);

  // Orders grow bigger as the game goes on
  const maxItems = state.elapsed < 30 ? 1 : state.elapsed < 70 ? 2 : 3;
  const count = 1 + Math.floor(Math.random() * maxItems);
  const order = Array.from({ length: count }, () => rand(MENU).id);
  const patience = Math.max(14, 30 - state.elapsed * 0.12) + count * 4;

  state.tables[idx] = { face: rand(FACES), order, patience, maxPatience: patience, leaving: false };
  Sound.arrive();
  renderTable(idx);
  renderTray();
}

function renderTable(i) {
  const seat = tableEls[i].querySelector(".seat");
  const c = state.tables[i];
  if (!c) {
    seat.innerHTML = `<div class="empty-label">Free table</div>`;
    return;
  }
  seat.innerHTML = `
    <div class="customer">
      <div class="bubble">${c.order.map((id) => foodById(id).emoji).join(" ")}</div>
      <div class="patience"><div class="patience-fill"></div></div>
      <div class="face">${c.face}</div>
    </div>`;
  updatePatienceBar(i);
}

function updatePatienceBar(i) {
  const c = state.tables[i];
  if (!c || c.leaving) return;
  const fill = tableEls[i].querySelector(".patience-fill");
  if (!fill) return;
  const ratio = Math.max(0, c.patience / c.maxPatience);
  fill.style.width = ratio * 100 + "%";
  fill.className = "patience-fill" + (ratio < 0.3 ? " bad" : ratio < 0.6 ? " mid" : "");
  // Customer's face gets grumpier as patience runs low
  const face = tableEls[i].querySelector(".face");
  if (ratio < 0.3 && !c.grumpy) { c.grumpy = true; face.textContent = "😤"; }
}

function customerLeaves(i, face) {
  const c = state.tables[i];
  if (!c) return;
  c.leaving = true;
  const cust = tableEls[i].querySelector(".customer");
  if (cust) {
    cust.querySelector(".face").textContent = face;
    cust.querySelector(".bubble").style.visibility = "hidden";
    cust.querySelector(".patience").style.visibility = "hidden";
    cust.classList.add("leaving");
  }
  renderTray();
  setTimeout(() => {
    if (state.tables[i] === c) {
      state.tables[i] = null;
      renderTable(i);
      renderTray();
    }
  }, 700);
}

function serveTable(i) {
  if (!state.running) return;
  const c = state.tables[i];
  const spot = tableEls[i];
  if (!c || c.leaving) return setHint("No one is sitting there.", "bad");
  if (state.trayState === "empty" || state.trayState === "raw") {
    return setHint("Cook the food first! 🔥", "bad");
  }
  if (state.trayState === "cooking") return setHint("Still cooking... hold on!", "bad");

  if (sameOrder(state.tray, c.order)) {
    // Correct order!
    const ratio = c.patience / c.maxPatience;
    const price = c.order.reduce((sum, id) => sum + foodById(id).price, 0);
    const tip = Math.ceil(ratio * 5);
    const points = c.order.length * 10 + Math.round(ratio * 20);
    state.coins += price + tip;
    state.score += points;
    state.served++;
    bump(el.coins); bump(el.score);
    floatText(`+${points} ⭐`, spot, "good");
    floatText(`+${price + tip} 🪙`, spot, "coin", 28);
    Sound.success();
    setHint(ratio > 0.6 ? "Perfect! Super fast service! 😍" : "Order served! 😋", "good");
    state.tray = [];
    state.trayState = "empty";
    changeHappiness(ratio > 0.6 ? 6 : 3);
    customerLeaves(i, "😍");
  } else {
    // Wrong order
    Sound.fail();
    floatText("Wrong order! 😠", spot, "bad");
    setHint("Oops, that's not what they ordered!", "bad");
    c.patience = Math.max(0.5, c.patience - c.maxPatience * 0.25);
    state.tray = [];
    state.trayState = "empty";
    const cust = spot.querySelector(".customer");
    if (cust) {
      cust.classList.remove("shake");
      void cust.offsetWidth;
      cust.classList.add("shake");
    }
    changeHappiness(-12);
  }
  updateHUD();
  renderTray();
}

// ---------- Game loop ----------
function loop(now) {
  if (!state.running) return;
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  state.elapsed += dt;
  state.timeLeft -= dt;

  // Cooking progress
  if (state.trayState === "cooking") {
    state.cookTime += dt;
    el.cookProgress.style.width = Math.min(100, (state.cookTime / state.cookTotal) * 100) + "%";
    if (state.cookTime >= state.cookTotal) {
      state.trayState = "ready";
      Sound.ready();
      setHint("Food is ready! Click the right customer to serve. 🛎️", "good");
      renderTray();
    }
  }

  // Customer patience
  state.tables.forEach((c, i) => {
    if (!c || c.leaving) return;
    c.patience -= dt;
    updatePatienceBar(i);
    if (c.patience <= 0) {
      Sound.leave();
      floatText("Too slow! 😡", tableEls[i], "bad");
      setHint("A customer left angry! Be quicker!", "bad");
      customerLeaves(i, "😡");
      changeHappiness(-15);
    }
  });
  if (!state.running) return; // happiness may have ended the game

  // Spawn new customers (faster over time)
  const seated = state.tables.filter(Boolean).length;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 || seated === 0) {
    if (seated < TABLE_COUNT) spawnCustomer();
    state.spawnTimer = Math.max(3, 7 - state.elapsed * 0.03) + Math.random() * 2;
  }

  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    updateHUD();
    return endGame("time");
  }

  updateHUD();
  requestAnimationFrame(loop);
}

// ---------- Start / End ----------
function startGame() {
  Sound.init();
  Sound.click();
  resetState();
  buildTables();
  renderTray();
  updateHUD();
  setHint("Customers are coming! Click food to add it to the tray.");
  el.startScreen.classList.remove("show");
  el.gameOverScreen.classList.remove("show");
  state.running = true;
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

function endGame(reason) {
  if (!state.running) return;
  state.running = false;
  Sound.over();

  const best = Math.max(state.score, Number(localStorage.getItem("cafeBest") || 0));
  localStorage.setItem("cafeBest", best);

  if (reason === "happiness") {
    el.overEmoji.textContent = "😢";
    el.overTitle.textContent = "The customers are unhappy...";
  } else {
    el.overEmoji.textContent = state.score >= best && state.score > 0 ? "🏆" : "🏁";
    el.overTitle.textContent = state.score >= best && state.score > 0 ? "New High Score!" : "Closing Time!";
  }
  el.finalScore.textContent = state.score;
  el.finalCoins.textContent = state.coins;
  el.finalServed.textContent = state.served;
  el.bestScore.textContent = best;

  setTimeout(() => el.gameOverScreen.classList.add("show"), 600);
}

// ---------- Events ----------
el.startBtn.addEventListener("click", startGame);
el.playAgainBtn.addEventListener("click", startGame);
el.cookBtn.addEventListener("click", startCooking);
el.clearBtn.addEventListener("click", clearTray);
el.muteBtn.addEventListener("click", () => {
  Sound.muted = !Sound.muted;
  el.muteBtn.textContent = Sound.muted ? "🔇" : "🔊";
});

document.addEventListener("keydown", (e) => {
  if (!state.running) {
    if (e.key === "Enter") startGame();
    return;
  }
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= MENU.length) addToTray(MENU[n - 1].id);
  else if (e.code === "Space") { e.preventDefault(); startCooking(); }
  else if (e.key === "Backspace") { e.preventDefault(); clearTray(); }
});

// ---------- Init ----------
resetState();
buildMenu();
buildTables();
renderTray();
updateHUD();
