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
  PLAYFIELD_LEFT,
  PLAYFIELD_RIGHT,
  PLAYFIELD_TOP,
  POWERUP_NAMES,
  STAGE_H,
  STAGE_W,
} from "./constants.ts";
import { sound } from "./sound.ts";

export interface HighScoreEntry {
  name: string;
  score: number;
}

export type ViewMode = "classic" | "modern";

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
  public lives = 3;
  public currentLevel = 0;

  public state: "mode_select" | "menu" | "playing" | "editor" | "highscores" | "ready" | "gameover" | "victory" = "mode_select";

  private running = false;
  private lastTime = 0;

  // Level Editor
  public editorBrush = 1;
  public editorGrid: number[] = new Array(BOARD_COLS * BOARD_ROWS).fill(0);

  // High Scores
  public highScores: HighScoreEntry[] = [];

  // Scroller
  private scrollerOffset = STAGE_W;
  private scrollerText = "BRICKWORK -- 1996 RETRO REVERSE-ENGINEERED EDITION -- ALL 50 BOARDS, 13 POWER-UPS, FULL SCREEN MODERN MOBILE MODE. TAP OR PRESS SPACE TO PLAY!  ";

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
    if (this.state !== "mode_select") {
      this.loadLevel(this.currentLevel);
    }
  }

  public startWithMode(mode: ViewMode) {
    this.viewMode = mode;
    this.resizeLayout();
    if (this.onModeChange) this.onModeChange(mode);
    this.score = 0;
    this.lives = 3;
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
      // Modern Portrait Layout: Fits full height & width of current screen container!
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

      // Fit the 20 columns of bricks smoothly into available width
      const availW = this.playRight - this.playLeft;
      this.brickScale = availW / (BOARD_COLS * BRICK_W);
      this.brickOffsetX = this.playLeft;
      this.brickOffsetY = this.playTop + 30 * dpr;

      // Move paddle down toward thumb reach
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
          { name: "ACE", score: 12000 },
          { name: "RETRO", score: 9500 },
          { name: "AMIGA", score: 7200 },
          { name: "MEGABALL", score: 5000 },
          { name: "NOOB", score: 2000 },
        ];
      }
    } catch {
      this.highScores = [];
    }
  }

  private saveHighScores() {
    try {
      localStorage.setItem("brickwork_highscores", JSON.stringify(this.highScores));
    } catch {
      // ignore
    }
  }

  private checkHighScore(finalScore: number) {
    if (finalScore > 0) {
      const lowest = this.highScores[this.highScores.length - 1]?.score || 0;
      if (this.highScores.length < 10 || finalScore > lowest) {
        const name = prompt(`New High Score of ${finalScore}! Enter your name:`, "YOU") || "YOU";
        this.highScores.push({ name: name.slice(0, 8).toUpperCase(), score: finalScore });
        this.highScores.sort((a, b) => b.score - a.score);
        if (this.highScores.length > 10) this.highScores.length = 10;
        this.saveHighScores();
        this.state = "highscores";
      }
    }
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
    this.resetPaddleAndBall();
    this.state = "ready";
  }

  private resetPaddleAndBall() {
    const isModern = this.viewMode === "modern";
    const dpr = isModern ? (this.virtualW / 390) : 1;
    this.paddle.w = (isModern ? 88 : 80) * dpr;
    this.paddle.h = (isModern ? 18 : 14) * dpr;
    this.paddle.y = this.virtualH - (isModern ? 75 * dpr : 40);
    this.paddle.x = this.virtualW / 2 - this.paddle.w / 2;
    this.paddle.targetX = this.paddle.x;
    this.paddle.hasLasers = false;
    this.paddle.hasGrab = false;

    // Calibrate ball speed dynamically:
    // In Classic 4:3 (height 480), base speed is 5.5.
    // In Modern portrait (height 800-950+), the vertical distance to bricks is ~2x greater!
    // Scaling speed proportionally ensures the ball travels between paddle and bricks
    // with the exact same energetic tempo and reaction time as the 1996 classic.
    const speedRatio = isModern ? Math.max(1.7, this.virtualH / 460) : 1.0;
    const baseSpeed = 5.5 * speedRatio;

    this.balls = [
      {
        x: this.paddle.x + this.paddle.w / 2,
        y: this.paddle.y - 10 * dpr,
        vx: 0,
        vy: 0,
        radius: (isModern ? 7 : 6) * dpr,
        speed: baseSpeed,
        stuckToPaddle: true,
        stuckOffset: this.paddle.w / 2,
        isFireball: false,
        isThruBrick: false,
      },
    ];
  }

  public launchBall() {
    if (this.state === "mode_select") {
      this.startWithMode(this.viewMode);
      return;
    }

    if (this.state === "menu" || this.state === "highscores") {
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
      this.checkHighScore(this.score);
      this.state = "mode_select";
    }
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

    const handlePointerAction = (pos: { x: number; y: number }) => {
      if (this.state === "mode_select") {
        const btnW = Math.min(this.virtualW * 0.85, 420);
        const btnX = (this.virtualW - btnW) / 2;
        const btnH = Math.min(68, Math.max(52, this.virtualH * 0.11));
        const btn1Y = this.virtualH * 0.33;
        const btn2Y = btn1Y + btnH + 16;
        const subBtnW = (btnW - 12) / 2;
        const subBtnH = Math.min(42, Math.max(34, this.virtualH * 0.07));
        const subBtnY = btn2Y + btnH + 16;

        // Button 1: Modern Mode
        if (pos.x >= btnX && pos.x <= btnX + btnW && pos.y >= btn1Y && pos.y <= btn1Y + btnH) {
          this.startWithMode("modern");
          return;
        }

        // Button 2: Classic Mode
        if (pos.x >= btnX && pos.x <= btnX + btnW && pos.y >= btn2Y && pos.y <= btn2Y + btnH) {
          this.startWithMode("classic");
          return;
        }

        // Button 3: Level Editor
        if (pos.x >= btnX && pos.x <= btnX + subBtnW && pos.y >= subBtnY && pos.y <= subBtnY + subBtnH) {
          this.state = "editor";
          this.editorGrid = new Array(BOARD_COLS * BOARD_ROWS).fill(0);
          return;
        }

        // Button 4: High Scores
        if (pos.x >= btnX + subBtnW + 12 && pos.x <= btnX + btnW && pos.y >= subBtnY && pos.y <= subBtnY + subBtnH) {
          this.state = "highscores";
          return;
        }

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
      // If user hasn't painted bricks yet, populate a neat formation
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

    // Check top action bar buttons
    if (y >= topBarY && y <= topBarY + topBarH) {
      // Back button
      if (x >= this.playLeft + 4 && x <= this.playLeft + 74) {
        this.state = "mode_select";
        return;
      }
      // Clear button
      const clearBtnX = this.playRight - 190;
      if (x >= clearBtnX && x <= clearBtnX + 60) {
        this.editorGrid.fill(0);
        return;
      }
      // PLAY LEVEL button
      const playBtnX = this.playRight - 120;
      if (x >= playBtnX && x <= this.playRight) {
        this.playEditedLevel();
        return;
      }
    }

    // Check bottom palette
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

    // Paint into grid
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
    if (this.state === "mode_select" || this.state === "menu") {
      this.scrollerOffset -= 130 * dt;
      if (this.scrollerOffset < -2500) this.scrollerOffset = this.virtualW;
      return;
    }

    if (this.state === "editor" || this.state === "highscores") return;

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
          this.bullets.splice(i, 1);
          this.damageBrick(br);
          break;
        }
      }
    }

    // Falling Capsules
    for (let i = this.capsules.length - 1; i >= 0; i--) {
      const cap = this.capsules[i]!;
      cap.y += cap.vy;

      if (
        cap.y + 10 >= this.paddle.y &&
        cap.y - 10 <= this.paddle.y + this.paddle.h &&
        cap.x >= this.paddle.x - 12 &&
        cap.x <= this.paddle.x + this.paddle.w + 12
      ) {
        this.applyPowerup(cap.type);
        this.score += 100;
        this.capsules.splice(i, 1);
        sound.powerup();
        continue;
      }

      if (cap.y > this.virtualH) this.capsules.splice(i, 1);
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

      if (b.y - b.radius < this.playTop) {
        b.y = this.playTop + b.radius;
        b.vy = Math.abs(b.vy);
        sound.hitWall();
      }

      // Paddle collision
      if (
        b.vy > 0 &&
        b.y + b.radius >= this.paddle.y &&
        b.y - b.radius <= this.paddle.y + this.paddle.h &&
        b.x >= this.paddle.x - b.radius &&
        b.x <= this.paddle.x + this.paddle.w + b.radius
      ) {
        b.y = this.paddle.y - b.radius;
        if (this.paddle.hasGrab) {
          b.stuckToPaddle = true;
          b.stuckOffset = b.x - this.paddle.x;
          sound.hitPaddle(0);
        } else {
          const hitOffset = (b.x - (this.paddle.x + this.paddle.w / 2)) / (this.paddle.w / 2);
          const maxAngle = (72 * Math.PI) / 180;
          const angle = hitOffset * maxAngle;
          b.vx = b.speed * Math.sin(angle);
          b.vy = -b.speed * Math.cos(angle);
          sound.hitPaddle(Math.abs(hitOffset));
        }
      }

      this.checkBrickCollision(b);

      // Death
      if (b.y - b.radius > this.virtualH) {
        this.balls.splice(i, 1);
        if (this.balls.length === 0) {
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
      }
    }

    // Level complete check
    const breakables = this.bricks.filter((br) => br.alive && br.type !== 2);
    if (breakables.length === 0 && (this.state === "playing" || this.state === "ready")) {
      sound.levelClear();
      const levels = this.customLevels || ALL_50_BOARDS;
      if (this.currentLevel + 1 < levels.length) {
        this.loadLevel(this.currentLevel + 1);
      } else {
        this.state = "victory";
        this.checkHighScore(this.score);
      }
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Floating text
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i]!;
      ft.y -= 25 * dt;
      ft.life -= dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  private applyPowerup(type: number) {
    const info = POWERUP_NAMES[type] || { name: "POWER-UP", color: "#fff" };
    this.floatingTexts.push({
      x: this.paddle.x,
      y: this.paddle.y - 12,
      text: info.name,
      color: info.color,
      life: 1.2,
    });

    switch (type) {
      case 0: this.lives++; break;
      case 1: this.loadLevel(this.currentLevel + 1); break;
      case 2:
        for (const br of this.bricks) {
          if (br.alive && br.type !== 2 && br.row >= 10) {
            br.alive = false;
            this.spawnExplosion(br.x + br.w / 2, br.y + br.h / 2, br.type);
          }
        }
        break;
      case 3:
        for (const b of this.balls) {
          b.speed = Math.max(3.8, b.speed * 0.75);
          const currAngle = Math.atan2(b.vx, -b.vy);
          b.vx = b.speed * Math.sin(currAngle);
          b.vy = -b.speed * Math.cos(currAngle);
        }
        break;
      case 4:
        if (this.balls.length > 0) {
          const origin = this.balls[0]!;
          for (let ang = -0.5; ang <= 0.5; ang += 1.0) {
            this.balls.push({
              x: origin.x,
              y: origin.y,
              vx: origin.vx + ang * 3,
              vy: origin.vy,
              radius: origin.radius,
              speed: origin.speed,
              stuckToPaddle: false,
              stuckOffset: 0,
              isFireball: origin.isFireball,
              isThruBrick: origin.isThruBrick,
            });
          }
        }
        break;
      case 5: this.paddle.hasGrab = true; break;
      case 6: this.paddle.hasLasers = true; break;
      case 7: for (const b of this.balls) b.isThruBrick = true; break;
      case 8:
        for (const br of this.bricks) {
          if (br.alive && br.type === 8) this.triggerExplosiveChain(br);
        }
        break;
      case 9: for (const b of this.balls) b.isFireball = true; break;
      case 10: this.paddle.w = Math.min(this.virtualW * 0.45, this.paddle.w + 24); break;
      case 11: this.paddle.w = Math.max(this.virtualW * 0.12, this.paddle.w - 18); break;
      case 12:
        for (const b of this.balls) {
          b.speed = b.speed * 1.3;
          const currAngle = Math.atan2(b.vx, -b.vy);
          b.vx = b.speed * Math.sin(currAngle);
          b.vy = -b.speed * Math.cos(currAngle);
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
        this.damageBrick(br, b.isFireball);
        break;
      }
    }
  }

  private damageBrick(br: Brick, isFireball = false, canDropItem = true) {
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
      this.score += 10;
      this.spawnExplosion(br.x + br.w / 2, br.y + br.h / 2, br.type);
      sound.hitBrick(br.type);

      // Faithfully reimplemented from DX-Ball decompilation (FUN_00406ef0):
      // 1. Strict cap of at most 1 active falling capsule on screen (DAT_00431cb8 < 1).
      // 2. Drop probability is exactly 20% (random(10) < 2).
      // 3. Collateral chain explosions and fireball casualties never spawn capsules (canDropItem = false).
      if (canDropItem && !isFireball && this.capsules.length < 1 && Math.random() < 0.20) {
        const pType = Math.floor(Math.random() * 13);
        const fallSpeed = 2.2 * (this.viewMode === "modern" ? Math.max(1.4, this.virtualH / 480) : 1.0);
        this.capsules.push({
          x: br.x + br.w / 2,
          y: br.y + br.h / 2,
          vy: fallSpeed,
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

  private triggerExplosiveChain(origin: Brick) {
    origin.alive = false;
    this.score += 15;
    this.spawnExplosion(origin.x + origin.w / 2, origin.y + origin.h / 2, 8);
    sound.explosion();

    // Explosive chain destroys neighboring bricks without spawning powerups
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
    this.ctx.fillStyle = this.viewMode === "modern" ? "#060810" : "#0c0d12";
    this.ctx.fillRect(0, 0, this.virtualW, this.virtualH);

    if (this.state === "mode_select") {
      this.renderModeSelectScreen();
      return;
    }

    if (this.state === "menu") {
      this.renderMenuScreen();
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
      this.ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }

    for (const ft of this.floatingTexts) {
      this.ctx.fillStyle = ft.color;
      this.ctx.font = "bold 13px system-ui, sans-serif";
      this.ctx.fillText(ft.text, ft.x, ft.y);
    }

    this.renderHUD();

    if (this.state === "ready") {
      this.renderCenterBanner("TAP OR SPACE TO LAUNCH", "#00e0ff");
    } else if (this.state === "gameover") {
      this.renderCenterBanner("GAME OVER — TAP FOR HIGH SCORES", "#ff3344");
    } else if (this.state === "victory") {
      this.renderCenterBanner("ALL 50 BOARDS CLEARED! YOU WIN!", "#44ff88");
    }
  }

  // Home / Title Menu Screen: Choose Modern Mobile vs Classic 4:3, or utilities
  private renderModeSelectScreen() {
    this.renderBorders();

    this.ctx.save();
    this.ctx.textAlign = "center";

    // Title
    const titleSize = Math.max(28, Math.min(48, Math.round(this.virtualW * 0.09)));
    this.ctx.font = `900 ${titleSize}px 'Impact', 'Arial Black', sans-serif`;
    const grad = this.ctx.createLinearGradient(0, this.virtualH * 0.1, 0, this.virtualH * 0.22);
    grad.addColorStop(0, "#00ffff");
    grad.addColorStop(0.5, "#ffffff");
    grad.addColorStop(1, "#0066cc");
    this.ctx.fillStyle = grad;
    this.ctx.fillText("BRICKWORK", this.virtualW / 2, this.virtualH * 0.16);

    // Subtitle
    this.ctx.font = `bold ${Math.max(11, Math.round(titleSize * 0.38))}px system-ui, sans-serif`;
    this.ctx.fillStyle = "#ffaa00";
    this.ctx.fillText("REVERSE-ENGINEERED 1996 ARCADE", this.virtualW / 2, this.virtualH * 0.22);

    this.ctx.font = "12px system-ui, sans-serif";
    this.ctx.fillStyle = "#88aacc";
    this.ctx.fillText("Choose a game mode to start playing:", this.virtualW / 2, this.virtualH * 0.28);

    const btnW = Math.min(this.virtualW * 0.85, 420);
    const btnX = (this.virtualW - btnW) / 2;
    const btnH = Math.min(68, Math.max(52, this.virtualH * 0.11));

    // Button 1: Modern Fullscreen
    const btn1Y = this.virtualH * 0.33;
    const g1 = this.ctx.createLinearGradient(0, btn1Y, 0, btn1Y + btnH);
    g1.addColorStop(0, "#0055aa");
    g1.addColorStop(1, "#002255");
    this.ctx.fillStyle = g1;
    this.ctx.beginPath();
    this.ctx.roundRect(btnX, btn1Y, btnW, btnH, 10);
    this.ctx.fill();
    this.ctx.strokeStyle = "#00e0ff";
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    this.ctx.font = `bold ${Math.max(14, Math.round(btnH * 0.28))}px system-ui, sans-serif`;
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillText("📱 MODERN (SMARTPHONE)", this.virtualW / 2, btn1Y + btnH * 0.44);
    this.ctx.font = "11px system-ui, sans-serif";
    this.ctx.fillStyle = "#99d5ff";
    this.ctx.fillText("Fullscreen portrait, fast ball tempo & touch layout", this.virtualW / 2, btn1Y + btnH * 0.76);

    // Button 2: Original Classic
    const btn2Y = btn1Y + btnH + 16;
    const g2 = this.ctx.createLinearGradient(0, btn2Y, 0, btn2Y + btnH);
    g2.addColorStop(0, "#223344");
    g2.addColorStop(1, "#111a24");
    this.ctx.fillStyle = g2;
    this.ctx.beginPath();
    this.ctx.roundRect(btnX, btn2Y, btnW, btnH, 10);
    this.ctx.fill();
    this.ctx.strokeStyle = "#557799";
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    this.ctx.font = `bold ${Math.max(14, Math.round(btnH * 0.28))}px system-ui, sans-serif`;
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillText("📺 ORIGINAL (CLASSIC 1996)", this.virtualW / 2, btn2Y + btnH * 0.44);
    this.ctx.font = "11px system-ui, sans-serif";
    this.ctx.fillStyle = "#aabbcc";
    this.ctx.fillText("Authentic 640x480 4:3 PC resolution & original speed", this.virtualW / 2, btn2Y + btnH * 0.76);

    // Button 3 & 4: Editor & Highscores row
    const subBtnW = (btnW - 12) / 2;
    const subBtnH = Math.min(42, Math.max(34, this.virtualH * 0.07));
    const subBtnY = btn2Y + btnH + 16;

    // Editor Button
    this.ctx.fillStyle = "rgba(20, 32, 48, 0.85)";
    this.ctx.beginPath();
    this.ctx.roundRect(btnX, subBtnY, subBtnW, subBtnH, 8);
    this.ctx.fill();
    this.ctx.strokeStyle = "rgba(0, 224, 255, 0.4)";
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
    this.ctx.font = "bold 12px system-ui, sans-serif";
    this.ctx.fillStyle = "#00e0ff";
    this.ctx.fillText("🛠 Level Editor", btnX + subBtnW / 2, subBtnY + subBtnH * 0.62);

    // High Scores Button
    this.ctx.fillStyle = "rgba(20, 32, 48, 0.85)";
    this.ctx.beginPath();
    this.ctx.roundRect(btnX + subBtnW + 12, subBtnY, subBtnW, subBtnH, 8);
    this.ctx.fill();
    this.ctx.strokeStyle = "rgba(255, 170, 0, 0.4)";
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
    this.ctx.font = "bold 12px system-ui, sans-serif";
    this.ctx.fillStyle = "#ffaa00";
    this.ctx.fillText("🏆 High Scores", btnX + subBtnW + 12 + subBtnW / 2, subBtnY + subBtnH * 0.62);

    // Scroller at bottom
    const scrollerY = this.virtualH - 45;
    this.ctx.fillStyle = "#001122";
    this.ctx.fillRect(this.playLeft, scrollerY, this.playRight - this.playLeft, 28);
    this.ctx.strokeStyle = "#0088cc";
    this.ctx.strokeRect(this.playLeft, scrollerY, this.playRight - this.playLeft, 28);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(this.playLeft, scrollerY, this.playRight - this.playLeft, 28);
    this.ctx.clip();
    this.ctx.font = "bold 12px monospace";
    this.ctx.fillStyle = "#00e0ff";
    this.ctx.fillText(this.scrollerText, this.scrollerOffset, scrollerY + 18);
    this.ctx.restore();

    this.ctx.restore();
  }

  private renderMenuScreen() {
    this.renderModeSelectScreen();
  }

  private renderEditorScreen() {
    this.renderBorders();

    const topBarY = Math.max(6, this.playTop - 34);
    const topBarH = 30;

    // Back button
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

    // Clear button
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

    // PLAY LEVEL button (Big, prominent, glowing green)
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
          const info = BRICK_COLORS[type] || { fill: "#fff" };
          this.ctx.fillStyle = info.fill;
          this.ctx.fillRect(bx, by, bw, bh);
        }
        this.ctx.strokeStyle = "#1b2432";
        this.ctx.strokeRect(bx, by, bw, bh);
      }
    }

    // Palette toolbar at bottom
    const toolY = this.virtualH - 52;
    const toolH = 44;
    this.ctx.fillStyle = "#0e141f";
    this.ctx.fillRect(this.playLeft, toolY, this.playRight - this.playLeft, toolH);
    this.ctx.strokeStyle = "#0088cc";
    this.ctx.strokeRect(this.playLeft, toolY, this.playRight - this.playLeft, toolH);

    // Eraser tool
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

    // Color Swatches
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
    this.renderBorders();

    this.ctx.textAlign = "center";
    this.ctx.font = `900 ${Math.round(this.virtualW * 0.07)}px 'Impact', sans-serif`;
    this.ctx.fillStyle = "#ffaa00";
    this.ctx.fillText("HALL OF FAME", this.virtualW / 2, this.virtualH * 0.18);

    this.ctx.font = "bold 15px 'Courier New', monospace";
    this.highScores.forEach((entry, idx) => {
      const y = this.virtualH * 0.28 + idx * 26;
      this.ctx.fillStyle = idx === 0 ? "#ffd700" : idx === 1 ? "#c0c0c0" : idx === 2 ? "#cd7f32" : "#ffffff";
      this.ctx.fillText(`${idx + 1}.  ${entry.name.padEnd(8, ".")}  ${entry.score.toString().padStart(6, " ")}`, this.virtualW / 2, y);
    });

    this.ctx.font = "14px system-ui, sans-serif";
    this.ctx.fillStyle = "#8899aa";
    this.ctx.fillText("[ Tap Anywhere to Return ]", this.virtualW / 2, this.virtualH - 40);
  }

  private renderCapsule(cap: Capsule) {
    const info = POWERUP_NAMES[cap.type] || { badge: "?", color: "#fff" };
    const w = 26;
    const h = 12;

    this.ctx.save();
    this.ctx.fillStyle = info.color;
    this.ctx.beginPath();
    this.ctx.roundRect(cap.x - w / 2, cap.y - h / 2, w, h, 6);
    this.ctx.fill();

    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    this.ctx.font = "bold 9px system-ui, sans-serif";
    this.ctx.fillStyle = "#000000";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(info.badge, cap.x, cap.y);
    this.ctx.restore();
  }

  private renderBorders() {
    if (this.viewMode === "modern") {
      // Modern sleek neon borders
      this.ctx.fillStyle = "#0e131d";
      this.ctx.fillRect(0, 0, this.playLeft, this.virtualH);
      this.ctx.fillRect(this.playRight, 0, this.virtualW - this.playRight, this.virtualH);
      this.ctx.fillRect(this.playLeft, 0, this.playRight - this.playLeft, this.playTop);

      this.ctx.strokeStyle = "rgba(0, 224, 255, 0.35)";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(this.playLeft, this.virtualH);
      this.ctx.lineTo(this.playLeft, this.playTop);
      this.ctx.lineTo(this.playRight, this.playTop);
      this.ctx.lineTo(this.playRight, this.virtualH);
      this.ctx.stroke();
    } else {
      // Classic Amiga Steel Bevel
      const gradL = this.ctx.createLinearGradient(0, 0, this.playLeft, 0);
      gradL.addColorStop(0, "#222");
      gradL.addColorStop(0.5, "#777");
      gradL.addColorStop(1, "#111");
      this.ctx.fillStyle = gradL;
      this.ctx.fillRect(0, 0, this.playLeft, this.virtualH);

      const gradR = this.ctx.createLinearGradient(this.playRight, 0, this.virtualW, 0);
      gradR.addColorStop(0, "#111");
      gradR.addColorStop(0.5, "#777");
      gradR.addColorStop(1, "#222");
      this.ctx.fillStyle = gradR;
      this.ctx.fillRect(this.playRight, 0, this.virtualW - this.playRight, this.virtualH);

      this.ctx.fillStyle = "#555";
      this.ctx.fillRect(this.playLeft, 0, this.playRight - this.playLeft, this.playTop);
    }
  }

  private renderBrick(br: Brick) {
    const info = BRICK_COLORS[br.type] || { fill: "#aaa", border: "#555", highlight: "#fff", hits: 1, isExplosive: false };

    this.ctx.fillStyle = info.fill;
    this.ctx.fillRect(br.x, br.y, br.w, br.h);

    if (info.isExplosive) {
      this.ctx.fillStyle = "#ffff00";
      this.ctx.fillRect(br.x + br.w / 2 - 2, br.y + 2, 4, br.h - 4);
      this.ctx.fillRect(br.x + 4, br.y + br.h / 2 - 2, br.w - 8, 4);
    }

    this.ctx.fillStyle = info.highlight;
    this.ctx.fillRect(br.x, br.y, br.w, 2);
    this.ctx.fillRect(br.x, br.y, 2, br.h);

    this.ctx.fillStyle = info.border;
    this.ctx.fillRect(br.x, br.y + br.h - 2, br.w, 2);
    this.ctx.fillRect(br.x + br.w - 2, br.y, 2, br.h);
  }

  private renderPaddle() {
    const p = this.paddle;
    const grad = this.ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    grad.addColorStop(0, p.hasLasers ? "#ff4400" : "#44aaff");
    grad.addColorStop(0.3, "#ffffff");
    grad.addColorStop(0.7, p.hasLasers ? "#990000" : "#0066cc");
    grad.addColorStop(1, "#002255");

    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.roundRect(p.x, p.y, p.w, p.h, 6);
    this.ctx.fill();

    if (p.hasLasers) {
      this.ctx.fillStyle = "#ffff00";
      this.ctx.fillRect(p.x + 6, p.y - 4, 4, 6);
      this.ctx.fillRect(p.x + p.w - 10, p.y - 4, 4, 6);
    }

    this.ctx.fillStyle = p.hasGrab ? "#00ff88" : "#ff2233";
    this.ctx.beginPath();
    this.ctx.arc(p.x + 5, p.y + p.h / 2, 4, 0, Math.PI * 2);
    this.ctx.arc(p.x + p.w - 5, p.y + p.h / 2, 4, 0, Math.PI * 2);
    this.ctx.fill();
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

    const rad = this.ctx.createRadialGradient(
      b.x - b.radius * 0.3,
      b.y - b.radius * 0.3,
      b.radius * 0.1,
      b.x,
      b.y,
      b.radius
    );
    if (b.isFireball) {
      rad.addColorStop(0, "#ffffff");
      rad.addColorStop(0.4, "#ffaa00");
      rad.addColorStop(1, "#cc2200");
    } else if (b.isThruBrick) {
      rad.addColorStop(0, "#ffffff");
      rad.addColorStop(0.4, "#4488ff");
      rad.addColorStop(1, "#002288");
    } else {
      rad.addColorStop(0, "#ffffff");
      rad.addColorStop(0.4, "#cccccc");
      rad.addColorStop(1, "#333333");
    }

    this.ctx.fillStyle = rad;
    this.ctx.beginPath();
    this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private renderHUD() {
    this.ctx.font = "bold 13px 'Courier New', monospace";
    this.ctx.fillStyle = "#ffffff";
    this.ctx.textBaseline = "middle";

    this.ctx.fillText(`SCORE: ${this.score}`, this.playLeft + 10, this.playTop / 2 + 2);
    this.ctx.fillText(`BOARD: ${this.currentLevel + 1}/50`, this.virtualW / 2 - 40, this.playTop / 2 + 2);
    this.ctx.fillText(`LIVES: ${this.lives}`, this.playRight - 80, this.playTop / 2 + 2);
  }

  private renderCenterBanner(text: string, color: string) {
    this.ctx.save();
    this.ctx.font = `bold ${Math.round(this.virtualW * 0.042)}px system-ui, sans-serif`;
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    this.ctx.fillRect(this.playLeft, this.virtualH * 0.5 - 24, this.playRight - this.playLeft, 48);

    this.ctx.fillStyle = color;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, this.virtualW / 2, this.virtualH * 0.5);
    this.ctx.restore();
  }
}
