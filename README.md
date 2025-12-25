# OUTPOST 31

**ASSIMILATION SIMULATION**

A text-based adventure game inspired by John Carpenter's *The Thing* (1982).

---

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Scripts

| Command         | Description                                |
| --------------- | ------------------------------------------ |
| `npm run dev`   | Start dev server with hot reload           |
| `npm run build` | Build for production (outputs to `dist/`)  |
| `npm run preview` | Preview production build locally         |

---

## How to Play

- **↑ / ↓** — Navigate choices
- **Enter** — Confirm selection
- **Click** — Select option

### Objective

Gather evidence. Confirm infection. Execute containment.

---

## Tech Stack

- Vanilla HTML, CSS, JavaScript
- [Vite](https://vite.dev) for development server

No frameworks. No transpilation. Just clean, simple code.

---

## Project Structure

```
outpost-31/
├── index.html        # Main game entry
├── reset.css         # Modern CSS reset
├── src/
│   ├── main.js       # Entry point & initialization
│   ├── state.js      # State management & difficulty
│   ├── blood.js      # Blood roster & infection mechanics
│   ├── story.js      # Story tree with all nodes
│   └── ui.js         # Meters, rendering, HUD
├── styles/
│   ├── main.css      # Entry point (imports all)
│   ├── variables.css # Design tokens
│   ├── base.css      # Body, layout, links
│   ├── hud.css       # HUD component
│   ├── meters.css    # Meter bars + animations
│   ├── choices.css   # Choice UI, output, trophy
│   └── splash.css    # Splash screen
├── settings/
│   └── index.html    # Help & spoilers page
└── assets/           # Images & trophies
```

---

*Who goes there?*
