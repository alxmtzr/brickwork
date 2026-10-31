export interface Brick {
  col: number;
  row: number;
  type: number;
  hitsLeft: number;
  alive: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  speed: number;
  stuckToPaddle: boolean;
  stuckOffset: number;
  isFireball: boolean;
  isThruBrick: boolean;
}

export interface Paddle {
  x: number;
  y: number;
  w: number;
  h: number;
  targetX: number;
  hasLasers: boolean;
  hasGrab: boolean;
  laserCooldown: number;
}

export interface Bullet {
  x: number;
  y: number;
  vy: number;
}

export interface Capsule {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravTick: number;
  type: number; // 0..18
  alive: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export const BRICK_W = 30;
export const BRICK_H = 15;
export const BOARD_COLS = 20;
export const BOARD_ROWS = 20;
export const STAGE_W = 640;
export const STAGE_H = 480;
export const PLAYFIELD_LEFT = 20;
export const PLAYFIELD_RIGHT = 620;
export const PLAYFIELD_TOP = 25;

export type PowerupCategory = "grey" | "blue" | "red";

export interface PowerupDef {
  id: number;
  name: string;
  line1: string;
  line2: string;
  category: PowerupCategory;
  color: string;
}

// All 18 classic power-ups (grey, blue, red 3D beveled tiles)
export const POWERUP_DEFS: Record<number, PowerupDef> = {
  0:  { id: 0,  name: "EXTRA LIFE",         line1: "Extra",    line2: "Life",      category: "blue", color: "#4488ff" },
  1:  { id: 1,  name: "LEVEL WARP",         line1: "Level",    line2: "Warp",      category: "blue", color: "#00ddff" },
  2:  { id: 2,  name: "ZAP BRICKS",         line1: "Zap",      line2: "Bricks",    category: "blue", color: "#00e0ff" },
  3:  { id: 3,  name: "SLOW BALL",          line1: "Slow",     line2: "Ball",      category: "blue", color: "#3388ff" },
  4:  { id: 4,  name: "MULTIPLY EXPLODING", line1: "Multiply", line2: "Exploding", category: "blue", color: "#ff9922" },
  5:  { id: 5,  name: "THRU BRICK",         line1: "Thru",     line2: "Brick",     category: "blue", color: "#4477ff" },
  6:  { id: 6,  name: "SET-OFF EXPLODING",  line1: "Set-Off",  line2: "Exploding", category: "blue", color: "#ff6600" },
  7:  { id: 7,  name: "FIREBALL",           line1: "FireBall", line2: "",          category: "blue", color: "#ff4400" },
  8:  { id: 8,  name: "SHOOTING PADDLE",    line1: "Shooting", line2: "Paddle",    category: "blue", color: "#2277ff" },
  9:  { id: 9,  name: "GRAB PADDLE",        line1: "Grab",     line2: "Paddle",    category: "blue", color: "#00cc88" },
  10: { id: 10, name: "EXPAND PADDLE",      line1: "Expand",   line2: "Paddle",    category: "grey", color: "#cccccc" },
  11: { id: 11, name: "SHRINK PADDLE",      line1: "Shrink",   line2: "Paddle",    category: "grey", color: "#aaaaaa" },
  12: { id: 12, name: "SPLIT BALL",         line1: "Split",    line2: "Ball",      category: "grey", color: "#44ff66" },
  13: { id: 13, name: "KILL PADDLE",        line1: "Kill",     line2: "Paddle",    category: "red",  color: "#ff2222" },
  15: { id: 15, name: "FAST BALL",          line1: "Fast",     line2: "Ball",      category: "red",  color: "#ffee00" },
  16: { id: 16, name: "SUPER SHRINK",       line1: "Super",    line2: "Shrink",    category: "red",  color: "#ff3333" },
  17: { id: 17, name: "FALLING BRICKS",     line1: "Falling",  line2: "Bricks",    category: "red",  color: "#aa44ff" },
  18: { id: 18, name: "SHRINK BALL",        line1: "Shrink",   line2: "Ball",      category: "red",  color: "#ff4444" },
};

// 3 columns x 6 rows legend order on the Start Screen
export const MENU_POWERUP_COLUMNS: number[][] = [
  [10, 5, 6, 7, 8, 9],     // Col 1: Expand Paddle, Thru Brick, Set-Off Exploding, FireBall, Shooting Paddle, Grab Paddle
  [11, 0, 1, 2, 3, 4],     // Col 2: Shrink Paddle, Extra Life, Level Warp, Zap Bricks, Slow Ball, Multiply Exploding
  [12, 13, 18, 15, 16, 17] // Col 3: Split Ball, Kill Paddle, Shrink Ball, Fast Ball, Super Shrink, Falling Bricks
];

// 46x7 dot-matrix bitmap spelling "BRICKWORK" in orbiting 3D silver balls
export const BRICKWORK_DOT_COLS = 46;
export const BRICKWORK_DOT_ROWS = 7;
export const BRICKWORK_DOT_MATRIX: number[] = [
  // Row 0 (46): top margin of orbiting background dots
  0, 0,0,0,0, 0, 0,0,0,0, 0, 0,0,0, 0, 0,0,0,0, 0, 0,0,0,0, 0, 0,0,0,0,0, 0, 0,0,0,0, 0, 0,0,0,0, 0, 0,0,0,0, 0,
  // Row 1 (46): B R I C K W O R K
  0, 1,1,1,0, 0, 1,1,1,0, 0, 1,1,1, 0, 0,1,1,1, 0, 1,0,0,1, 0, 1,0,0,0,1, 0, 0,1,1,0, 0, 1,1,1,0, 0, 1,0,0,1, 0,
  // Row 2 (46)
  0, 1,0,0,1, 0, 1,0,0,1, 0, 0,1,0, 0, 1,0,0,0, 0, 1,0,1,0, 0, 1,0,0,0,1, 0, 1,0,0,1, 0, 1,0,0,1, 0, 1,0,1,0, 0,
  // Row 3 (46)
  0, 1,1,1,0, 0, 1,1,1,0, 0, 0,1,0, 0, 1,0,0,0, 0, 1,1,0,0, 0, 1,0,1,0,1, 0, 1,0,0,1, 0, 1,1,1,0, 0, 1,1,0,0, 0,
  // Row 4 (46)
  0, 1,0,0,1, 0, 1,0,1,0, 0, 0,1,0, 0, 1,0,0,0, 0, 1,0,1,0, 0, 1,1,0,1,1, 0, 1,0,0,1, 0, 1,0,1,0, 0, 1,0,1,0, 0,
  // Row 5 (46)
  0, 1,1,1,0, 0, 1,0,0,1, 0, 1,1,1, 0, 0,1,1,1, 0, 1,0,0,1, 0, 1,0,0,0,1, 0, 0,1,1,0, 0, 1,0,0,1, 0, 1,0,0,1, 0,
  // Row 6 (46): bottom margin of orbiting background dots
  0, 0,0,0,0, 0, 0,0,0,0, 0, 0,0,0, 0, 0,0,0,0, 0, 0,0,0,0, 0, 0,0,0,0,0, 0, 0,0,0,0, 0, 0,0,0,0, 0, 0,0,0,0, 0,
];

export const ORIGINAL_SCROLLER_TEXT =
  "WELCOME TO BRICKWORK!     A CLEAN-ROOM HTML5 CANVAS AND WEBAUDIO TRIBUTE TO CLASSIC 1990S AMIGA AND PC BRICK-BREAKER GAMES.     " +
  "FEATURING DUAL PLAY MODES (CLASSIC 4:3 AND MODERN FULLSCREEN PORTRAIT), 50 ARCADE BOARDS, AN INTERACTIVE 20X20 LEVEL EDITOR, AND ALL 18 POWER-UP TILES WITH PARABOLIC GRAVITY PHYSICS.     " +
  "WATCH OUT FOR RED PENALTY TILES, CHAIN-REACTION EXPLODING BRICKS, AND HIGH-SPEED FIREBALL RUNS!     " +
  "THANKS FOR PLAYING BRICKWORK — HAVE FUN SMASHING BRICKS!                                        ";

export const BRICK_COLORS: Record<number, { fill: string; border: string; highlight: string; inner?: string; hits: number; isExplosive?: boolean; isUnbreakable?: boolean }> = {
  1:  { fill: "#cc1010", border: "#660000", highlight: "#ff5050", hits: 1 }, // Red
  2:  { fill: "#787888", border: "#383844", highlight: "#b8b8cc", hits: 999, isUnbreakable: true }, // Unbreakable Silver
  3:  { fill: "#b0b0b8", border: "#505058", highlight: "#f0f0ff", hits: 3 }, // 3-hit Silver/Gold
  4:  { fill: "#888890", border: "#404048", highlight: "#c8c8d0", hits: 2 }, // 2-hit
  5:  { fill: "#606068", border: "#282830", highlight: "#9898a0", hits: 1 }, // 1-hit
  6:  { fill: "#d85888", border: "#882248", highlight: "#ffa0c0", inner: "#c04070", hits: 2 }, // Pink 2-hit recessed
  7:  { fill: "#f08820", border: "#984400", highlight: "#ffd890", inner: "#f8a040", hits: 1 }, // Light Orange w/ white rim
  8:  { fill: "#ff8800", border: "#993300", highlight: "#ffff44", hits: 1, isExplosive: true }, // EXPLOSIVE BRICK
  9:  { fill: "#00b818", border: "#005808", highlight: "#58ff68", inner: "#009810", hits: 1 }, // Green
  10: { fill: "#0028c8", border: "#001068", highlight: "#4870ff", inner: "#0020a0", hits: 1 }, // Deep Blue
  11: { fill: "#6818a8", border: "#340858", highlight: "#a858e8", inner: "#541088", hits: 1 }, // Purple
  12: { fill: "#00b8b8", border: "#006060", highlight: "#60ffff", inner: "#009898", hits: 1 }, // Cyan
  13: { fill: "#d86800", border: "#783400", highlight: "#ffa840", inner: "#b85400", hits: 1 }, // Dark Orange
  14: { fill: "#c81058", border: "#680828", highlight: "#ff5898", inner: "#a80848", hits: 1 }, // Crimson/Magenta
  15: { fill: "#d86898", border: "#783050", highlight: "#ffa8d0", inner: "#b85080", hits: 1 }, // Rose Pink
  16: { fill: "#c818c8", border: "#680868", highlight: "#ff68ff", inner: "#f030f0", hits: 1 }, // Bright Violet
  17: { fill: "#009070", border: "#004838", highlight: "#40d8b0", inner: "#007858", hits: 1 }, // Teal
  18: { fill: "#808080", border: "#404040", highlight: "#b8b8b8", hits: 1 }, // Textured Grey
  19: { fill: "#606060", border: "#303030", highlight: "#989898", hits: 1 }, // Dark Textured
  20: { fill: "#b89000", border: "#604800", highlight: "#ffe040", inner: "#987800", hits: 1 }, // Gold/Amber
  21: { fill: "#20a8d8", border: "#105470", highlight: "#70d8ff", inner: "#1888b0", hits: 1 }, // Sky Blue
  22: { fill: "#e8d800", border: "#807000", highlight: "#ffff70", inner: "#c8b800", hits: 1 }, // Bright Yellow
};

// Clean-room generator for 50 varied 20x20 arcade campaign boards
function generateCleanRoomBoards(): number[][] {
  const boards: number[][] = [];
  const colorPalette = [1, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22];

  for (let b = 0; b < 50; b++) {
    const grid = new Array<number>(BOARD_COLS * BOARD_ROWS).fill(0);
    const pattern = b % 10;
    const c1 = colorPalette[(b * 3) % colorPalette.length]!;
    const c2 = colorPalette[(b * 3 + 5) % colorPalette.length]!;
    const c3 = colorPalette[(b * 3 + 9) % colorPalette.length]!;

    for (let r = 1; r < 16; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const idx = r * BOARD_COLS + c;
        const mirrorC = Math.min(c, BOARD_COLS - 1 - c);

        if (pattern === 0) {
          // Classic Rainbow Fortress with Explosive Core
          if (r >= 2 && r <= 11 && c >= 1 && c <= 18) {
            if (r >= 5 && r <= 8 && c >= 7 && c <= 12) {
              grid[idx] = 8; // Explosive cluster
            } else if (r === 11 && (c < 5 || c > 14)) {
              grid[idx] = 4; // 2-hit guard
            } else {
              grid[idx] = colorPalette[(r + b) % colorPalette.length]!;
            }
          }
        } else if (pattern === 1) {
          // Twin Diamond Citadels
          const dLeft = Math.abs(r - 7) + Math.abs(c - 5);
          const dRight = Math.abs(r - 7) + Math.abs(c - 14);
          const dMin = Math.min(dLeft, dRight);
          if (dMin <= 4) {
            grid[idx] = dMin === 0 ? 8 : dMin === 4 ? 3 : dMin % 2 === 0 ? c1 : c2;
          }
        } else if (pattern === 2) {
          // Vertical Columns & Explosive Bridges
          if (mirrorC % 2 === 1 && r >= 2 && r <= 13) {
            grid[idx] = r === 7 ? 8 : r === 13 ? 4 : c1;
          } else if (r === 7 && c >= 2 && c <= 17) {
            grid[idx] = 8;
          }
        } else if (pattern === 3) {
          // Concentric Ring Vault
          const dr = Math.abs(r - 8);
          const dc = Math.abs(c - 9.5);
          const ring = Math.max(dr, Math.floor(dc * 0.75));
          if (ring <= 6 && r >= 2 && r <= 14) {
            if (ring === 0 || ring === 1) grid[idx] = 8;
            else if (ring === 6 && r === 14 && dc > 3) grid[idx] = 2; // Unbreakable bumper ports
            else grid[idx] = ring % 2 === 0 ? c2 : c3;
          }
        } else if (pattern === 4) {
          // Checkerboard Demolition
          if (r >= 2 && r <= 13 && c >= 1 && c <= 18 && (r + c) % 2 === 0) {
            grid[idx] = (r === 6 || r === 9) && c >= 5 && c <= 14 ? 8 : (r % 3 === 0 ? c1 : c2);
          }
        } else if (pattern === 5) {
          // Chevron V-Wings
          const vRow = Math.abs(c - 9.5);
          if (r >= 2 && r <= 14 && Math.abs(r - vRow - 2) <= 2) {
            grid[idx] = Math.abs(r - vRow - 2) === 0 ? 8 : c1;
          } else if (r >= 2 && r <= 5 && mirrorC >= 6) {
            grid[idx] = c3;
          }
        } else if (pattern === 6) {
          // Castle Battlements
          if (r >= 3 && r <= 13 && c >= 2 && c <= 17) {
            if (r === 3 && c % 2 === 1) continue;
            if (r === 13 && (c < 6 || c > 13)) grid[idx] = 3;
            else if (r >= 7 && r <= 9 && (c === 5 || c === 14)) grid[idx] = 8;
            else grid[idx] = r % 2 === 0 ? c2 : c1;
          }
        } else if (pattern === 7) {
          // Horizontal Fuse Channels
          if (r >= 2 && r <= 14 && r % 2 === 0 && c >= 1 && c <= 18) {
            grid[idx] = r === 8 ? 8 : r === 14 ? 4 : colorPalette[(r / 2 + b) % colorPalette.length]!;
          } else if (r >= 2 && r <= 14 && (c === 4 || c === 15)) {
            grid[idx] = 8;
          }
        } else if (pattern === 8) {
          // Space Invader / Arcade Crest
          if (r >= 2 && r <= 12 && mirrorC >= 2 && mirrorC <= 8) {
            const isEye = (r === 5 || r === 6) && (mirrorC === 4 || mirrorC === 5);
            const isCore = r >= 8 && r <= 9 && mirrorC >= 6;
            if (isEye) grid[idx] = 8;
            else if (isCore) grid[idx] = 6;
            else if ((r + mirrorC) % 5 !== 0) grid[idx] = c3;
          }
        } else {
          // Spiral / Cross Catacombs
          if (c >= 1 && c <= 18 && r >= 2 && r <= 14) {
            if (r === 8 || c === 9 || c === 10) {
              grid[idx] = (r === 8 && (c === 9 || c === 10)) ? 8 : 3;
            } else if ((r < 8 && c < 9) || (r > 8 && c > 10)) {
              grid[idx] = c1;
            } else {
              grid[idx] = c2;
            }
          }
        }
      }
    }
    boards.push(grid);
  }

  return boards;
}

export const ALL_50_BOARDS: number[][] = generateCleanRoomBoards();
