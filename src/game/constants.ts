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
  vy: number;
  type: number; // 0..12
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

// Complete 13 powerup definitions
export const POWERUP_NAMES: Record<number, { name: string; color: string; badge: string }> = {
  0:  { name: "EXTRA LIFE", color: "#4488ff", badge: "+1" },
  1:  { name: "LEVEL WARP", color: "#00ddff", badge: "W" },
  2:  { name: "ZAP BRICKS", color: "#00e0ff", badge: "Z" },
  3:  { name: "SLOW BALL", color: "#0066ff", badge: "S" },
  4:  { name: "SPLIT BALL", color: "#ffffff", badge: "3B" },
  5:  { name: "GRAB PADDLE", color: "#0055ff", badge: "G" },
  6:  { name: "SHOOTING PADDLE", color: "#2277ff", badge: "L" },
  7:  { name: "THRU BRICK", color: "#3366ee", badge: "T" },
  8:  { name: "SET-OFF EXPLODING", color: "#ff8800", badge: "EX" },
  9:  { name: "FIREBALL", color: "#ff4400", badge: "F" },
  10: { name: "EXPAND PADDLE", color: "#cccccc", badge: "<>" },
  11: { name: "SHRINK PADDLE", color: "#ff3333", badge: "><" },
  12: { name: "FAST BALL", color: "#ff2222", badge: ">>" },
};

export const BRICK_COLORS: Record<number, { fill: string; border: string; highlight: string; hits: number; isExplosive?: boolean }> = {
  1:  { fill: "#d02020", border: "#800000", highlight: "#ff6060", hits: 1 }, // Red
  2:  { fill: "#888888", border: "#444444", highlight: "#bbbbbb", hits: 999 }, // Unbreakable Silver
  3:  { fill: "#c0c000", border: "#707000", highlight: "#ffff60", hits: 3 }, // Gold / 3-hit
  4:  { fill: "#a0a0a0", border: "#505050", highlight: "#e0e0e0", hits: 2 }, // 2-hit (damaged gold)
  5:  { fill: "#707070", border: "#303030", highlight: "#b0b0b0", hits: 1 }, // 1-hit (almost broken gold)
  6:  { fill: "#e0e0e0", border: "#909090", highlight: "#ffffff", hits: 1 }, // White
  7:  { fill: "#ff80a0", border: "#b04060", highlight: "#ffb0c0", hits: 2 }, // Pink 2-hit
  8:  { fill: "#ff4400", border: "#990000", highlight: "#ffaa00", hits: 1, isExplosive: true }, // EXPLOSIVE BRICK
  9:  { fill: "#00d020", border: "#007010", highlight: "#60ff80", hits: 1 }, // Green
  10: { fill: "#0040d0", border: "#002070", highlight: "#6080ff", hits: 1 }, // Blue
  11: { fill: "#a020d0", border: "#501070", highlight: "#d060ff", hits: 1 }, // Purple
  12: { fill: "#00d0d0", border: "#007070", highlight: "#60ffff", hits: 1 }, // Cyan
  13: { fill: "#d08000", border: "#704000", highlight: "#ffb040", hits: 1 }, // Amber
  14: { fill: "#d02060", border: "#701030", highlight: "#ff60a0", hits: 1 }, // Magenta
  15: { fill: "#e06040", border: "#803020", highlight: "#ffa080", hits: 1 }, // Coral
  16: { fill: "#6040d0", border: "#302070", highlight: "#a080ff", hits: 1 }, // Indigo
  17: { fill: "#a0a060", border: "#505030", highlight: "#d0d090", hits: 1 }, // Olive
  18: { fill: "#d05080", border: "#702040", highlight: "#ff90b0", hits: 1 }, // Rose
  19: { fill: "#40a080", border: "#205040", highlight: "#70d0b0", hits: 1 }, // Teal
  20: { fill: "#804020", border: "#402010", highlight: "#b07040", hits: 1 }, // Brown
  21: { fill: "#40c0e0", border: "#206080", highlight: "#80e0ff", hits: 1 }, // Morphing
  22: { fill: "#ffff00", border: "#888800", highlight: "#ffffff", hits: 1 }, // Bright yellow
};

// All 50 original boards decoded directly from the 20,000 byte Default.bds file
export const ALL_50_BOARDS: number[][] = boardsRaw as number[][];
