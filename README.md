# game — ☕ My Little Cafe

A simple, colorful restaurant game made with **HTML, CSS and vanilla JavaScript**.
Customers come in, sit at tables and order food. Cook the right meal and serve it before they lose patience!

## ▶ How to play

1. Open `index.html` in any web browser (no install needed).
2. Click **Start Game**.
3. A customer sits down and shows their order in a speech bubble 💭.
4. Click the matching food (🍔 Burger, 🍕 Pizza, 🍟 Fries, 🍝 Pasta, 🥤 Drink) to put it on the tray.
5. Press **🔥 Cook** and wait until the tray turns green.
6. Click the customer to serve them.

- ✅ Correct order → score ⭐ + coins 🪙 (faster = bigger tip and more happiness)
- ❌ Wrong order → happiness drops
- ⏰ Too slow → the customer leaves angry and happiness drops
- The game ends when the **120-second timer** runs out or **happiness reaches zero**. Then press **Play Again**.

**Keyboard:** `1`–`5` add food · `Space` cook · `Backspace` clear tray · `Enter` start game

## ✨ Features

- Score, coins, timer and customer happiness meter
- 4 tables, a kitchen with a food menu, tray and cooking bar
- Gets harder over time (more customers, bigger orders, less patience)
- Simple animations and sound effects (made with the Web Audio API, with a mute button)
- Best score saved in the browser
- Responsive layout for desktop and mobile

## 📁 Files

| File | Purpose |
|---|---|
| `index.html` | Page layout |
| `style.css` | Colors, layout and animations |
| `script.js` | Game logic and sounds |
| `tests/cafe.spec.js` | Playwright tests |
| `playwright.config.js` | Test settings (desktop + mobile) |

## 🧪 Running the tests (optional)

Requires [Node.js](https://nodejs.org/).

```bash
npm install
npx playwright install chromium
npm test
```

The tests open the game, start it, select food, serve customers, check the score and timer,
and verify the Game Over and Play Again screens on both desktop and mobile screen sizes.
