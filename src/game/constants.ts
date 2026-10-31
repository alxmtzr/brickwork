import boardsRaw from "./boards50.json" with { type: "json" };

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

// All 18 original DX-Ball power-ups (mapped from FUN_00406ef0 & FUN_00407420)
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

// The exact 3 columns x 6 rows order shown on Mainmenu.pcx
export const MENU_POWERUP_COLUMNS: number[][] = [
  [10, 5, 6, 7, 8, 9],     // Col 1: Expand Paddle, Thru Brick, Set-Off Exploding, FireBall, Shooting Paddle, Grab Paddle
  [11, 0, 1, 2, 3, 4],     // Col 2: Shrink Paddle, Extra Life, Level Warp, Zap Bricks, Slow Ball, Multiply Exploding
  [12, 13, 18, 15, 16, 17] // Col 3: Split Ball, Kill Paddle, Shrink Ball, Fast Ball, Super Shrink, Falling Bricks
];

// Exact 41x7 dot-matrix bitmap recovered from FUN_0040b2d0 (spells DX-BALL in orbiting silver balls)
export const DXBALL_DOT_MATRIX_41X7: number[] = [
  // Row 0 (41)
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  // Row 1 (41): .###...#...#.....####....#...#.....#.....
  0,1,1,1,0,0,0,1,0,0,0,1,0,0,0,0,0,1,1,1,1,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,
  // Row 2 (41): .#..#...#.#......#...#..#.#..#.....#.....
  0,1,0,0,1,0,0,0,1,0,1,0,0,0,0,0,0,1,0,0,0,1,0,0,1,0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,0,
  // Row 3 (41): .#...#...#...###.#..#..#...#.#.....#.....
  0,1,0,0,0,1,0,0,0,1,0,0,0,1,1,1,0,1,0,0,1,0,0,1,0,0,0,1,0,1,0,0,0,0,0,1,0,0,0,0,0,
  // Row 4 (41): .#..#...#.#......#...#.#####.#.....#.....
  0,1,0,0,1,0,0,0,1,0,1,0,0,0,0,0,0,1,0,0,0,1,0,1,1,1,1,1,0,1,0,0,0,0,0,1,0,0,0,0,0,
  // Row 5 (41): .###...#...#.....####..#...#.#####.#####.
  0,1,1,1,0,0,0,1,0,0,0,1,0,0,0,0,0,1,1,1,1,0,0,1,0,0,0,1,0,1,1,1,1,1,0,1,1,1,1,1,0,
  // Row 6 (41)
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
];

export const ORIGINAL_SCROLLER_TEXT =
  "WELCOME TO DX-BALL.     GREETINGS GO OUT TO:  ED + AL MACKEY, SIMEON, LARRY, MIKE BOEH, DARK UNICORN PRODUCTIONS (SHANE, JOHN, SEUMAS, ERIC (SIDEWINDER), REMEMBER KIT...), AND THE 'MAD TESTER' CHAY-BOB.     " +
  "THIS PROJECT WAS MANY LONG MONTHS IN THE MAKING.    LATE NIGHTS, LOTS OF MOUNTAIN DEW, AND MANY PROGRAMMING BOOKS GOT THIS, MY FIRST DIRECT X AND PC GAME, FINISHED FOR YOUR VIEWING PLEASURE.      " +
  "ABOUT THE GAME: I KNOW 'BREAKOUT' GAMES HAVE BEEN DONE TO DEATH, BUT I HAVEN'T FOUND ONE YET THAT'S AS COMPELLING AS MEGABALL FOR THE AMIGA COMPUTER.    " +
  "BY THE WAY, DX-BALL IS MEANT TO BE AN AMIGA GAME TRAPPED IN A PC'S BODY.   (SMILE)    " +
  "THANKS FOR READING, AND ENJOY THE GAME.                                                 MADE YOU LOOK!  HEHEHEHEHEHE                                        ";

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

// All 50 original boards decoded directly from the 20,000 byte Default.bds file
export const ALL_50_BOARDS: number[][] = boardsRaw as number[][];
