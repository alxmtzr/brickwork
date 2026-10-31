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

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

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

  // The 4 full states matching original reverse engineering:
  // "menu" (State 0), "playing" (State 1), "editor" (State 2), "highscores" (State 3)
  public state: "menu" | "playing" | "editor" | "highscores" | "ready" | "gameover" | "victory" = "menu";

  private running = false;
  private lastTime = 0;

  // Level Editor variables
  public editorBrush = 1;
  public editorGrid: number[] = new Array(BOARD_COLS * BOARD_ROWS).fill(0);

  // High Scores list (persisted to localStorage)
  public highScores: HighScoreEntry[] = [];

  // Scroller on title screen
  private scrollerOffset = STAGE_W;
  private scrollerText = "BRICKWORK (1996 RETRO REVERSE-ENGINEERED EDITION) -- ALL 50 BOARDS, 13 POWER-UPS, BRICK EXPLOSIONS, LASERS, LEVEL EDITOR (PRESS E), AND HIGH SCORES (PRESS H). CLICK OR PRESS SPACE TO PLAY!  ";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.loadHighScores();
    this.initEvents();
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
        const name = prompt(`New High Score of ${finalScore}! Enter your 3-letter name:`, "YOU") || "YOU";
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
            x: PLAYFIELD_LEFT + c * BRICK_W,
            y: PLAYFIELD_TOP + 30 + r * BRICK_H,
            w: BRICK_W,
            h: BRICK_H,
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
    this.paddle.w = 80;
    this.paddle.x = STAGE_W / 2 - this.paddle.w / 2;
    this.paddle.targetX = this.paddle.x;
    this.paddle.hasLasers = false;
    this.paddle.hasGrab = false;

    this.balls = [
      {
        x: this.paddle.x + this.paddle.w / 2,
        y: this.paddle.y - 7,
        vx: 0,
        vy: 0,
        radius: 6,
        speed: 5.5,
        stuckToPaddle: true,
        stuckOffset: this.paddle.w / 2,
        isFireball: false,
        isThruBrick: false,
      },
    ];
  }

  public launchBall() {
    if (this.state === "menu" || this.state === "highscores") {
      this.score = 0;
      this.lives = 3;
      this.loadLevel(0);
      return;
    }

    if (this.state === "ready") {
      this.state = "playing";
      for (const b of this.balls) {
        if (b.stuckToPaddle) {
          b.stuckToPaddle = false;
          b.vx = (Math.random() - 0.5) * 4;
          b.vy = -b.speed;
        }
      }
      sound.hitPaddle(1);
    } else if (this.state === "playing") {
      // If paddle has lasers, fire them!
      if (this.paddle.hasLasers && this.paddle.laserCooldown <= 0) {
        this.bullets.push({ x: this.paddle.x + 8, y: this.paddle.y - 4, vy: -9 });
        this.bullets.push({ x: this.paddle.x + this.paddle.w - 8, y: this.paddle.y - 4, vy: -9 });
        this.paddle.laserCooldown = 0.2;
        sound.laser();
      }

      // If any ball is grabbed, release it
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
      this.state = "menu";
    }
  }

  private initEvents() {
    const getPos = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = STAGE_W / rect.width;
      const scaleY = STAGE_H / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    };

    // Mouse Controls
    window.addEventListener("mousemove", (e) => {
      const pos = getPos(e.clientX, e.clientY);
      this.paddle.targetX = pos.x - this.paddle.w / 2;

      if (this.state === "editor" && e.buttons === 1) {
        this.handleEditorClick(pos.x, pos.y);
      }
    });

    window.addEventListener("mousedown", (e) => {
      const pos = getPos(e.clientX, e.clientY);
      if (this.state === "editor") {
        this.handleEditorClick(pos.x, pos.y);
        return;
      }
      this.launchBall();
    });

    // Touch Controls for Mobile / Tablets
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const pos = getPos(touch.clientX, touch.clientY);
      this.paddle.targetX = pos.x - this.paddle.w / 2;

      if (this.state === "editor") {
        this.handleEditorClick(pos.x, pos.y);
        return;
      }
      this.launchBall();
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
        // Toggle Level Editor (State 2)
        if (this.state !== "editor") {
          this.state = "editor";
          this.editorGrid = new Array(BOARD_COLS * BOARD_ROWS).fill(0);
        } else {
          this.state = "menu";
        }
      } else if (e.key === "h" || e.key === "H") {
        // Toggle High Scores (State 3)
        this.state = this.state === "highscores" ? "menu" : "highscores";
      } else if (e.key === "Escape") {
        this.state = "menu";
      } else if (e.key === "n" || e.key === "N") {
        // Next Level Warp cheat
        if (this.state === "playing" || this.state === "ready") {
          this.loadLevel(this.currentLevel + 1);
        }
      } else if (e.key === "p" || e.key === "P") {
        // Prev Level
        if (this.state === "playing" || this.state === "ready") {
          this.loadLevel(this.currentLevel - 1);
        }
      }
    });
  }

  private handleEditorClick(x: number, y: number) {
    // Check if clicked palette toolbar
    if (y >= 440 && y <= 470) {
      const idx = Math.floor((x - 20) / 26) + 1;
      if (idx >= 0 && idx <= 22) {
        this.editorBrush = idx;
      }
      return;
    }

    // Grid coordinates
    const col = Math.floor((x - PLAYFIELD_LEFT) / BRICK_W);
    const row = Math.floor((y - (PLAYFIELD_TOP + 30)) / BRICK_H);
    if (col >= 0 && col < BOARD_COLS && row >= 0 && row < BOARD_ROWS) {
      this.editorGrid[row * BOARD_COLS + col] = this.editorBrush;
    }
  }

  public testPlayEditorBoard() {
    this.customLevels = [Array.from(this.editorGrid)];
    this.loadLevel(0);
    this.state = "ready";
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
    if (this.state === "menu") {
      this.scrollerOffset -= 120 * dt;
      if (this.scrollerOffset < -2500) this.scrollerOffset = STAGE_W;
      return;
    }

    if (this.state === "editor" || this.state === "highscores") {
      return;
    }

    // Update paddle
    const lerp = 0.4;
    this.paddle.x += (this.paddle.targetX - this.paddle.x) * lerp;
    if (this.paddle.x < PLAYFIELD_LEFT) this.paddle.x = PLAYFIELD_LEFT;
    if (this.paddle.x + this.paddle.w > PLAYFIELD_RIGHT) {
      this.paddle.x = PLAYFIELD_RIGHT - this.paddle.w;
    }

    if (this.paddle.laserCooldown > 0) {
      this.paddle.laserCooldown -= dt;
    }

    // Update Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bu = this.bullets[i]!;
      bu.y += bu.vy;
      if (bu.y < PLAYFIELD_TOP) {
        this.bullets.splice(i, 1);
        continue;
      }
      // Check collision with bricks
      for (const br of this.bricks) {
        if (!br.alive) continue;
        if (bu.x >= br.x && bu.x <= br.x + br.w && bu.y >= br.y && bu.y <= br.y + br.h) {
          this.bullets.splice(i, 1);
          this.damageBrick(br);
          break;
        }
      }
    }

    // Update Falling Capsules (Powerups)
    for (let i = this.capsules.length - 1; i >= 0; i--) {
      const cap = this.capsules[i]!;
      cap.y += cap.vy;

      // Check paddle catch
      if (
        cap.y + 8 >= this.paddle.y &&
        cap.y - 8 <= this.paddle.y + this.paddle.h &&
        cap.x >= this.paddle.x - 10 &&
        cap.x <= this.paddle.x + this.paddle.w + 10
      ) {
        this.applyPowerup(cap.type);
        this.score += 100;
        this.capsules.splice(i, 1);
        sound.powerup();
        continue;
      }

      if (cap.y > STAGE_H) {
        this.capsules.splice(i, 1);
      }
    }

    // Update Balls
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i]!;
      if (b.stuckToPaddle) {
        b.x = this.paddle.x + b.stuckOffset;
        b.y = this.paddle.y - b.radius;
        continue;
      }

      b.x += b.vx;
      b.y += b.vy;

      // Wall collisions
      if (b.x - b.radius < PLAYFIELD_LEFT) {
        b.x = PLAYFIELD_LEFT + b.radius;
        b.vx = Math.abs(b.vx);
        sound.hitWall();
      } else if (b.x + b.radius > PLAYFIELD_RIGHT) {
        b.x = PLAYFIELD_RIGHT - b.radius;
        b.vx = -Math.abs(b.vx);
        sound.hitWall();
      }

      if (b.y - b.radius < PLAYFIELD_TOP) {
        b.y = PLAYFIELD_TOP + b.radius;
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

      // Brick collision
      this.checkBrickCollision(b);

      // Bottom death boundary
      if (b.y - b.radius > STAGE_H) {
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

    // Check level complete
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

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Update Floating text
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
      case 0: // +1 Life
        this.lives++;
        break;
      case 1: // Warp
        this.loadLevel(this.currentLevel + 1);
        break;
      case 2: // Zap bricks (clears bottom row of bricks)
        for (const br of this.bricks) {
          if (br.alive && br.type !== 2 && br.row >= 10) {
            br.alive = false;
            this.spawnExplosion(br.x + br.w / 2, br.y + br.h / 2, br.type);
          }
        }
        break;
      case 3: // Slow Ball
        for (const b of this.balls) {
          b.speed = 4.0;
          const currAngle = Math.atan2(b.vx, -b.vy);
          b.vx = b.speed * Math.sin(currAngle);
          b.vy = -b.speed * Math.cos(currAngle);
        }
        break;
      case 4: // Split ball (Spawn 2 extra balls)
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
      case 5: // Grab paddle
        this.paddle.hasGrab = true;
        break;
      case 6: // Shooting paddle
        this.paddle.hasLasers = true;
        break;
      case 7: // Thru brick
        for (const b of this.balls) b.isThruBrick = true;
        break;
      case 8: // Set off exploding (triggers every explosive brick currently on screen)
        for (const br of this.bricks) {
          if (br.alive && br.type === 8) {
            this.triggerExplosiveChain(br);
          }
        }
        break;
      case 9: // Fireball
        for (const b of this.balls) b.isFireball = true;
        break;
      case 10: // Expand paddle
        this.paddle.w = Math.min(140, this.paddle.w + 24);
        break;
      case 11: // Shrink paddle
        this.paddle.w = Math.max(45, this.paddle.w - 18);
        break;
      case 12: // Fast ball
        for (const b of this.balls) {
          b.speed = 7.5;
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

  private damageBrick(br: Brick, isFireball = false) {
    if (br.type === 2) {
      // Unbreakable metal brick (unless hit by Fireball)
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
      // Explosive brick: triggers explosion and destroys neighbors!
      this.triggerExplosiveChain(br);
      return;
    }

    br.hitsLeft--;
    if (br.hitsLeft <= 0 || isFireball) {
      br.alive = false;
      this.score += 10;
      this.spawnExplosion(br.x + br.w / 2, br.y + br.h / 2, br.type);
      sound.hitBrick(br.type);

      // Chance to drop powerup capsule (approx 20% like original 0x406ef0)
      if (Math.random() < 0.22) {
        const pType = Math.floor(Math.random() * 13);
        this.capsules.push({
          x: br.x + br.w / 2,
          y: br.y + br.h / 2,
          vy: 2.2,
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

  // Chain-reaction bomb explosion (decompiled 0x406d30 / 0x405c80)
  private triggerExplosiveChain(origin: Brick) {
    origin.alive = false;
    this.score += 15;
    this.spawnExplosion(origin.x + origin.w / 2, origin.y + origin.h / 2, 8);
    sound.explosion();

    // Damage adjacent 8 neighbors in grid
    for (const br of this.bricks) {
      if (!br.alive) continue;
      const dCol = Math.abs(br.col - origin.col);
      const dRow = Math.abs(br.row - origin.row);
      if (dCol <= 1 && dRow <= 1 && !(dCol === 0 && dRow === 0)) {
        setTimeout(() => {
          if (br.alive) this.damageBrick(br, true);
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
    this.ctx.fillStyle = "#0c0d12";
    this.ctx.fillRect(0, 0, STAGE_W, STAGE_H);

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

    // Render Side Borders
    this.renderBorders();

    // Render Bricks
    for (const br of this.bricks) {
      if (!br.alive) continue;
      this.renderBrick(br);
    }

    // Render Falling Capsules
    for (const cap of this.capsules) {
      this.renderCapsule(cap);
    }

    // Render Lasers/Bullets
    for (const bu of this.bullets) {
      this.ctx.fillStyle = "#ff2200";
      this.ctx.fillRect(bu.x - 2, bu.y - 6, 4, 10);
      this.ctx.fillStyle = "#ffff55";
      this.ctx.fillRect(bu.x - 1, bu.y - 4, 2, 6);
    }

    // Render Paddle
    this.renderPaddle();

    // Render Balls
    for (const b of this.balls) {
      this.renderBall(b);
    }

    // Render Particles
    for (const p of this.particles) {
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }

    // Render Floating Text
    for (const ft of this.floatingTexts) {
      this.ctx.fillStyle = ft.color;
      this.ctx.font = "bold 13px system-ui, sans-serif";
      this.ctx.fillText(ft.text, ft.x, ft.y);
    }

    // Render HUD
    this.renderHUD();

    // Overlays
    if (this.state === "ready") {
      this.renderCenterBanner("CLICK OR SPACE TO LAUNCH", "#00e0ff");
    } else if (this.state === "gameover") {
      this.renderCenterBanner("GAME OVER — CLICK FOR HIGH SCORES", "#ff3344");
    } else if (this.state === "victory") {
      this.renderCenterBanner("ALL 50 BOARDS CLEARED! YOU WIN!", "#44ff88");
    }
  }

  private renderMenuScreen() {
    this.renderBorders();

    // Big 90s Style Title
    this.ctx.save();
    this.ctx.textAlign = "center";
    this.ctx.font = "900 48px 'Impact', 'Arial Black', sans-serif";
    const grad = this.ctx.createLinearGradient(0, 100, 0, 160);
    grad.addColorStop(0, "#00ffff");
    grad.addColorStop(0.5, "#ffffff");
    grad.addColorStop(1, "#0066cc");
    this.ctx.fillStyle = grad;
    this.ctx.fillText("BRICKWORK", STAGE_W / 2, 140);
    this.ctx.restore();

    // Subtitle & Instructions
    this.ctx.textAlign = "center";
    this.ctx.font = "bold 15px monospace";
    this.ctx.fillStyle = "#ffaa00";
    this.ctx.fillText("50 ORIGINAL 1996 BOARDS & POWER-UPS", STAGE_W / 2, 180);

    this.ctx.font = "bold 14px system-ui, sans-serif";
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillText("[ CLICK OR PRESS SPACE TO PLAY ]", STAGE_W / 2, 240);

    this.ctx.font = "13px system-ui, sans-serif";
    this.ctx.fillStyle = "#8899aa";
    this.ctx.fillText("Press [E] for Level Editor  |  Press [H] for High Scores", STAGE_W / 2, 280);
    this.ctx.fillText("Cheats: [N] Next Board  |  [P] Previous Board", STAGE_W / 2, 310);

    // Amiga Sine Scroller at Bottom
    this.ctx.fillStyle = "#001122";
    this.ctx.fillRect(PLAYFIELD_LEFT, 410, PLAYFIELD_RIGHT - PLAYFIELD_LEFT, 35);
    this.ctx.strokeStyle = "#0088cc";
    this.ctx.strokeRect(PLAYFIELD_LEFT, 410, PLAYFIELD_RIGHT - PLAYFIELD_LEFT, 35);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(PLAYFIELD_LEFT, 410, PLAYFIELD_RIGHT - PLAYFIELD_LEFT, 35);
    this.ctx.clip();
    this.ctx.font = "bold 15px 'Courier New', monospace";
    this.ctx.fillStyle = "#00e0ff";
    this.ctx.fillText(this.scrollerText, this.scrollerOffset, 432);
    this.ctx.restore();
  }

  private renderEditorScreen() {
    this.renderBorders();

    this.ctx.font = "bold 14px system-ui, sans-serif";
    this.ctx.fillStyle = "#00e0ff";
    this.ctx.fillText("LEVEL EDITOR (State 2) — Click grid to paint, [Esc] to exit", PLAYFIELD_LEFT + 10, 18);

    // Render Editor Grid
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const type = this.editorGrid[r * BOARD_COLS + c]!;
        const bx = PLAYFIELD_LEFT + c * BRICK_W;
        const by = PLAYFIELD_TOP + 30 + r * BRICK_H;
        if (type > 0) {
          const info = BRICK_COLORS[type] || { fill: "#fff" };
          this.ctx.fillStyle = info.fill;
          this.ctx.fillRect(bx, by, BRICK_W, BRICK_H);
        }
        this.ctx.strokeStyle = "#222d3a";
        this.ctx.strokeRect(bx, by, BRICK_W, BRICK_H);
      }
    }

    // Render Bottom Toolbar Palette
    this.ctx.fillStyle = "#151c26";
    this.ctx.fillRect(20, 435, 600, 40);
    this.ctx.font = "11px monospace";
    this.ctx.fillStyle = "#88aacc";
    this.ctx.fillText("BRUSH:", 25, 458);

    for (let i = 1; i <= 22; i++) {
      const px = 75 + (i - 1) * 24;
      const info = BRICK_COLORS[i] || { fill: "#aaa" };
      this.ctx.fillStyle = info.fill;
      this.ctx.fillRect(px, 442, 20, 14);
      if (this.editorBrush === i) {
        this.ctx.strokeStyle = "#fff";
        this.ctx.strokeRect(px - 1, 441, 22, 16);
      }
    }
  }

  private renderHighScoresScreen() {
    this.renderBorders();

    this.ctx.textAlign = "center";
    this.ctx.font = "900 32px 'Impact', sans-serif";
    this.ctx.fillStyle = "#ffaa00";
    this.ctx.fillText("HALL OF FAME (State 3)", STAGE_W / 2, 80);

    this.ctx.font = "bold 16px 'Courier New', monospace";
    this.highScores.forEach((entry, idx) => {
      const y = 140 + idx * 26;
      this.ctx.fillStyle = idx === 0 ? "#ffd700" : idx === 1 ? "#c0c0c0" : idx === 2 ? "#cd7f32" : "#ffffff";
      this.ctx.fillText(`${idx + 1}.  ${entry.name.padEnd(10, ".")}  ${entry.score.toString().padStart(6, " ")}`, STAGE_W / 2, y);
    });

    this.ctx.font = "14px system-ui, sans-serif";
    this.ctx.fillStyle = "#8899aa";
    this.ctx.fillText("[ Press Space or Click to Return ]", STAGE_W / 2, 430);
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
    const gradL = this.ctx.createLinearGradient(0, 0, PLAYFIELD_LEFT, 0);
    gradL.addColorStop(0, "#222");
    gradL.addColorStop(0.5, "#777");
    gradL.addColorStop(1, "#111");
    this.ctx.fillStyle = gradL;
    this.ctx.fillRect(0, 0, PLAYFIELD_LEFT, STAGE_H);

    const gradR = this.ctx.createLinearGradient(PLAYFIELD_RIGHT, 0, STAGE_W, 0);
    gradR.addColorStop(0, "#111");
    gradR.addColorStop(0.5, "#777");
    gradR.addColorStop(1, "#222");
    this.ctx.fillStyle = gradR;
    this.ctx.fillRect(PLAYFIELD_RIGHT, 0, STAGE_W - PLAYFIELD_RIGHT, STAGE_H);

    this.ctx.fillStyle = "#555";
    this.ctx.fillRect(PLAYFIELD_LEFT, 0, PLAYFIELD_RIGHT - PLAYFIELD_LEFT, PLAYFIELD_TOP);
  }

  private renderBrick(br: Brick) {
    const info = BRICK_COLORS[br.type] || { fill: "#aaa", border: "#555", highlight: "#fff", hits: 1, isExplosive: false };

    this.ctx.fillStyle = info.fill;
    this.ctx.fillRect(br.x, br.y, br.w, br.h);

    if (info.isExplosive) {
      // Explosive brick cross-hazard icon
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

    // Laser cannons if shooting mode is active
    if (p.hasLasers) {
      this.ctx.fillStyle = "#ffff00";
      this.ctx.fillRect(p.x + 6, p.y - 4, 4, 6);
      this.ctx.fillRect(p.x + p.w - 10, p.y - 4, 4, 6);
    }

    // Red tips
    this.ctx.fillStyle = p.hasGrab ? "#00ff88" : "#ff2233";
    this.ctx.beginPath();
    this.ctx.arc(p.x + 5, p.y + p.h / 2, 4, 0, Math.PI * 2);
    this.ctx.arc(p.x + p.w - 5, p.y + p.h / 2, 4, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private renderBall(b: Ball) {
    if (b.isFireball) {
      // Fireball particle trail
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

    this.ctx.fillText(`SCORE: ${this.score}`, PLAYFIELD_LEFT + 10, PLAYFIELD_TOP / 2);
    this.ctx.fillText(`BOARD: ${this.currentLevel + 1}/50`, STAGE_W / 2 - 40, PLAYFIELD_TOP / 2);
    this.ctx.fillText(`LIVES: ${this.lives}`, PLAYFIELD_RIGHT - 80, PLAYFIELD_TOP / 2);
  }

  private renderCenterBanner(text: string, color: string) {
    this.ctx.save();
    this.ctx.font = "bold 16px system-ui, sans-serif";
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    this.ctx.fillRect(PLAYFIELD_LEFT, 260, PLAYFIELD_RIGHT - PLAYFIELD_LEFT, 40);

    this.ctx.fillStyle = color;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, STAGE_W / 2, 280);
    this.ctx.restore();
  }
}
