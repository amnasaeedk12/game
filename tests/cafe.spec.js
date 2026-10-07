// @ts-check
const { test, expect } = require("@playwright/test");
const path = require("path");
const { pathToFileURL } = require("url");

const GAME_URL = pathToFileURL(path.join(__dirname, "..", "index.html")).href;

// Fail any test that produces a JavaScript error or console error.
let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  await page.goto(GAME_URL);
});
test.afterEach(() => {
  expect(errors, "page should have no JS errors").toEqual([]);
});

// ---------- helpers ----------
async function startGame(page) {
  await page.click("#startBtn");
  await expect(page.locator("#startScreen")).toBeHidden();
}

/** Waits for a seated customer and returns { spot, order } where order is an array of emojis. */
async function waitForCustomer(page) {
  const spot = page.locator(".table-spot", { has: page.locator(".customer:not(.leaving)") }).first();
  await expect(spot).toBeVisible({ timeout: 5000 });
  const bubble = (await spot.locator(".bubble").textContent()) || "";
  const order = bubble.trim().split(/\s+/);
  return { spot, order };
}

async function addFood(page, emoji) {
  await page.locator(".food-btn", { has: page.locator(".emoji", { hasText: emoji }) }).click();
}

async function cookAndWait(page) {
  await page.click("#cookBtn");
  await expect(page.locator("#tray")).toHaveClass(/ready/, { timeout: 5000 });
}

const num = async (page, sel) => Number(await page.locator(sel).textContent());

// ---------- tests ----------
test("page opens with the start screen and full UI", async ({ page }) => {
  await expect(page).toHaveTitle("My Little Cafe");
  await expect(page.locator("#startScreen")).toBeVisible();
  await expect(page.locator("#startBtn")).toBeVisible();
  await expect(page.locator("#gameOverScreen")).toBeHidden();
  await expect(page.locator(".food-btn")).toHaveCount(5);
  for (const name of ["Burger", "Pizza", "Fries", "Pasta", "Drink"]) {
    await expect(page.locator(".food-btn", { hasText: name })).toBeVisible();
  }
  await expect(page.locator(".table-spot")).toHaveCount(4);
  await expect(page.locator("#score")).toHaveText("0");
  await expect(page.locator("#coins")).toHaveText("0");
  await expect(page.locator("#timer")).toHaveText("120");
});

test("Start Game hides the overlay and a customer sits down", async ({ page }) => {
  await startGame(page);
  const { order } = await waitForCustomer(page);
  expect(order.length).toBeGreaterThanOrEqual(1);
  await expect(page.locator(".patience-fill").first()).toBeVisible();
});

test("selecting food adds it to the tray, and Clear empties it", async ({ page }) => {
  await startGame(page);
  await expect(page.locator("#cookBtn")).toBeDisabled();
  await addFood(page, "🍔");
  await addFood(page, "🥤");
  await expect(page.locator("#tray .item")).toHaveCount(2);
  await expect(page.locator("#tray")).toContainText("🍔");
  await expect(page.locator("#cookBtn")).toBeEnabled();

  // Tray limit is 3
  await addFood(page, "🍕");
  await addFood(page, "🍟");
  await expect(page.locator("#tray .item")).toHaveCount(3);

  await page.click("#clearBtn");
  await expect(page.locator("#tray .item")).toHaveCount(0);
});

test("cannot serve raw food", async ({ page }) => {
  await startGame(page);
  const { spot, order } = await waitForCustomer(page);
  for (const e of order) await addFood(page, e);
  await spot.click();
  await expect(page.locator("#hint")).toContainText("Cook the food first");
  await expect(page.locator("#score")).toHaveText("0");
});

test("serving the correct order updates score, coins and happiness", async ({ page }) => {
  await startGame(page);
  // Lower happiness a little so we can see it go up again
  await page.evaluate(() => { state.happiness = 80; });
  const { spot, order } = await waitForCustomer(page);
  for (const e of order) await addFood(page, e);
  await cookAndWait(page);
  await spot.click();

  await expect(page.locator("#hint")).toContainText(/Perfect|served/);
  await expect.poll(() => num(page, "#score")).toBeGreaterThan(0);
  await expect.poll(() => num(page, "#coins")).toBeGreaterThan(0);
  expect(await page.evaluate(() => state.served)).toBe(1);
  expect(await page.evaluate(() => state.happiness)).toBeGreaterThan(80);
  await expect(page.locator("#tray .item")).toHaveCount(0);
});

test("serving the wrong order lowers happiness and gives no points", async ({ page }) => {
  await startGame(page);
  const { spot, order } = await waitForCustomer(page);
  // Pick a food that is definitely not the order (order + one extra item)
  for (const e of order) await addFood(page, e);
  if (order.length < 3) await addFood(page, order[0]);
  else { await page.click("#clearBtn"); await addFood(page, "🍔"); await addFood(page, "🍔"); }
  await cookAndWait(page);
  await spot.click();

  await expect(page.locator("#hint")).toContainText("not what they ordered");
  await expect(page.locator("#score")).toHaveText("0");
  expect(await page.evaluate(() => state.happiness)).toBe(88);
});

test("a customer who waits too long leaves angry", async ({ page }) => {
  await startGame(page);
  await waitForCustomer(page);
  await page.evaluate(() => state.tables.forEach((c) => c && (c.patience = 0.05)));
  await expect(page.locator("#hint")).toContainText("left angry");
  expect(await page.evaluate(() => state.happiness)).toBeLessThan(100);
});

test("timer counts down while playing", async ({ page }) => {
  await startGame(page);
  const start = await num(page, "#timer");
  await page.waitForTimeout(2200);
  const later = await num(page, "#timer");
  expect(later).toBeLessThanOrEqual(start - 2);
  expect(later).toBeGreaterThan(110);
});

test("Game Over appears when time runs out, then Play Again resets", async ({ page }) => {
  await startGame(page);
  const { spot, order } = await waitForCustomer(page);
  for (const e of order) await addFood(page, e);
  await cookAndWait(page);
  await spot.click();
  await expect.poll(() => num(page, "#score")).toBeGreaterThan(0);
  const score = await num(page, "#score");

  // Fast-forward the clock
  await page.evaluate(() => { state.timeLeft = 0.3; });
  await expect(page.locator("#gameOverScreen")).toBeVisible({ timeout: 3000 });
  await expect(page.locator("#timer")).toHaveText("0");
  await expect(page.locator("#finalScore")).toHaveText(String(score));
  await expect(page.locator("#finalServed")).toHaveText("1");
  await expect(page.locator("#bestScore")).toHaveText(String(score));
  await expect(page.locator("#playAgainBtn")).toBeVisible();

  // Food clicks do nothing after the game is over
  // (the overlay blocks real clicks, so call the handler directly)
  expect(await page.evaluate(() => { addToTray("pizza"); return state.tray.length; })).toBe(0);
  const timerAtEnd = await num(page, "#timer");
  await page.waitForTimeout(1100);
  expect(await num(page, "#timer")).toBe(timerAtEnd); // timer stopped

  await page.click("#playAgainBtn");
  await expect(page.locator("#gameOverScreen")).toBeHidden();
  await expect(page.locator("#score")).toHaveText("0");
  await expect(page.locator("#coins")).toHaveText("0");
  expect(await num(page, "#timer")).toBeGreaterThanOrEqual(119);
  expect(await page.evaluate(() => state.running)).toBe(true);
  await waitForCustomer(page);
});

test("Game Over appears when happiness hits zero", async ({ page }) => {
  await startGame(page);
  await waitForCustomer(page);
  await page.evaluate(() => { state.happiness = 5; state.tables.forEach((c) => c && (c.patience = 0.05)); });
  await expect(page.locator("#gameOverScreen")).toBeVisible({ timeout: 3000 });
  await expect(page.locator("#overTitle")).toContainText("unhappy");
});

test("keyboard shortcuts add food, cook and clear", async ({ page }) => {
  await startGame(page);
  await page.keyboard.press("1");
  await page.keyboard.press("5");
  await expect(page.locator("#tray .item")).toHaveCount(2);
  await page.keyboard.press("Space");
  await expect(page.locator("#tray")).toHaveClass(/ready/, { timeout: 5000 });
  await page.keyboard.press("Backspace");
  await expect(page.locator("#tray .item")).toHaveCount(0);
});

test("layout is responsive (no horizontal scrolling)", async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await startGame(page);
  // Every food button and table must be fully on-screen horizontally
  const vw = page.viewportSize().width;
  for (const sel of [".food-btn", ".table-spot", "#cookBtn", "#clearBtn"]) {
    for (const box of await page.locator(sel).evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().toJSON()))) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(vw);
    }
  }
  await page.screenshot({ path: `test-results/screenshot-${test.info().project.name}.png`, fullPage: true });
});
