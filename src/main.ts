import { GameEngine } from "./game/engine.ts";
import { decodeBoards } from "./loader/formats.ts";
import { loadGameFiles } from "./loader/wise.ts";

const stage = document.getElementById("stage") as HTMLCanvasElement;
const drop = document.getElementById("drop") as HTMLDivElement;
const pick = document.getElementById("pick") as HTMLInputElement;
const msg = document.getElementById("msg") as HTMLParagraphElement;
const fsBtn = document.getElementById("fs-btn") as HTMLButtonElement;
const btnMenu = document.getElementById("btn-menu") as HTMLButtonElement;
const btnEditor = document.getElementById("btn-editor") as HTMLButtonElement;
const btnScores = document.getElementById("btn-scores") as HTMLButtonElement;

// Instantiate GameEngine on the canvas
const game = new GameEngine(stage);
game.start();

function say(text: string, error = false): void {
  if (msg) {
    msg.textContent = text;
    msg.className = error ? "err" : "";
  }
}

// On-screen buttons for smartphone navigation
btnMenu?.addEventListener("click", () => {
  game.state = "menu";
});

btnEditor?.addEventListener("click", () => {
  if (game.state === "editor") {
    game.state = "menu";
  } else {
    game.state = "editor";
    game.editorGrid = new Array(20 * 20).fill(0);
  }
});

btnScores?.addEventListener("click", () => {
  game.state = game.state === "highscores" ? "menu" : "highscores";
});

// Optional drop handling for user who wants to load their own .bds / original maps
async function handleFile(file: File): Promise<void> {
  say("Unpacking custom game package...");
  try {
    const files = loadGameFiles(new Uint8Array(await file.arrayBuffer()));
    const bds = files.get("default.bds");
    if (bds) {
      const customBoards = decodeBoards(bds);
      game.setCustomBoards(customBoards);
      say(`Successfully loaded ${customBoards.length} original custom boards! Enjoy.`);
    } else {
      say(`Loaded ${files.size} files, but no boards found.`, true);
    }
  } catch (e) {
    say(e instanceof Error ? e.message : String(e), true);
  }
}

drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const f = e.dataTransfer?.files[0];
  if (f) void handleFile(f);
});
pick.addEventListener("change", () => {
  const f = pick.files?.[0];
  if (f) void handleFile(f);
});

// Fullscreen toggle
fsBtn?.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    void stage.requestFullscreen();
  } else {
    void document.exitFullscreen();
  }
});
