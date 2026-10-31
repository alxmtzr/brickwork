# Brickwork

A clean, modern retro breakout game engine written in TypeScript, built with canvas and procedural Web Audio.

Designed for instant play on GitHub Pages with **zero external assets required**.

## Features

- **Instant Play Out of the Box:** Built-in retro arcade rendering, physics, and procedural synthesizer sound effects (no external WAVs or copyright-encumbered assets needed).
- **Reverse-Engineered Board Formats:** Features the decoded 20x20 brick layouts and brick mechanics from 1990s breakout classics.
- **Optional Custom Board Loader:** Contains an in-browser DEFLATE and board unpacker if you wish to drop your own legacy `.bds` files.
- **Full Screen & Responsive:** Dedicated fullscreen button and clean scaling for desktop and laptop displays.

## Development

```bash
npm install
npm run dev     # Start local Vite dev server
npm run build   # Production bundle to dist/
npm test        # Test DEFLATE / CRC32 unpacker
```

## Credits & License

- Code is released under the **MIT License**.
- Developed as an educational reverse-engineering project learning from 1990s freeware breakout mechanics (Michael P. Welch, 1996).
