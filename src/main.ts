import { GameEngine } from "./game/engine.ts";

const stage = document.getElementById("stage") as HTMLCanvasElement;
const fsBtn = document.getElementById("fs-btn") as HTMLButtonElement;
const btnHome = document.getElementById("btn-home") as HTMLButtonElement;
const modeToggle = document.getElementById("mode-toggle") as HTMLButtonElement;
const btnEditor = document.getElementById("btn-editor") as HTMLButtonElement;
const btnPlayCustom = document.getElementById("btn-play-custom") as HTMLButtonElement;
const btnScores = document.getElementById("btn-scores") as HTMLButtonElement;
const fsModal = document.getElementById("fs-modal") as HTMLDivElement;
const fsModalBody = document.getElementById("fs-modal-body") as HTMLDivElement;
const closeFsModal = document.getElementById("close-fs-modal") as HTMLButtonElement;

// Mobile platform detection
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);
const isStandalone = ("standalone" in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone) ||
  window.matchMedia("(display-mode: standalone)").matches;

const isMobile = isIOS || isAndroid || /Mobile/i.test(navigator.userAgent) || window.innerWidth < 640;

const game = new GameEngine(stage);

// Update body class for styling transitions
function syncModeClass() {
  if (game.viewMode === "classic") {
    document.body.classList.add("classic-mode");
    if (modeToggle) modeToggle.textContent = "Switch to Modern";
  } else {
    document.body.classList.remove("classic-mode");
    if (modeToggle) modeToggle.textContent = "Switch to Classic";
  }
}
game.onModeChange = syncModeClass;

// Initial styling & bounds
if (isMobile) {
  game.viewMode = "modern";
} else {
  game.viewMode = "classic";
}
syncModeClass();
game.resizeLayout();
game.state = "mode_select"; // Always start at the interactive Home Menu!
game.start();

function updateNavState() {
  if (btnPlayCustom) {
    btnPlayCustom.style.display = game.state === "editor" ? "inline-block" : "none";
  }
}

btnHome?.addEventListener("click", () => {
  game.state = "mode_select";
  updateNavState();
});

modeToggle?.addEventListener("click", () => {
  const nextMode = game.viewMode === "classic" ? "modern" : "classic";
  game.setViewMode(nextMode);
  syncModeClass();
  updateNavState();
});

btnEditor?.addEventListener("click", () => {
  if (game.state === "editor") {
    game.state = "mode_select";
  } else {
    game.state = "editor";
    game.editorGrid = new Array(20 * 20).fill(0);
  }
  updateNavState();
});

btnPlayCustom?.addEventListener("click", () => {
  game.playEditedLevel();
  updateNavState();
});

btnScores?.addEventListener("click", () => {
  game.state = game.state === "highscores" ? "mode_select" : "highscores";
  updateNavState();
});

window.addEventListener("pointerdown", () => {
  setTimeout(updateNavState, 50);
});
window.addEventListener("keydown", () => {
  setTimeout(updateNavState, 50);
});

// Capture install prompt if available (Android Chrome / Chromium)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e as BeforeInstallPromptEvent;
});

function showFullscreenHelp() {
  if (!fsModal || !fsModalBody) return;

  if (isIOS) {
    fsModalBody.innerHTML = `
      <strong>On iPhone / iPad:</strong><br />
      1. Tap the browser <strong>Share</strong> button (<strong>⬆</strong> / <strong>⎋</strong>)<br />
      2. Choose <strong>"Add to Home Screen"</strong><br />
      3. Launch from your home screen for zero browser bars!
    `;
  } else if (isAndroid) {
    fsModalBody.innerHTML = `
      <strong>On Android:</strong><br />
      1. Tap the browser menu (<strong>⋮</strong>)<br />
      2. Choose <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong><br />
      3. Launch from your home screen for true standalone fullscreen!
    `;
  } else {
    fsModalBody.innerHTML = `Press <strong>F11</strong> or use your browser menu to enter Fullscreen mode.`;
  }

  fsModal.style.display = "block";
}

// Fullscreen Handling
fsBtn?.addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    void deferredInstallPrompt.prompt();
    deferredInstallPrompt = null;
    return;
  }

  if (document.fullscreenElement) {
    if (document.exitFullscreen) {
      void document.exitFullscreen();
    }
    return;
  }

  const doc = document.documentElement;
  if (doc.requestFullscreen) {
    try {
      await doc.requestFullscreen();
    } catch {
      showFullscreenHelp();
    }
  } else {
    showFullscreenHelp();
  }
});

closeFsModal?.addEventListener("click", () => {
  if (fsModal) fsModal.style.display = "none";
});
