import {
  type Ball,
  type Brick,
  type Bullet,
  type Capsule,
  type FloatingText,
  type Paddle,
  type Particle,
  ALL_50_BOARDS,
  BOARD_COLS,
  BOARD_ROWS,
  BRICK_COLORS,
  BRICK_H,
  BRICK_W,
  DXBALL_DOT_MATRIX_41X7,
  MENU_POWERUP_COLUMNS,
  ORIGINAL_SCROLLER_TEXT,
  PLAYFIELD_LEFT,
  PLAYFIELD_RIGHT,
  PLAYFIELD_TOP,
  POWERUP_DEFS,
  STAGE_H,
  STAGE_W,
} from "./constants.ts";
import { sound } from "./sound.ts";

export interface HighScoreEntry {
  name: string;
  score: number;
}

export type ViewMode = "classic" | "modern";

// Valid powerup IDs that can spawn in FUN_00406ef0
const SPAWNABLE_POWERUP_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18];

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  public viewMode: ViewMode = "classic";
  public onModeChange?: (mode: ViewMode) => void;

  // Dynamic stage bounds (in classic: 640x480 fixed; in modern: dynamic vertical portrait/fullscreen aspect)
  public virtualW = STAGE_W;
  public virtualH = STAGE_H;
  public playLeft = PLAYFIELD_LEFT;
  public playRight = PLAYFIELD_RIGHT;
  public playTop = PLAYFIELD_TOP;
  public brickScale = 1;
  public brickOffsetX = PLAYFIELD_LEFT;
  public brickOffsetY = PLAYFIELD_TOP + 30;

  private bricks: Brick[] = [];
  private balls: Ball[] = [];
  private bullets: Bullet[] = [];
  private capsules: Capsule[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  private paddle: Paddle = {
    x: STAGE_W / 2 - 40,
    y: 440,
    w: 80,
    h: 14,
    targetX: STAGE_W / 2 - 40,
    hasLasers: false,
    hasGrab: false,
    laserCooldown: 0,
  };

  public score = 0;
  public lastScore = 0;
  public lives = 3;
  public currentLevel = 0;
  private fallingBricksActive = false;

  public state: "intro" | "mode_select" | "menu" | "playing" | "editor" | "highscores" | "ready" | "gameover" | "victory" = "mode_select";

  private running = false;
  private lastTime = 0;
  private animPhase = 0;
  private matrixAngleDeg = 0;
  private matrixTickAccum = 0;

  // Level Editor
  public editorBrush = 1;
  public editorGrid: number[] = new Array(BOARD_COLS * BOARD_ROWS).fill(0);

  // High Scores
  public highScores: HighScoreEntry[] = [];

  // Scroller (for Intro screen)
  private scrollerOffset = STAGE_W;
  private scrollerText = ORIGINAL_SCROLLER_TEXT;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.loadHighScores();
    this.initEvents();
    this.resizeLayout();
  }

  public setViewMode(mode: ViewMode) {
    this.viewMode = mode;
    this.resizeLayout();
    if (this.onModeChange) this.onModeChange(mode);
    if (this.state === "playing" || this.state === "ready") {
      this.loadLevel(this.currentLevel);
    }
  }

  public startWithMode(mode: ViewMode) {
    this.viewMode = mode;
    this.resizeLayout();
    if (this.onModeChange) this.onModeChange(mode);
    this.score = 0;
    this.lives = 3;
    this.customLevels = null;
    this.loadLevel(0);
  }

  public resizeLayout() {
    if (this.viewMode === "classic") {
      this.virtualW = STAGE_W;
      this.virtualH = STAGE_H;
      this.playLeft = PLAYFIELD_LEFT;
      this.playRight = PLAYFIELD_RIGHT;
      this.playTop = PLAYFIELD_TOP;
      this.brickScale = 1;
      this.brickOffsetX = PLAYFIELD_LEFT;
      this.brickOffsetY = PLAYFIELD_TOP + 30;
      this.canvas.width = STAGE_W;
      this.canvas.height = STAGE_H;
    } else {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(rect.width * dpr) || 390;
      const h = Math.round(rect.height * dpr) || 780;

      this.virtualW = w;
      this.virtualH = h;
      this.canvas.width = w;
      this.canvas.height = h;

      this.playLeft = 14 * dpr;
      this.playRight = w - 14 * dpr;
      this.playTop = 42 * dpr;

      const availW = this.playRight - this.playLeft;
      this.brickScale = availW / (BOARD_COLS * BRICK_W);
      this.brickOffsetX = this.playLeft;
      this.brickOffsetY = this.playTop + 30 * dpr;

      this.paddle.y = h - 75 * dpr;
      this.paddle.h = 16 * dpr;
      this.paddle.w = 88 * dpr;
    }
  }

  private loadHighScores() {
    try {
      const saved = localStorage.getItem("brickwork_highscores");
      if (saved) {
        this.highScores = JSON.parse(saved);
      } else {
        this.highScores = [
          { name: "SCORCH", score: 18500 },
          { name: "SEUMAS", score: 14200 },
          { name: "MACKEY", score: 11000 },
          { name: "MEGABALL", score: 8500 },
          { name: "AMIGA", score: 6000 },
        ];
      }
      const savedLast = localStorage.getItem("brickwork_lastscore");
      if (savedLast) this.lastScore = parseInt(savedLast, 10) || 0;
    } catch {
      this.highScores = [];
    }
  }

  private saveHighScores() {
    try {
      localStorage.setItem("brickwork_highscores", JSON.stringify(this.highScores));
      localStorage.setItem("brickwork_lastscore", String(this.lastScore));
    } catch {
      // ignore
    }
  }

  private checkHighScore(finalScore: number): boolean {
    this.lastScore = finalScore;
    this.saveHighScores();
    if (finalScore > 0) {
      const lowest = this.highScores[this.highScores.length - 1]?.score || 0;
      if (this.highScores.length < 14 || finalScore > lowest) {
        const name = prompt(`New High Score of ${finalScore}! Enter your name:`, "PLAYER") || "PLAYER";
        this.highScores.push({ name: name.slice(0, 10).toUpperCase(), score: finalScore });
        this.highScores.sort((a, b) => b.score - a.score);
        if (this.highScores.length > 14) this.highScores.length = 14;
        this.saveHighScores();
        this.state = "highscores";
        return true;
      }
    }
    return false;
  }

  public setCustomBoards(boards: Uint8Array[]) {
    this.customLevels = boards.map((b) => Array.from(b));
    this.loadLevel(0);
  }

  private customLevels: number[][] | null = null;

  public loadLevel(levelIndex: number) {
    const levels = this.customLevels || ALL_50_BOARDS;
    this.currentLevel = Math.max(0, Math.min(levelIndex, levels.length - 1));
    const grid = levels[this.currentLevel]!;

    const isModern = this.viewMode === "modern";
    const bw = BRICK_W * this.brickScale;
    const bh = isModern
      ? Math.max(13 * (this.virtualW / 390), BRICK_H * this.brickScale * 1.35)
      : (BRICK_H * this.brickScale);

    this.bricks = [];
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const type = grid[r * BOARD_COLS + c]!;
        if (type > 0) {
          const info = BRICK_COLORS[type] || { hits: 1 };
          this.bricks.push({
            col: c,
            row: r,
            type,
            hitsLeft: info.hits,
            alive: true,
            x: this.brickOffsetX + c * bw,
            y: this.brickOffsetY + r * bh,
            w: bw,
            h: bh,
          });
        }
      }
    }

    this.bullets = [];
    this.capsules = [];
    this.fallingBricksActive = false;
    this.resetPaddleAndBall();
    this.state = "ready";
  }

  private resetPaddleAndBall() {
    const isModern = this.viewMode === "modern";
    const dpr = isModern ? (this.virtualW / 390) : 1;
    this.paddle.w = (isModern ? 88 : 80) * dpr;
    this.paddle.h = (isModern ? 16 : 13) * dpr;
    this.paddle.y = this.virtualH - (isModern ? 75 * dpr : 36);
    this.paddle.x = this.virtualW / 2 - this.paddle.w / 2;
    this.paddle.targetX = this.paddle.x;
    this.paddle.hasLasers = false;
    this.paddle.hasGrab = false;

    const speedRatio = isModern ? Math.max(1.7, this.virtualH / 460) : 1.0;
    const baseSpeed = 5.6 * speedRatio;

    this.balls = [
      {
        x: this.paddle.x + this.paddle.w / 2,
        y: this.paddle.y - 8 * dpr,
        vx: 0,
        vy: 0,
        radius: (isModern ? 6.5 : 5.5) * dpr,
        speed: baseSpeed,
        stuckToPaddle: true,
        stuckOffset: this.paddle.w / 2,
        isFireball: false,
        isThruBrick: false,
      },
    ];
  }

  public launchBall() {
    if (this.state === "intro") {
      this.state = "mode_select";
      return;
    }

    if (this.state === "mode_select" || this.state === "menu") {
      this.startWithMode(this.viewMode);
      return;
    }

    if (this.state === "highscores") {
      this.state = "mode_select";
      return;
    }

    if (this.state === "ready") {
      this.state = "playing";
      for (const b of this.balls) {
        if (b.stuckToPaddle) {
          b.stuckToPaddle = false;
          b.vx = (Math.random() - 0.5) * (b.speed * 0.7);
          b.vy = -Math.sqrt(Math.max(10, b.speed * b.speed - b.vx * b.vx));
        }
      }
      sound.hitPaddle(1);
    } else if (this.state === "playing") {
      if (this.paddle.hasLasers && this.paddle.laserCooldown <= 0) {
        const bulletVy = this.viewMode === "modern" ? -16 : -10;
        this.bullets.push({ x: this.paddle.x + 8, y: this.paddle.y - 4, vy: bulletVy });
        this.bullets.push({ x: this.paddle.x + this.paddle.w - 8, y: this.paddle.y - 4, vy: bulletVy });
        this.paddle.laserCooldown = 0.18;
        sound.laser();
      }

      for (const b of this.balls) {
        if (b.stuckToPaddle) {
          b.stuckToPaddle = false;
          const hitOffset = (b.stuckOffset - this.paddle.w / 2) / (this.paddle.w / 2);
          b.vx = b.speed * Math.sin(hitOffset * 1.1);
          b.vy = -b.speed * Math.cos(hitOffset * 1.1);
          sound.hitPaddle(0);
        }
      }
    } else if (this.state === "gameover" || this.state === "victory") {
      if (!this.checkHighScore(this.score)) {
        this.state = "mode_select";
      }
    }
  }

  private getMenuButtonRects() {
    const s = this.virtualW / STAGE_W;
    const isModern = this.viewMode === "modern" && this.virtualH > this.virtualW;

    if (isModern) {
      const btnW = Math.min(this.virtualW * 0.44, 200);
      const btnH = Math.max(36, Math.round(this.virtualH * 0.052));
      const gap = 10;
      const rowY = this.virtualH * 0.305;
      const subY = rowY + btnH + 8;
      const subW = (btnW * 2 + gap - 16) / 3;
      const subH = Math.max(28, Math.round(btnH * 0.78));
      const leftX = this.virtualW / 2 - btnW - gap / 2;
      return {
        classicBtn: { x: leftX, y: rowY, w: btnW, h: btnH },
        modernBtn: { x: this.virtualW / 2 + gap / 2, y: rowY, w: btnW, h: btnH },
        introBtn: { x: leftX, y: subY, w: subW, h: subH },
        scoresBtn: { x: leftX + subW + 8, y: subY, w: subW, h: subH },
        editorBtn: { x: leftX + (subW + 8) * 2, y: subY, w: subW, h: subH },
      };
    }

    // Classic 640x480 layout: placed cleanly on the right side between "BY ED AND AL MACKEY" and the Boing Ball,
    // plus full-screen click fallback so clicking anywhere on the start screen starts the game just like DX-Ball!
    const rightPanelX = 432 * s;
    const btnW = 188 * s;
    const btnH = 28 * s;
    return {
      classicBtn: { x: rightPanelX, y: 156 * s, w: btnW, h: btnH },
      modernBtn: { x: rightPanelX, y: 190 * s, w: btnW, h: btnH },
      introBtn: { x: rightPanelX, y: 224 * s, w: 58 * s, h: 22 * s },
      scoresBtn: { x: rightPanelX + 63 * s, y: 224 * s, w: 62 * s, h: 22 * s },
      editorBtn: { x: rightPanelX + 130 * s, y: 224 * s, w: 58 * s, h: 22 * s },
    };
  }

  private initEvents() {
    window.addEventListener("resize", () => {
      if (this.viewMode === "modern") {
        this.resizeLayout();
      }
    });

    const getPos = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.virtualW / rect.width;
      const scaleY = this.virtualH / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    };

    const inRect = (pos: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) =>
      pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h;

    const handlePointerAction = (pos: { x: number; y: number }) => {
      if (this.state === "intro") {
        this.state = "mode_select";
        return;
      }

      if (this.state === "mode_select" || this.state === "menu") {
        const rects = this.getMenuButtonRects();
        if (inRect(pos, rects.classicBtn)) {
          this.startWithMode("classic");
          return;
        }
        if (inRect(pos, rects.modernBtn)) {
          this.startWithMode("modern");
          return;
        }
        if (inRect(pos, rects.introBtn)) {
          this.scrollerOffset = this.virtualW;
          this.state = "intro";
          return;
        }
        if (inRect(pos, rects.scoresBtn)) {
          this.state = "highscores";
          return;
        }
        if (inRect(pos, rects.editorBtn)) {
          this.state = "editor";
          this.editorGrid = new Array(BOARD_COLS * BOARD_ROWS).fill(0);
          return;
        }
        // In original DX-Ball, clicking anywhere on the Main Menu starts the game!
        this.startWithMode(this.viewMode);
        return;
      }

      if (this.state === "editor") {
        this.handleEditorClick(pos.x, pos.y);
        return;
      }

      if (this.state === "highscores") {
        this.state = "mode_select";
        return;
      }

      this.launchBall();
    };

    // Mouse
    window.addEventListener("mousemove", (e) => {
      const pos = getPos(e.clientX, e.clientY);
      this.paddle.targetX = pos.x - this.paddle.w / 2;
      if (this.state === "editor" && e.buttons === 1) {
        this.handleEditorClick(pos.x, pos.y);
      }
    });

    this.canvas.addEventListener("mousedown", (e) => {
      const pos = getPos(e.clientX, e.clientY);
      handlePointerAction(pos);
    });

    // Touch
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const pos = getPos(touch.clientX, touch.clientY);
      this.paddle.targetX = pos.x - this.paddle.w / 2;
      handlePointerAction(pos);
    }, { passive: false });

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const pos = getPos(touch.clientX, touch.clientY);
      this.paddle.targetX = pos.x - this.paddle.w / 2;
      if (this.state === "editor") {
        this.handleEditorClick(pos.x, pos.y);
      }
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        this.launchBall();
      } else if (e.key === "e" || e.key === "E") {
        if (this.state !== "editor") {
          this.state = "editor";
          this.editorGrid = new Array(BOARD_COLS * BOARD_ROWS).fill(0);
        } else {
          this.state = "mode_select";
        }
      } else if (e.key === "h" || e.key === "H") {
        this.state = this.state === "highscores" ? "mode_select" : "highscores";
      } else if (e.key === "i" || e.key === "I") {
        this.scrollerOffset = this.virtualW;
        this.state = this.state === "intro" ? "mode_select" : "intro";
      } else if (e.key === "Escape") {
        this.state = "mode_select";
      } else if (e.key === "m" || e.key === "M") {
        this.state = "mode_select";
      } else if (e.key === "n" || e.key === "N") {
        if (this.state === "playing" || this.state === "ready") {
          this.loadLevel(this.currentLevel + 1);
        }
      } else if (e.key === "p" || e.key === "P") {
        if (this.state === "playing" || this.state === "ready") {
          this.loadLevel(this.currentLevel - 1);
        }
      }
    });
  }

  public playEditedLevel() {
    const hasBricks = this.editorGrid.some((t) => t > 0);
    if (!hasBricks) {
      for (let r = 3; r <= 7; r++) {
        for (let c = 3; c < 17; c++) {
          this.editorGrid[r * BOARD_COLS + c] = ((r + c) % 6) + 1;
        }
      }
    }
    this.customLevels = [[...this.editorGrid]];
    this.score = 0;
    this.lives = 3;
    this.loadLevel(0);
    this.state = "ready";
  }

  private handleEditorClick(x: number, y: number) {
    const topBarY = Math.max(6, this.playTop - 34);
    const topBarH = 30;

    if (y >= topBarY && y <= topBarY + topBarH) {
      if (x >= this.playLeft + 4 && x <= this.playLeft + 74) {
        this.state = "mode_select";
        return;
      }
      const clearBtnX = this.playRight - 190;
      if (x >= clearBtnX && x <= clearBtnX + 60) {
        this.editorGrid.fill(0);
        return;
      }
      const playBtnX = this.playRight - 120;
      if (x >= playBtnX && x <= this.playRight) {
        this.playEditedLevel();
        return;
      }
    }

    const toolY = this.virtualH - 52;
    if (y >= toolY && y <= toolY + 44) {
      const eraserX = this.playLeft + 6;
      if (x >= eraserX && x <= eraserX + 38) {
        this.editorBrush = 0;
        return;
      }
      const swatchStart = eraserX + 44;
      const swatchW = 20;
      const swatchGap = 4;
      const idx = Math.floor((x - swatchStart) / (swatchW + swatchGap)) + 1;
      if (idx >= 1 && idx <= 22) {
        this.editorBrush = idx;
      }
      return;
    }

    const bw = BRICK_W * this.brickScale;
    const bh = BRICK_H * this.brickScale;
    const col = Math.floor((x - this.brickOffsetX) / bw);
    const row = Math.floor((y - this.brickOffsetY) / bh);
    if (col >= 0 && col < BOARD_COLS && row >= 0 && row < BOARD_ROWS) {
      this.editorGrid[row * BOARD_COLS + col] = this.editorBrush;
    }
  }

  public start() {
    if (!this.running) {
      this.running = true;
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  private loop(now: number) {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number) {
    this.animPhase += dt;

    // 50ms tick for the 41x7 orbiting DX-BALL dot matrix (FUN_0040ba40: 30 deg per 50ms)
    this.matrixTickAccum += dt;
    if (this.matrixTickAccum >= 0.05) {
      this.matrixTickAccum -= 0.05;
      this.matrixAngleDeg = (this.matrixAngleDeg + 30) % 360;
    }

    if (this.state === "intro") {
      this.scrollerOffset -= 140 * dt;
      if (this.scrollerOffset < -12000) this.scrollerOffset = this.virtualW;
      return;
    }

    if (this.state === "mode_select" || this.state === "menu" || this.state === "editor" || this.state === "highscores") {
      return;
    }

    const lerp = 0.45;
    this.paddle.x += (this.paddle.targetX - this.paddle.x) * lerp;
    if (this.paddle.x < this.playLeft) this.paddle.x = this.playLeft;
    if (this.paddle.x + this.paddle.w > this.playRight) {
      this.paddle.x = this.playRight - this.paddle.w;
    }

    if (this.paddle.laserCooldown > 0) this.paddle.laserCooldown -= dt;

    // Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bu = this.bullets[i]!;
      bu.y += bu.vy;
      if (bu.y < this.playTop) {
        this.bullets.splice(i, 1);
        continue;
      }
      for (const br of this.bricks) {
        if (!br.alive) continue;
        if (bu.x >= br.x && bu.x <= br.x + br.w && bu.y >= br.y && bu.y <= br.y + br.h) {
          this.damageBrick(br, false, true);
          this.bullets.splice(i, 1);
          break;
        }
      }
    }

    // Falling Power-up Tiles (FUN_00407420: parabolic arc + wall bounces)
    const tileHalf = 16 * (this.viewMode === "modern" ? (this.virtualW / 390) : 1);
    const gravScale = this.viewMode === "modern" ? Math.max(1.3, this.virtualH / 480) : 1.0;
    for (let i = this.capsules.length - 1; i >= 0; i--) {
      const cap = this.capsules[i]!;
      cap.x += cap.vx;
      cap.y += cap.vy;
      cap.gravTick++;
      if (cap.gravTick > 16) {
        cap.vy += 0.85 * gravScale;
        cap.gravTick = 0;
      }

      if (cap.x - tileHalf < this.playLeft) {
        cap.x = this.playLeft + tileHalf;
        cap.vx = Math.abs(cap.vx);
      } else if (cap.x + tileHalf > this.playRight) {
        cap.x = this.playRight - tileHalf;
        cap.vx = -Math.abs(cap.vx);
      }
      if (cap.y - tileHalf < 0) {
        cap.y = tileHalf;
        cap.vy = Math.abs(cap.vy);
      }

      if (
        cap.y + tileHalf >= this.paddle.y &&
        cap.y - tileHalf <= this.paddle.y + this.paddle.h &&
        cap.x + tileHalf >= this.paddle.x &&
        cap.x - tileHalf <= this.paddle.x + this.paddle.w
      ) {
        this.applyPowerup(cap.type);
        this.score += 100;
        this.capsules.splice(i, 1);
        sound.powerup();
        continue;
      }

      if (cap.y - tileHalf > this.virtualH) this.capsules.splice(i, 1);
    }

    // Balls
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i]!;
      if (b.stuckToPaddle) {
        b.x = this.paddle.x + b.stuckOffset;
        b.y = this.paddle.y - b.radius;
        continue;
      }

      b.x += b.vx;
      b.y += b.vy;

      if (b.x - b.radius < this.playLeft) {
        b.x = this.playLeft + b.radius;
        b.vx = Math.abs(b.vx);
        sound.hitWall();
      } else if (b.x + b.radius > this.playRight) {
        b.x = this.playRight - b.radius;
        b.vx = -Math.abs(b.vx);
        sound.hitWall();
      }

      if (b.y - b.radius < 0) {
        b.y = b.radius;
        b.vy = Math.abs(b.vy);
        sound.hitWall();
      }

      // Paddle collision
      if (
        b.vy > 0 &&
        b.y + b.radius >= this.paddle.y &&
        b.y - b.radius <= this.paddle.y + this.paddle.h &&
        b.x >= this.paddle.x - 4 &&
        b.x <= this.paddle.x + this.paddle.w + 4
      ) {
        if (this.fallingBricksActive) {
          this.shiftBricksDown();
        }
        if (this.paddle.hasGrab) {
          b.stuckToPaddle = true;
          b.stuckOffset = Math.max(4, Math.min(this.paddle.w - 4, b.x - this.paddle.x));
          sound.hitPaddle(0);
        } else {
          const hitOffset = (b.x - (this.paddle.x + this.paddle.w / 2)) / (this.paddle.w / 2);
          const maxAngle = 1.15;
          const angle = Math.max(-maxAngle, Math.min(maxAngle, hitOffset * maxAngle));
          b.vx = b.speed * Math.sin(angle);
          b.vy = -b.speed * Math.cos(angle);
          sound.hitPaddle(Math.abs(hitOffset));
        }
      }

      this.checkBrickCollision(b);

      // Lose ball
      if (b.y - b.radius > this.virtualH) {
        this.balls.splice(i, 1);
        if (this.balls.length === 0) {
          this.loseLife();
        }
      }
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i]!;
      ft.y -= 28 * dt;
      ft.life -= dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }

    // Level clear check
    if (this.state === "playing") {
      const remaining = this.bricks.some((br) => br.alive && !BRICK_COLORS[br.type]?.isUnbreakable);
      if (!remaining) {
        sound.levelClear();
        const totalLevels = (this.customLevels || ALL_50_BOARDS).length;
        if (this.currentLevel + 1 < totalLevels) {
          this.loadLevel(this.currentLevel + 1);
        } else {
          this.state = "victory";
        }
      }
    }
  }

  private loseLife() {
    this.lives--;
    sound.loseBall();
    if (this.lives <= 0) {
      this.state = "gameover";
      this.checkHighScore(this.score);
    } else {
      this.resetPaddleAndBall();
      this.state = "ready";
    }
  }

  private shiftBricksDown() {
    const isModern = this.viewMode === "modern";
    const bh = isModern
      ? Math.max(13 * (this.virtualW / 390), BRICK_H * this.brickScale * 1.35)
      : (BRICK_H * this.brickScale);
    for (const br of this.bricks) {
      if (!br.alive) continue;
      br.row += 1;
      br.y += bh;
      if (br.y + br.h >= this.paddle.y) {
        br.alive = false;
      }
    }
  }

  // All 18 original DX-Ball power-up effects (FUN_00407420)
  private applyPowerup(type: number) {
    const def = POWERUP_DEFS[type] || { name: "POWER-UP", color: "#fff" };
    this.floatingTexts.push({
      x: this.paddle.x + this.paddle.w / 2,
      y: this.paddle.y - 18,
      text: def.name,
      color: def.color,
      life: 1.2,
    });

    const isModern = this.viewMode === "modern";
    const dpr = isModern ? (this.virtualW / 390) : 1;
    const speedRatio = isModern ? Math.max(1.7, this.virtualH / 460) : 1.0;

    switch (type) {
      case 0: // Extra Life (+1)
        this.lives++;
        break;
      case 1: // Level Warp
        this.loadLevel(this.currentLevel + 1);
        break;
      case 2: // Zap Bricks (FUN_004084b0: converts unbreakable & multi-hit bricks to 1-hit)
        for (const br of this.bricks) {
          if (br.alive) {
            if (br.type === 2) br.type = 5;
            br.hitsLeft = 1;
          }
        }
        break;
      case 3: // Slow Ball
        for (const b of this.balls) {
          const minSpeed = 3.8 * speedRatio;
          b.speed = Math.max(minSpeed, b.speed * 0.72);
          const currAngle = Math.atan2(b.vx, -b.vy);
          b.vx = b.speed * Math.sin(currAngle);
          b.vy = -b.speed * Math.cos(currAngle);
        }
        break;
      case 4: { // Multiply Exploding (FUN_00408260: spreads explosive type 8 to neighbors of existing type 8)
        const toExplosive: Brick[] = [];
        for (const br of this.bricks) {
          if (br.alive && br.type === 8) {
            for (const nb of this.bricks) {
              if (nb.alive && nb.type !== 8 && Math.abs(nb.col - br.col) <= 1 && Math.abs(nb.row - br.row) <= 1) {
                toExplosive.push(nb);
              }
            }
          }
        }
        for (const nb of toExplosive) {
          nb.type = 8;
          nb.hitsLeft = 1;
        }
        break;
      }
      case 5: // Thru Brick
        for (const b of this.balls) b.isThruBrick = true;
        break;
      case 6: // Set-Off Exploding (FUN_00408540: detonates all explosive bricks)
        for (const br of this.bricks) {
          if (br.alive && br.type === 8) this.triggerExplosiveChain(br);
        }
        break;
      case 7: // FireBall
        for (const b of this.balls) b.isFireball = true;
        break;
      case 8: // Shooting Paddle
        this.paddle.hasLasers = true;
        break;
      case 9: // Grab Paddle
        this.paddle.hasGrab = true;
        break;
      case 10: // Expand Paddle
        this.paddle.w = Math.min(this.virtualW * 0.45, this.paddle.w + 26 * dpr);
        break;
      case 11: // Shrink Paddle
        this.paddle.w = Math.max(36 * dpr, this.paddle.w - 22 * dpr);
        break;
      case 12: { // Split Ball
        const currentBalls = [...this.balls];
        for (const origin of currentBalls) {
          this.balls.push({
            x: origin.x,
            y: origin.y,
            vx: -origin.vx || 2.5,
            vy: origin.vy || -origin.speed,
            radius: origin.radius,
            speed: origin.speed,
            stuckToPaddle: false,
            stuckOffset: 0,
            isFireball: origin.isFireball,
            isThruBrick: origin.isThruBrick,
          });
        }
        break;
      }
      case 13: // Kill Paddle (FUN_00408990: explodes paddle and loses life)
        this.spawnExplosion(this.paddle.x + this.paddle.w / 2, this.paddle.y, 8);
        sound.explosion();
        this.balls = [];
        this.loseLife();
        break;
      case 15: // Fast Ball
        for (const b of this.balls) {
          b.speed = Math.min(11.0 * speedRatio, b.speed * 1.32);
          const currAngle = Math.atan2(b.vx, -b.vy);
          b.vx = b.speed * Math.sin(currAngle);
          b.vy = -b.speed * Math.cos(currAngle);
        }
        break;
      case 16: // Super Shrink
        this.paddle.w = 32 * dpr;
        break;
      case 17: // Falling Bricks
        this.fallingBricksActive = true;
        break;
      case 18: // Shrink Ball
        for (const b of this.balls) {
          b.radius = Math.max(3 * dpr, 3.5 * dpr);
        }
        break;
    }
  }

  private checkBrickCollision(b: Ball) {
    for (const br of this.bricks) {
      if (!br.alive) continue;
      if (
        b.x + b.radius > br.x &&
        b.x - b.radius < br.x + br.w &&
        b.y + b.radius > br.y &&
        b.y - b.radius < br.y + br.h
      ) {
        if (!b.isThruBrick) {
          const prevX = b.x - b.vx;
          if (prevX + b.radius <= br.x || prevX - b.radius >= br.x + br.w) {
            b.vx = -b.vx;
          } else {
            b.vy = -b.vy;
          }
        }
        if (b.isFireball) {
          this.triggerExplosiveChain(br);
        } else {
          this.damageBrick(br, false, true, b.vx, b.vy);
        }
        break;
      }
    }
  }

  private damageBrick(br: Brick, isFireball = false, canDropItem = true, ballVx = 0, ballVy = -2) {
    if (br.type === 2) {
      if (isFireball) {
        br.alive = false;
        this.score += 20;
        this.spawnExplosion(br.x + br.w / 2, br.y + br.h / 2, br.type);
        sound.hitBrick(1);
      } else {
        sound.hitMetal();
      }
      return;
    }

    if (br.type === 8) {
      this.triggerExplosiveChain(br);
      return;
    }

    br.hitsLeft--;
    if (br.hitsLeft <= 0 || isFireball) {
      br.alive = false;
      this.score += 15;
      this.spawnExplosion(br.x + br.w / 2, br.y + br.h / 2, br.type);
      sound.hitBrick(br.type);

      // Faithfully reimplemented from DX-Ball decompilation (FUN_00406ef0):
      // 1. Strict cap of at most 1 active falling capsule on screen (DAT_00431cb8 < 1).
      // 2. Drop probability is 20% (random(10) < 2).
      // 3. Collateral chain explosions never spawn capsules (canDropItem = false).
      if (canDropItem && !isFireball && this.capsules.length < 1 && Math.random() < 0.20) {
        const pType = this.rollPowerupType();
        const speedScale = this.viewMode === "modern" ? Math.max(1.3, this.virtualH / 480) : 1.0;
        this.capsules.push({
          x: br.x + br.w / 2,
          y: br.y + br.h / 2,
          vx: Math.max(-3.5, Math.min(3.5, ballVx * 0.45)),
          vy: Math.min(-1.2, -Math.abs(ballVy) * 0.35) * speedScale,
          gravTick: 0,
          type: pType,
          alive: true,
        });
      }
    } else {
      if (br.type === 3) br.type = 4;
      else if (br.type === 4) br.type = 5;
      sound.hitBrick(br.type);
    }
  }

  // Exact probability distribution from FUN_00406ef0 lines 92-199
  private rollPowerupType(): number {
    const r = Math.floor(Math.random() * 19);
    if (r === 0) {
      return Math.floor(Math.random() * 5) === 1 ? 0 : 13; // 1-in-5 Extra Life, else Kill Paddle
    }
    if (r === 1) {
      return Math.floor(Math.random() * 5) === 1 ? 1 : 13; // 1-in-5 Level Warp, else Kill Paddle
    }
    if (r === 14) return 10; // Expand Paddle gets 2 slots (10 and 14)
    return SPAWNABLE_POWERUP_IDS[r % SPAWNABLE_POWERUP_IDS.length]!;
  }

  private triggerExplosiveChain(origin: Brick) {
    origin.alive = false;
    this.score += 15;
    this.spawnExplosion(origin.x + origin.w / 2, origin.y + origin.h / 2, 8);
    sound.explosion();

    for (const br of this.bricks) {
      if (!br.alive) continue;
      const dCol = Math.abs(br.col - origin.col);
      const dRow = Math.abs(br.row - origin.row);
      if (dCol <= 1 && dRow <= 1 && !(dCol === 0 && dRow === 0)) {
        setTimeout(() => {
          if (br.alive) this.damageBrick(br, true, false);
        }, 50);
      }
    }
  }

  private spawnExplosion(x: number, y: number, brickType: number) {
    const colInfo = BRICK_COLORS[brickType] || { fill: "#fff", highlight: "#aaa" };
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 4.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 1,
        color: Math.random() > 0.5 ? colInfo.fill : colInfo.highlight,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
      });
    }
  }

  private render() {
    this.ctx.fillStyle = "#000000";
    this.ctx.fillRect(0, 0, this.virtualW, this.virtualH);

    if (this.state === "intro") {
      this.renderIntroScreen();
      return;
    }

    if (this.state === "mode_select" || this.state === "menu") {
      this.renderModeSelectScreen();
      return;
    }

    if (this.state === "editor") {
      this.renderEditorScreen();
      return;
    }

    if (this.state === "highscores") {
      this.renderHighScoresScreen();
      return;
    }

    this.renderBorders();

    for (const br of this.bricks) {
      if (!br.alive) continue;
      this.renderBrick(br);
    }

    for (const cap of this.capsules) this.renderCapsule(cap);

    for (const bu of this.bullets) {
      this.ctx.fillStyle = "#ff2200";
      this.ctx.fillRect(bu.x - 2, bu.y - 6, 4, 10);
      this.ctx.fillStyle = "#ffff55";
      this.ctx.fillRect(bu.x - 1, bu.y - 4, 2, 6);
    }

    this.renderPaddle();

    for (const b of this.balls) this.renderBall(b);

    for (const p of this.particles) {
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(p.x - 2, p.y - 2, 3, 3);
    }

    for (const ft of this.floatingTexts) {
      this.ctx.save();
      this.ctx.textAlign = "center";
      this.ctx.fillStyle = ft.color;
      this.ctx.font = "bold 13px system-ui, sans-serif";
      this.ctx.fillText(ft.text, ft.x, ft.y);
      this.ctx.restore();
    }

    this.renderHUD();

    if (this.state === "ready") {
      this.renderCenterBanner("CLICK OR TAP TO LAUNCH BALL", "#00e0ff");
    } else if (this.state === "gameover") {
      this.renderCenterBanner("GAME OVER — CLICK TO CONTINUE", "#ff3344");
    } else if (this.state === "victory") {
      this.renderCenterBanner("ALL 50 BOARDS CLEARED! YOU WIN!", "#44ff88");
    }
  }

  // ============================================================================
  // AUTHENTIC DX-BALL 1.09 START / MAIN MENU SCREEN
  // Reconstructed from Mainmenu.pcx, FUN_0040af80, FUN_0040b2d0 & FUN_0040ba40
  // ============================================================================
  private renderModeSelectScreen() {
    const ctx = this.ctx;
    const W = this.virtualW;
    const H = this.virtualH;
    const isModernPortrait = this.viewMode === "modern" && H > W;
    const sx = W / STAGE_W;
    const sy = H / STAGE_H;

    ctx.save();

    // 1. Top Status Line: "Last Score - <N>" (left) and "V 1.09" (right) (FUN_0040af80 lines 116-119)
    const topY = isModernPortrait ? Math.max(44, H * 0.055) : 14 * sy;
    ctx.font = `bold ${Math.max(11, Math.round(12 * sx))}px 'Courier New', monospace`;
    ctx.fillStyle = "#d8e0f0";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(`Last Score - ${this.lastScore}`, 8 * sx, topY);
    ctx.textAlign = "right";
    ctx.fillText("V 1.09", W - 8 * sx, topY);

    // 2. Top Cyan Box & Side Spotlights (Mainmenu.pcx: x=112..530, y=37..115)
    const boxW = isModernPortrait ? W * 0.86 : 422 * sx;
    const boxH = isModernPortrait ? Math.max(66, H * 0.095) : 80 * sy;
    const boxX = (W - boxW) / 2;
    const boxY = isModernPortrait ? topY + 20 : 35 * sy;

    // Left Spotlight
    const spotR = boxH * 0.68;
    const gradLeftSpot = ctx.createRadialGradient(boxX, boxY + boxH / 2, 2, boxX, boxY + boxH / 2, spotR);
    gradLeftSpot.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    gradLeftSpot.addColorStop(0.45, "rgba(160, 175, 190, 0.55)");
    gradLeftSpot.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradLeftSpot;
    ctx.beginPath();
    ctx.arc(boxX, boxY + boxH / 2, spotR, 0, Math.PI * 2);
    ctx.fill();

    // Right Spotlight
    const gradRightSpot = ctx.createRadialGradient(boxX + boxW, boxY + boxH / 2, 2, boxX + boxW, boxY + boxH / 2, spotR);
    gradRightSpot.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    gradRightSpot.addColorStop(0.45, "rgba(160, 175, 190, 0.55)");
    gradRightSpot.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradRightSpot;
    ctx.beginPath();
    ctx.arc(boxX + boxW, boxY + boxH / 2, spotR, 0, Math.PI * 2);
    ctx.fill();

    // Cyan Frame & Black Interior
    ctx.fillStyle = "#000000";
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = "#00b8b8";
    ctx.lineWidth = Math.max(4, 5 * sx);
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = "#40ffff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX - 1, boxY - 1, boxW + 2, boxH + 2);

    // 3. Inside Cyan Box: The 41x7 Orbiting Ball Dot-Matrix (FUN_0040b2d0 & FUN_0040ba40)
    const cols = 41;
    const rows = 7;
    const cellStepX = (boxW - 16 * sx) / cols;
    const cellStepY = (boxH - 12 * sy) / rows;
    const startX = boxX + 8 * sx + cellStepX / 2;
    const startY = boxY + 6 * sy + cellStepY / 2;
    const ballR = Math.max(2.6, Math.min(cellStepX, cellStepY) * 0.46);
    const orbitRx = cellStepX * 0.38;
    const orbitRy = cellStepY * 0.32;

    // Pass 1: Background orbiting dots (where matrix == 0)
    ctx.fillStyle = "#489898";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = DXBALL_DOT_MATRIX_41X7[r * cols + c];
        if (val === 0) {
          const deg = (this.matrixAngleDeg + c * 20 + r * 35) % 360;
          const rad = (deg * Math.PI) / 180;
          const px = startX + c * cellStepX + Math.cos(rad) * orbitRx;
          const py = startY + r * cellStepY + Math.sin(rad) * orbitRy;
          ctx.fillRect(px, py, 1.5, 1.5);
        }
      }
    }

    // Pass 2: Foreground 3D Silver Balls spelling "DX-BALL" (where matrix == 1)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = DXBALL_DOT_MATRIX_41X7[r * cols + c];
        if (val === 1) {
          const deg = (this.matrixAngleDeg + c * 20 + r * 35 + 30) % 360;
          const rad = (deg * Math.PI) / 180;
          const px = startX + c * cellStepX + Math.cos(rad) * orbitRx;
          const py = startY + r * cellStepY + Math.sin(rad) * orbitRy - 2 * sy;

          const bg = ctx.createRadialGradient(px - ballR * 0.35, py - ballR * 0.35, ballR * 0.1, px, py, ballR);
          bg.addColorStop(0, "#ffffff");
          bg.addColorStop(0.45, "#b8c4d0");
          bg.addColorStop(1, "#303844");
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(px, py, ballR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 4. "By Michael P. Welch" below right of cyan box (FUN_0040af80 line 121: x=0x1e5, y=0x82)
    ctx.font = `bold ${Math.max(10, Math.round(12 * sx))}px 'Courier New', monospace`;
    ctx.fillStyle = "#b8c8e0";
    ctx.textAlign = "right";
    ctx.fillText("By Michael P. Welch", boxX + boxW, boxY + boxH + 8 * sy);

    // 5. Center Credits: 'BASED ON "MEGABALL"' / 'BY ED AND AL MACKEY' (FUN_0040af80 lines 128-130)
    const midY1 = isModernPortrait ? boxY + boxH + 26 : 196 * sy;
    const midY2 = isModernPortrait ? midY1 + 22 : 226 * sy;
    ctx.textAlign = "center";
    ctx.font = `900 ${Math.max(14, Math.round(19 * sx))}px 'Impact', 'Arial Black', monospace`;
    const goldGrad = ctx.createLinearGradient(0, midY1 - 10, 0, midY2 + 15);
    goldGrad.addColorStop(0, "#ffff66");
    goldGrad.addColorStop(0.5, "#ff9900");
    goldGrad.addColorStop(1, "#aa4400");
    ctx.fillStyle = goldGrad;
    const creditCenterX = isModernPortrait ? W / 2 : 230 * sx;
    ctx.fillText('BASED ON  "MEGABALL"', creditCenterX, midY1);
    ctx.fillText("BY ED AND AL MACKEY", creditCenterX, midY2);

    // 6. Interactive Mode / Action Buttons
    const rects = this.getMenuButtonRects();
    this.drawRetroButton(rects.classicBtn, "▶ PLAY CLASSIC (4:3)", this.viewMode === "classic" ? "#00ccff" : "#557799", this.viewMode === "classic");
    this.drawRetroButton(rects.modernBtn, "▶ PLAY MODERN (MOBILE)", this.viewMode === "modern" ? "#00ff88" : "#557799", this.viewMode === "modern");
    this.drawRetroButton(rects.introBtn, "INTRO", "#aa88ff", false);
    this.drawRetroButton(rects.scoresBtn, "SCORES", "#ffaa00", false);
    this.drawRetroButton(rects.editorBtn, "EDITOR", "#00e0ff", false);

    // 7. Bottom-Left 3 Columns x 6 Rows Power-Up Legend (All 18 Power-Ups from Mainmenu.pcx)
    const legendTopY = isModernPortrait ? rects.introBtn.y + rects.introBtn.h + 14 : 264 * sy;
    const legendBottomY = H - (isModernPortrait ? 44 : 28 * sy);
    const availLegendH = legendBottomY - legendTopY;
    const rowStep = availLegendH / 6;
    const tileSize = Math.min(isModernPortrait ? 26 : 31 * sx, rowStep * 0.86);
    const colPositions = isModernPortrait
      ? [W * 0.04, W * 0.36, W * 0.68]
      : [34 * sx, 158 * sx, 280 * sx];

    for (let colIdx = 0; colIdx < 3; colIdx++) {
      const colIds = MENU_POWERUP_COLUMNS[colIdx]!;
      const colX = colPositions[colIdx]!;
      for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
        const pId = colIds[rowIdx]!;
        const def = POWERUP_DEFS[pId]!;
        const ty = legendTopY + rowIdx * rowStep;

        this.renderPowerupTile(colX, ty, tileSize, pId);

        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#e8f0ff";
        const fontSize = Math.max(9, Math.min(12, Math.round(tileSize * 0.38)));
        ctx.font = `bold ${fontSize}px 'Courier New', system-ui, sans-serif`;
        if (def.line2) {
          ctx.fillText(def.line1, colX + tileSize + 6 * sx, ty + 1);
          ctx.fillText(def.line2, colX + tileSize + 6 * sx, ty + fontSize + 2);
        } else {
          ctx.fillText(def.line1, colX + tileSize + 6 * sx, ty + tileSize * 0.28);
        }
      }
    }

    // 8. Bottom-Right Iconic Amiga Red & White Checkered Boing Ball (Mainmenu.pcx: cx=568, cy=388)
    if (!isModernPortrait) {
      this.renderBoingBall(566 * sx, 384 * sy, 66 * Math.min(sx, sy));
    } else {
      // In portrait smartphone mode, draw a compact Boing Ball badge in the header corner
      this.renderBoingBall(W - 36, midY1 + 8, 24);
    }

    // 9. Bottom Copyright Footer (FUN_0040af80 lines 123-125)
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#8899b0";
    const footFont = Math.max(8, Math.round(10 * sx));
    ctx.font = `${footFont}px 'Courier New', monospace`;
    ctx.fillText("Copyright 1996-98 by Michael P. Welch, All Rights Reserved.", 6 * sx, H - footFont - 4);
    ctx.fillText(
      "You may freely distribute this game so long as it's not sold for profit without the author's written consent.",
      6 * sx,
      H - 2
    );

    ctx.restore();
  }

  private drawRetroButton(
    r: { x: number; y: number; w: number; h: number },
    label: string,
    accent: string,
    active: boolean
  ) {
    const ctx = this.ctx;
    ctx.save();
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    if (active) {
      g.addColorStop(0, "#103458");
      g.addColorStop(1, "#06182c");
    } else {
      g.addColorStop(0, "#182230");
      g.addColorStop(1, "#0c121a");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 5);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = active ? "#ffffff" : "#cce0f5";
    ctx.font = `bold ${Math.max(10, Math.round(r.h * 0.44))}px 'Courier New', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
    ctx.restore();
  }

  // ============================================================================
  // AUTHENTIC DX-BALL 1.09 INTRO / CREDITS SPLASH SCREEN (State 4: DXBall1-3.png)
  // Reconstructed from Intro.pcx, FUN_0040a0b0, FUN_0040a510, FUN_0040a850 & FUN_0040a6c0
  // ============================================================================
  private renderIntroScreen() {
    const ctx = this.ctx;
    const W = this.virtualW;
    const H = this.virtualH;
    const sx = W / STAGE_W;
    const sy = H / STAGE_H;

    ctx.save();

    // 1. Oscillating Raster Bars (FUN_0040a850)
    const waveOffset = Math.sin(this.animPhase * 3.2) * 8 * sy;

    // Top Gold/Orange Raster Bar
    const bar1Y = 8 * sy + waveOffset;
    const gBar1 = ctx.createLinearGradient(0, bar1Y, 0, bar1Y + 16 * sy);
    gBar1.addColorStop(0, "#662200");
    gBar1.addColorStop(0.5, "#ffff22");
    gBar1.addColorStop(1, "#882200");
    ctx.fillStyle = gBar1;
    ctx.fillRect(0, bar1Y, W, 16 * sy);

    // 2. Large Outlined "DX·BALL" Logo (Intro.pcx top half)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const logoFont = Math.round(92 * sx);
    ctx.font = `900 ${logoFont}px 'Arial Black', 'Impact', sans-serif`;
    ctx.lineWidth = Math.max(3, 4 * sx);
    ctx.strokeStyle = "#b8d8e8";
    ctx.strokeText("DX·BALL", W / 2, 72 * sy);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText("DX·BALL", W / 2, 72 * sy);

    // Lower Green/Blue Raster Bar
    const bar2Y = 128 * sy - waveOffset;
    const gBar2 = ctx.createLinearGradient(0, bar2Y, 0, bar2Y + 16 * sy);
    gBar2.addColorStop(0, "#00aa00");
    gBar2.addColorStop(0.4, "#44ff44");
    gBar2.addColorStop(0.7, "#0044ff");
    gBar2.addColorStop(1, "#001166");
    ctx.fillStyle = gBar2;
    ctx.fillRect(0, bar2Y, W, 16 * sy);

    // 3. Red Gradient Band: VIDEO CARD: HARDWARE ACCELERATION FOUND AND SUPPORTED
    const redBandY = 165 * sy;
    const gRed = ctx.createLinearGradient(0, redBandY, 0, redBandY + 58 * sy);
    gRed.addColorStop(0, "#220000");
    gRed.addColorStop(0.5, "#880000");
    gRed.addColorStop(1, "#330000");
    ctx.fillStyle = gRed;
    ctx.fillRect(0, redBandY, W, 58 * sy);

    const drawCandyText = (text: string, x: number, y: number, align: CanvasTextAlign = "left") => {
      ctx.save();
      ctx.textAlign = align;
      ctx.font = `900 ${Math.max(12, Math.round(18 * sx))}px 'Courier New', monospace`;
      ctx.fillStyle = "#3a1800";
      ctx.fillText(text, x + 2, y + 2);
      const tg = ctx.createLinearGradient(0, y - 12 * sy, 0, y + 6 * sy);
      tg.addColorStop(0, "#ffcc44");
      tg.addColorStop(0.5, "#cc6600");
      tg.addColorStop(1, "#ffaa22");
      ctx.fillStyle = tg;
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    drawCandyText("VIDEO CARD:  HARDWARE ACCELERATION FOUND", 20 * sx, redBandY + 22 * sy);
    drawCandyText("AND SUPPORTED", 300 * sx, redBandY + 44 * sy, "center");

    // 4. Author & 3D GFX Credits
    drawCandyText("AUTHOR:      MICHAEL P. WELCH", 20 * sx, 245 * sy);
    drawCandyText("3D GFX:      SEUMAS McNALLY", 20 * sx, 268 * sy);
    drawCandyText("E-MAIL:      MWELCH1@STNY.LRUN.COM", 20 * sx, 304 * sy);

    // 5. Blue Gradient Band
    const blueBandY = 330 * sy;
    const gBlue = ctx.createLinearGradient(0, blueBandY, 0, blueBandY + 60 * sy);
    gBlue.addColorStop(0, "#000044");
    gBlue.addColorStop(0.5, "#000099");
    gBlue.addColorStop(1, "#000022");
    ctx.fillStyle = gBlue;
    ctx.fillRect(0, blueBandY, W, 60 * sy);

    drawCandyText("VISIT  HTTP://HOME.STNY.LRUN.COM/SCORCHED/", W / 2, blueBandY + 12 * sy, "center");
    drawCandyText("FOR FREE BOARD EDITOR PLUS HINTS AND TIPS", W / 2, blueBandY + 34 * sy, "center");

    // 6. Sine-Wave Scrolling Purple Beveled 3D Text (FUN_0040a6c0 + Chisel2.sbk)
    const scrollerBaseY = 435 * sy;
    ctx.font = `900 ${Math.max(18, Math.round(28 * sx))}px 'Impact', 'Arial Black', sans-serif`;
    const charStep = 18 * sx;
    const startCharIdx = Math.max(0, Math.floor(-this.scrollerOffset / charStep));
    const endCharIdx = Math.min(this.scrollerText.length, startCharIdx + Math.ceil(W / charStep) + 4);

    for (let i = startCharIdx; i < endCharIdx; i++) {
      const ch = this.scrollerText[i]!;
      if (ch === " ") continue;
      const cx = this.scrollerOffset + i * charStep;
      const cy = scrollerBaseY + Math.sin(cx * 0.015 + this.animPhase * 4) * 18 * sy;

      ctx.fillStyle = "#2a0844";
      ctx.fillText(ch, cx + 2, cy + 2);
      ctx.fillStyle = "#9933ff";
      ctx.fillText(ch, cx, cy);
      ctx.strokeStyle = "#ddaaff";
      ctx.lineWidth = 1;
      ctx.strokeText(ch, cx, cy);
    }

    ctx.restore();
  }

  // ============================================================================
  // PROCEDURAL 32x32 3D BEVELED SQUARE POWER-UP TILES (All 18 Icons from mball2.sbk)
  // ============================================================================
  private renderPowerupTile(x: number, y: number, size: number, type: number) {
    const ctx = this.ctx;
    const def = POWERUP_DEFS[type] || POWERUP_DEFS[0]!;
    const s = size / 32;

    ctx.save();
    ctx.translate(x, y);

    // 1. 3D Beveled Tile Background (Grey, Blue, or Red)
    let fill = "#0018a8";
    let hi = "#4477ff";
    let lo = "#000848";
    if (def.category === "grey") {
      fill = "#888894";
      hi = "#d8d8e4";
      lo = "#383840";
    } else if (def.category === "red") {
      fill = "#a80808";
      hi = "#ff4848";
      lo = "#480000";
    }

    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, size, size);

    // Top & Left Highlight Bevel
    ctx.fillStyle = hi;
    ctx.fillRect(0, 0, size, 3 * s);
    ctx.fillRect(0, 0, 3 * s, size);

    // Bottom & Right Shadow Bevel
    ctx.fillStyle = lo;
    ctx.fillRect(0, size - 3 * s, size, 3 * s);
    ctx.fillRect(size - 3 * s, 0, 3 * s, size);

    // Inner recessed border
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = Math.max(1, s);
    ctx.strokeRect(3 * s, 3 * s, size - 6 * s, size - 6 * s);

    // 2. Specific Pixel-Art Icon Inside Tile
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    switch (type) {
      case 10: // Expand Paddle (<-> outward blue arrows)
        this.drawArrow(ctx, 13 * s, 16 * s, 5 * s, 16 * s, "#2244ff", s);
        this.drawArrow(ctx, 19 * s, 16 * s, 27 * s, 16 * s, "#2244ff", s);
        break;
      case 11: // Shrink Paddle (>-< inward blue arrows)
        this.drawArrow(ctx, 5 * s, 16 * s, 13 * s, 16 * s, "#2244ff", s);
        this.drawArrow(ctx, 27 * s, 16 * s, 19 * s, 16 * s, "#2244ff", s);
        break;
      case 12: // Split Ball (1 ball splitting into 2 with green arrows)
        ctx.strokeStyle = "#22ee44";
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.moveTo(16 * s, 10 * s);
        ctx.lineTo(9 * s, 21 * s);
        ctx.moveTo(16 * s, 10 * s);
        ctx.lineTo(23 * s, 21 * s);
        ctx.stroke();
        this.drawMiniBall(ctx, 16 * s, 9 * s, 3.2 * s);
        this.drawMiniBall(ctx, 9 * s, 22 * s, 3.2 * s);
        this.drawMiniBall(ctx, 23 * s, 22 * s, 3.2 * s);
        break;
      case 0: // Extra Life (+1)
        ctx.fillStyle = "#000";
        ctx.font = `900 ${Math.round(17 * s)}px 'Times New Roman', serif`;
        ctx.fillText("+1", 17 * s, 17 * s);
        ctx.fillStyle = "#e8f0ff";
        ctx.fillText("+1", 16 * s, 16 * s);
        break;
      case 1: // Level Warp (brick strip + portal + ball)
        ctx.fillStyle = "#ff4400";
        ctx.fillRect(6 * s, 8 * s, 20 * s, 5 * s);
        ctx.fillStyle = "#44ff44";
        ctx.fillRect(10 * s, 8 * s, 6 * s, 5 * s);
        ctx.fillStyle = "#ffff00";
        ctx.fillRect(14 * s, 16 * s, 4 * s, 4 * s);
        ctx.fillStyle = "#aaaaaa";
        ctx.fillRect(14 * s, 23 * s, 6 * s, 2 * s);
        break;
      case 2: // Zap Bricks (cyan brick + yellow lightning bolt)
        ctx.fillStyle = "#00cccc";
        ctx.fillRect(8 * s, 12 * s, 14 * s, 7 * s);
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 2.2 * s;
        ctx.beginPath();
        ctx.moveTo(8 * s, 7 * s);
        ctx.lineTo(16 * s, 15 * s);
        ctx.lineTo(13 * s, 17 * s);
        ctx.lineTo(24 * s, 25 * s);
        ctx.stroke();
        break;
      case 3: // Slow Ball (ball + blue motion rings)
        ctx.strokeStyle = "#3399ff";
        ctx.lineWidth = 1.5 * s;
        for (let k = 1; k <= 3; k++) {
          ctx.beginPath();
          ctx.arc((20 - k * 3) * s, (21 - k * 3) * s, 3 * s, Math.PI * 0.8, Math.PI * 1.7);
          ctx.stroke();
        }
        this.drawMiniBall(ctx, 20 * s, 21 * s, 3.5 * s);
        break;
      case 4: // Multiply Exploding (orange/white + cross)
        ctx.fillStyle = "#ff6600";
        ctx.fillRect(13 * s, 6 * s, 6 * s, 20 * s);
        ctx.fillRect(6 * s, 13 * s, 20 * s, 6 * s);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(14.5 * s, 8 * s, 3 * s, 16 * s);
        ctx.fillRect(8 * s, 14.5 * s, 16 * s, 3 * s);
        break;
      case 5: // Thru Brick (orange brick + diagonal ball piercing through)
        ctx.fillStyle = "#cc5500";
        ctx.fillRect(10 * s, 10 * s, 13 * s, 10 * s);
        ctx.strokeStyle = "#cccccc";
        ctx.lineWidth = 2.2 * s;
        ctx.beginPath();
        ctx.moveTo(7 * s, 24 * s);
        ctx.lineTo(24 * s, 8 * s);
        ctx.stroke();
        this.drawMiniBall(ctx, 8 * s, 23 * s, 3 * s);
        break;
      case 6: // Set-Off Exploding (red dynamite stick + yellow spark)
        ctx.fillStyle = "#dd0000";
        ctx.fillRect(12 * s, 13 * s, 8 * s, 13 * s);
        ctx.strokeStyle = "#000";
        ctx.strokeRect(12 * s, 13 * s, 8 * s, 13 * s);
        ctx.strokeStyle = "#ccaa66";
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(16 * s, 13 * s);
        ctx.quadraticCurveTo(15 * s, 8 * s, 11 * s, 8 * s);
        ctx.stroke();
        ctx.fillStyle = "#ffff00";
        ctx.beginPath();
        ctx.arc(10 * s, 8 * s, 2.8 * s, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 7: // FireBall (fiery orange/white comet)
        ctx.fillStyle = "#ff6600";
        ctx.beginPath();
        ctx.moveTo(25 * s, 6 * s);
        ctx.lineTo(8 * s, 19 * s);
        ctx.lineTo(13 * s, 24 * s);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffff88";
        ctx.beginPath();
        ctx.moveTo(23 * s, 8 * s);
        ctx.lineTo(10 * s, 19 * s);
        ctx.lineTo(13 * s, 22 * s);
        ctx.closePath();
        ctx.fill();
        this.drawMiniBall(ctx, 10 * s, 21 * s, 3.8 * s);
        break;
      case 8: // Shooting Paddle (paddle + twin red lasers)
        ctx.fillStyle = "#ff2222";
        ctx.fillRect(12 * s, 7 * s, 2.5 * s, 6 * s);
        ctx.fillRect(17.5 * s, 7 * s, 2.5 * s, 6 * s);
        ctx.fillStyle = "#aaaaaa";
        ctx.fillRect(11 * s, 13 * s, 3.5 * s, 8 * s);
        ctx.fillRect(17.5 * s, 13 * s, 3.5 * s, 8 * s);
        ctx.fillStyle = "#8899aa";
        ctx.fillRect(7 * s, 21 * s, 18 * s, 4 * s);
        break;
      case 9: // Grab Paddle (paddle catching ball with green beam)
        ctx.fillStyle = "#22cc44";
        ctx.fillRect(10 * s, 17 * s, 12 * s, 4 * s);
        ctx.fillStyle = "#8899aa";
        ctx.fillRect(7 * s, 21 * s, 18 * s, 4 * s);
        this.drawMiniBall(ctx, 16 * s, 15 * s, 3 * s);
        break;
      case 13: // Kill Paddle (white skull & crossbones)
        ctx.fillStyle = "#e8e8e8";
        ctx.beginPath();
        ctx.arc(16 * s, 12 * s, 5.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(13 * s, 15 * s, 6 * s, 4 * s);
        ctx.fillStyle = "#000";
        ctx.fillRect(13.5 * s, 11 * s, 2 * s, 2 * s);
        ctx.fillRect(16.5 * s, 11 * s, 2 * s, 2 * s);
        ctx.strokeStyle = "#e8e8e8";
        ctx.lineWidth = 2.2 * s;
        ctx.beginPath();
        ctx.moveTo(8 * s, 21 * s);
        ctx.lineTo(24 * s, 26 * s);
        ctx.moveTo(24 * s, 21 * s);
        ctx.lineTo(8 * s, 26 * s);
        ctx.stroke();
        break;
      case 18: // Shrink Ball (tiny ball dot in center)
        this.drawMiniBall(ctx, 16 * s, 16 * s, 2.6 * s);
        break;
      case 15: // Fast Ball (triple yellow chevrons >>>)
        ctx.strokeStyle = "#ffee00";
        ctx.lineWidth = 2.4 * s;
        for (let k = 0; k < 3; k++) {
          const ox = (8 + k * 6) * s;
          ctx.beginPath();
          ctx.moveTo(ox, 9 * s);
          ctx.lineTo(ox + 5 * s, 16 * s);
          ctx.lineTo(ox, 23 * s);
          ctx.stroke();
        }
        break;
      case 16: // Super Shrink (tiny black paddle bar)
        ctx.fillStyle = "#333333";
        ctx.fillRect(9 * s, 14 * s, 14 * s, 4 * s);
        ctx.strokeStyle = "#000000";
        ctx.strokeRect(9 * s, 14 * s, 14 * s, 4 * s);
        break;
      case 17: // Falling Bricks (purple brick + yellow down arrow)
        ctx.fillStyle = "#7711aa";
        ctx.fillRect(8 * s, 7 * s, 16 * s, 8 * s);
        ctx.strokeStyle = "#000";
        ctx.strokeRect(8 * s, 7 * s, 16 * s, 8 * s);
        this.drawArrow(ctx, 16 * s, 16 * s, 16 * s, 26 * s, "#ffee00", s);
        break;
    }

    ctx.restore();
  }

  private drawMiniBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.5, "#aaaaaa");
    g.addColorStop(1, "#222222");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawArrow(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    s: number
  ) {
    const headLen = 5 * s;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ============================================================================
  // ICONIC AMIGA RED & WHITE CHECKERED BOING BALL (Mainmenu.pcx bottom-right)
  // ============================================================================
  private renderBoingBall(cx: number, cy: number, radius: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.26); // Iconic ~15 degree right tilt

    const latBands = 8;
    const lonBands = 8;
    const phaseShift = (this.animPhase * 1.2) % 2;

    for (let i = 0; i < latBands; i++) {
      const lat0 = -Math.PI / 2 + (i * Math.PI) / latBands;
      const lat1 = -Math.PI / 2 + ((i + 1) * Math.PI) / latBands;
      const y0 = Math.sin(lat0) * radius;
      const y1 = Math.sin(lat1) * radius;
      const r0 = Math.cos(lat0) * radius;
      const r1 = Math.cos(lat1) * radius;

      for (let j = 0; j < lonBands; j++) {
        const lon0 = -Math.PI / 2 + ((j + (phaseShift % 1)) * Math.PI) / lonBands;
        const lon1 = -Math.PI / 2 + ((j + 1 + (phaseShift % 1)) * Math.PI) / lonBands;
        const cLon0 = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lon0));
        const cLon1 = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lon1));
        if (cLon1 <= cLon0) continue;

        const x00 = Math.sin(cLon0) * r0;
        const x01 = Math.sin(cLon1) * r0;
        const x11 = Math.sin(cLon1) * r1;
        const x10 = Math.sin(cLon0) * r1;

        const isRed = (i + j + Math.floor(phaseShift)) % 2 === 0;
        ctx.fillStyle = isRed ? "#ee0000" : "#ffffff";
        ctx.beginPath();
        ctx.moveTo(x00, y0);
        ctx.lineTo(x01, y0);
        ctx.lineTo(x11, y1);
        ctx.lineTo(x10, y1);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private renderEditorScreen() {
    this.renderBorders();

    const topBarY = Math.max(6, this.playTop - 34);
    const topBarH = 30;

    this.ctx.save();
    this.ctx.fillStyle = "rgba(20, 30, 45, 0.9)";
    this.ctx.beginPath();
    this.ctx.roundRect(this.playLeft + 4, topBarY, 70, topBarH, 6);
    this.ctx.fill();
    this.ctx.strokeStyle = "#557799";
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
    this.ctx.font = "bold 12px system-ui, sans-serif";
    this.ctx.fillStyle = "#ccddee";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("✕ Back", this.playLeft + 39, topBarY + topBarH / 2);

    const clearBtnX = this.playRight - 190;
    this.ctx.fillStyle = "rgba(40, 20, 25, 0.9)";
    this.ctx.beginPath();
    this.ctx.roundRect(clearBtnX, topBarY, 60, topBarH, 6);
    this.ctx.fill();
    this.ctx.strokeStyle = "#ff4466";
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
    this.ctx.fillStyle = "#ff6688";
    this.ctx.fillText("🗑 Clear", clearBtnX + 30, topBarY + topBarH / 2);

    const playBtnX = this.playRight - 120;
    const playBtnW = 116;
    const gPlay = this.ctx.createLinearGradient(0, topBarY, 0, topBarY + topBarH);
    gPlay.addColorStop(0, "#00aa55");
    gPlay.addColorStop(1, "#005522");
    this.ctx.fillStyle = gPlay;
    this.ctx.beginPath();
    this.ctx.roundRect(playBtnX, topBarY, playBtnW, topBarH, 6);
    this.ctx.fill();
    this.ctx.strokeStyle = "#00ff88";
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "bold 13px system-ui, sans-serif";
    this.ctx.fillText("▶ PLAY LEVEL", playBtnX + playBtnW / 2, topBarY + topBarH / 2);
    this.ctx.restore();

    const bw = BRICK_W * this.brickScale;
    const bh = BRICK_H * this.brickScale;

    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const type = this.editorGrid[r * BOARD_COLS + c]!;
        const bx = this.brickOffsetX + c * bw;
        const by = this.brickOffsetY + r * bh;
        if (type > 0) {
          this.renderBrick({
            col: c,
            row: r,
            type,
            hitsLeft: 1,
            alive: true,
            x: bx,
            y: by,
            w: bw,
            h: bh,
          });
        }
        this.ctx.strokeStyle = "#1b2432";
        this.ctx.strokeRect(bx, by, bw, bh);
      }
    }

    const toolY = this.virtualH - 52;
    const toolH = 44;
    this.ctx.fillStyle = "#0e141f";
    this.ctx.fillRect(this.playLeft, toolY, this.playRight - this.playLeft, toolH);
    this.ctx.strokeStyle = "#0088cc";
    this.ctx.strokeRect(this.playLeft, toolY, this.playRight - this.playLeft, toolH);

    const eraserX = this.playLeft + 6;
    this.ctx.fillStyle = this.editorBrush === 0 ? "#442222" : "#1a1a24";
    this.ctx.beginPath();
    this.ctx.roundRect(eraserX, toolY + 8, 38, 28, 4);
    this.ctx.fill();
    this.ctx.strokeStyle = this.editorBrush === 0 ? "#ff4444" : "#445566";
    this.ctx.lineWidth = this.editorBrush === 0 ? 2 : 1;
    this.ctx.stroke();
    this.ctx.fillStyle = "#ff6666";
    this.ctx.font = "bold 10px system-ui, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("ERASE", eraserX + 19, toolY + 22);

    const swatchStart = eraserX + 44;
    const swatchW = 20;
    const swatchH = 26;
    const swatchGap = 4;

    for (let i = 1; i <= 22; i++) {
      const px = swatchStart + (i - 1) * (swatchW + swatchGap);
      if (px + swatchW > this.playRight - 6) break;
      const info = BRICK_COLORS[i] || { fill: "#aaa" };
      this.ctx.fillStyle = info.fill;
      this.ctx.fillRect(px, toolY + 9, swatchW, swatchH);
      if (this.editorBrush === i) {
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(px - 1, toolY + 8, swatchW + 2, swatchH + 2);
      } else {
        this.ctx.strokeStyle = "#223344";
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(px, toolY + 9, swatchW, swatchH);
      }
    }
  }

  private renderHighScoresScreen() {
    const ctx = this.ctx;
    const sx = this.virtualW / STAGE_W;
    const sy = this.virtualH / STAGE_H;

    ctx.save();
    // Purple banner box at top (matching Highscor.pcx)
    const bannerW = 320 * sx;
    const bannerH = 95 * sy;
    const bannerX = (this.virtualW - bannerW) / 2;
    const bannerY = 12 * sy;
    const pg = ctx.createRadialGradient(
      this.virtualW / 2,
      bannerY + bannerH / 2,
      10,
      this.virtualW / 2,
      bannerY + bannerH / 2,
      bannerW * 0.6
    );
    pg.addColorStop(0, "#7722cc");
    pg.addColorStop(1, "#330866");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 8);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(52 * sx)}px 'Times New Roman', serif`;
    ctx.fillStyle = "#000000";
    ctx.fillText("High Score", this.virtualW / 2 + 2, bannerY + bannerH / 2 + 2);
    ctx.fillStyle = "#00ee00";
    ctx.fillText("High Score", this.virtualW / 2, bannerY + bannerH / 2);

    ctx.font = `bold ${Math.max(12, Math.round(16 * sx))}px 'Courier New', monospace`;
    this.highScores.forEach((entry, idx) => {
      const y = 135 * sy + idx * 22 * sy;
      ctx.fillStyle = idx === 0 ? "#ffd700" : idx === 1 ? "#e0e0e0" : idx === 2 ? "#cd7f32" : "#b8c8e8";
      ctx.fillText(
        `${(idx + 1).toString().padStart(2, " ")}.  ${entry.name.padEnd(10, ".")}  ${entry.score.toString().padStart(7, " ")}`,
        this.virtualW / 2,
        y
      );
    });

    ctx.font = "13px 'Courier New', monospace";
    ctx.fillStyle = "#8899aa";
    ctx.fillText("[ Click or Tap Anywhere to Return ]", this.virtualW / 2, this.virtualH - 22);
    ctx.restore();
  }

  private renderCapsule(cap: Capsule) {
    const dpr = this.viewMode === "modern" ? (this.virtualW / 390) : 1;
    const size = 32 * dpr;
    this.renderPowerupTile(cap.x - size / 2, cap.y - size / 2, size, cap.type);
  }

  // Authentic DX-Ball side borders (Mbbkgrnd.pcx: vertical silver/blue-grey cylinders on left & right)
  private renderBorders() {
    const gradL = this.ctx.createLinearGradient(0, 0, this.playLeft, 0);
    gradL.addColorStop(0, "#d8d8ec");
    gradL.addColorStop(0.55, "#8888a4");
    gradL.addColorStop(1, "#303040");
    this.ctx.fillStyle = gradL;
    this.ctx.fillRect(0, 0, this.playLeft, this.virtualH);

    const gradR = this.ctx.createLinearGradient(this.playRight, 0, this.virtualW, 0);
    gradR.addColorStop(0, "#303040");
    gradR.addColorStop(0.45, "#8888a4");
    gradR.addColorStop(1, "#d8d8ec");
    this.ctx.fillStyle = gradR;
    this.ctx.fillRect(this.playRight, 0, this.virtualW - this.playRight, this.virtualH);
  }

  // Authentic DX-Ball 3D beveled & recessed brick rendering (matching DXBall2-3.png)
  private renderBrick(br: Brick) {
    const info = BRICK_COLORS[br.type] || { fill: "#aaa", border: "#555", highlight: "#fff", hits: 1 };
    const ctx = this.ctx;

    ctx.fillStyle = info.fill;
    ctx.fillRect(br.x, br.y, br.w, br.h);

    // Outer 3D bevel highlight (top & left)
    ctx.fillStyle = info.highlight;
    ctx.fillRect(br.x, br.y, br.w, 2);
    ctx.fillRect(br.x, br.y, 2, br.h);

    // Outer 3D bevel shadow (bottom & right)
    ctx.fillStyle = info.border;
    ctx.fillRect(br.x, br.y + br.h - 2, br.w, 2);
    ctx.fillRect(br.x + br.w - 2, br.y, 2, br.h);

    if (info.isExplosive) {
      // Animated glowing yellow-orange diamond core inside explosive brick (mball2_sheet.png row 2)
      const pulse = 0.5 + 0.5 * Math.sin(this.animPhase * 8);
      ctx.fillStyle = pulse > 0.5 ? "#ffff44" : "#ffbb00";
      ctx.beginPath();
      ctx.moveTo(br.x + br.w / 2, br.y + 2);
      ctx.lineTo(br.x + br.w - 4, br.y + br.h / 2);
      ctx.lineTo(br.x + br.w / 2, br.y + br.h - 2);
      ctx.lineTo(br.x + 4, br.y + br.h / 2);
      ctx.closePath();
      ctx.fill();
    } else if (info.inner) {
      // Recessed inner rectangle characteristic of DX-Ball bricks
      const ix = br.x + Math.max(4, br.w * 0.18);
      const iy = br.y + Math.max(3, br.h * 0.24);
      const iw = br.w - Math.max(8, br.w * 0.36);
      const ih = br.h - Math.max(6, br.h * 0.48);
      ctx.fillStyle = info.inner;
      ctx.fillRect(ix, iy, iw, ih);
      ctx.strokeStyle = info.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(ix, iy, iw, ih);
    }
  }

  // Authentic DX-Ball metallic ribbed paddle with cyan glowing end-caps (DXBall2-3.png)
  private renderPaddle() {
    const p = this.paddle;
    const ctx = this.ctx;
    ctx.save();

    // Ribbed metallic cylinder body
    const grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    grad.addColorStop(0, "#b0b4bc");
    grad.addColorStop(0.25, "#60646c");
    grad.addColorStop(0.5, "#d8dce4");
    grad.addColorStop(0.75, "#484c54");
    grad.addColorStop(1, "#90949c");

    ctx.fillStyle = grad;
    ctx.fillRect(p.x + 5, p.y, p.w - 10, p.h);

    // Cyan rounded glowing end-caps
    const capColor = p.hasGrab ? "#44ff88" : "#00d8ff";
    ctx.fillStyle = capColor;
    ctx.beginPath();
    ctx.arc(p.x + 6, p.y + p.h / 2, p.h / 2, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x + p.w - 6, p.y + p.h / 2, p.h / 2, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.fill();

    if (p.hasLasers) {
      ctx.fillStyle = "#aaaaaa";
      ctx.fillRect(p.x + 5, p.y - 6, 4, 6);
      ctx.fillRect(p.x + p.w - 9, p.y - 6, 4, 6);
      ctx.fillStyle = "#ff2222";
      ctx.fillRect(p.x + 6, p.y - 8, 2, 3);
      ctx.fillRect(p.x + p.w - 8, p.y - 8, 2, 3);
    }

    ctx.restore();
  }

  private renderBall(b: Ball) {
    if (b.isFireball) {
      this.particles.push({
        x: b.x + (Math.random() - 0.5) * 6,
        y: b.y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        color: Math.random() > 0.5 ? "#ff3300" : "#ffcc00",
        life: 0.2,
        maxLife: 0.2,
      });
    }

    const grad = this.ctx.createRadialGradient(
      b.x - b.radius * 0.3,
      b.y - b.radius * 0.3,
      b.radius * 0.1,
      b.x,
      b.y,
      b.radius
    );
    if (b.isFireball) {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, "#ffaa00");
      grad.addColorStop(1, "#cc2200");
    } else if (b.isThruBrick) {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, "#4488ff");
      grad.addColorStop(1, "#002288");
    } else {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, "#cccccc");
      grad.addColorStop(1, "#333333");
    }

    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  // Authentic DX-Ball Top HUD (DXBall2-3.png: Large score top-left, mini paddle life icons top-right)
  private renderHUD() {
    const ctx = this.ctx;
    ctx.save();
    const isModern = this.viewMode === "modern";
    const hudY = isModern ? this.playTop - 16 : 16;

    // Top-left metallic/yellow score display
    ctx.font = "900 22px 'Impact', 'Arial Black', monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const sg = ctx.createLinearGradient(0, hudY - 10, 0, hudY + 10);
    sg.addColorStop(0, "#ffff22");
    sg.addColorStop(0.5, "#88bbff");
    sg.addColorStop(1, "#3366cc");
    ctx.fillStyle = sg;
    ctx.fillText(`${this.score}`, this.playLeft + 8, hudY);

    // Top-right mini paddle life indicators (matching DXBall2-3.png top-right)
    const iconW = 24;
    const iconH = 5;
    for (let i = 0; i < Math.max(0, this.lives - 1); i++) {
      const lx = this.playRight - 10 - (i + 1) * (iconW + 6);
      const ly = hudY - iconH / 2;
      ctx.fillStyle = "#9098a8";
      ctx.fillRect(lx + 2, ly, iconW - 4, iconH);
      ctx.fillStyle = "#00d8ff";
      ctx.fillRect(lx, ly, 2, iconH);
      ctx.fillRect(lx + iconW - 2, ly, 2, iconH);
    }

    ctx.restore();
  }

  private renderCenterBanner(text: string, color: string) {
    this.ctx.save();
    this.ctx.font = `bold ${Math.round(this.virtualW * 0.038)}px 'Courier New', system-ui, sans-serif`;
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
    this.ctx.fillRect(this.playLeft, this.virtualH * 0.5 - 24, this.playRight - this.playLeft, 48);
    this.ctx.fillStyle = color;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, this.virtualW / 2, this.virtualH * 0.5);
    this.ctx.restore();
  }
}
