import "./styles.css";
import { separateTrack, type SeparationProgress } from "./model/StemSeparator";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root element was not found.");

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Stem Studio home"><span class="brand-mark"><i></i><i></i><i></i><i></i><i></i></span><span>stem<span class="brand-light">studio</span></span></a>
      <div class="topbar-right"><span class="privacy-dot"></span><span>Private, on-device processing</span><a class="github-link" href="https://github.com/tihonoveckijan8-dev/stem_test2" target="_blank" rel="noreferrer">GitHub ↗</a></div>
    </header>
    <main>
      <section class="hero">
        <div class="eyebrow"><span class="eyebrow-line"></span> AI AUDIO WORKSPACE</div>
        <h1>Every layer.<br /><span>Within reach.</span></h1>
        <p class="hero-copy">Separate vocals from the rest of your track in a few clicks.<br class="desktop-break" /> Your audio stays in your browser — never uploaded.</p>
      </section>
      <section class="workspace" aria-label="Audio separation workspace">
        <div class="workspace-head"><div><span class="step">01</span><h2>Choose your track</h2></div><span class="format-pill">MP3 · WAV</span></div>
        <label class="dropzone" id="dropzone" for="audio-file" tabindex="0">
          <input id="audio-file" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp3,.mp3,.wav" />
          <span class="upload-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"/></svg></span>
          <strong id="drop-title">Drop audio file here</strong>
          <span class="drop-subtitle">or <span class="browse">browse files</span> from your device</span>
          <span class="drop-limit">MP3 or WAV · up to 12 minutes</span>
        </label>
        <div id="selected-file" class="selected-file hidden"></div>
        <div class="processing hidden" id="processing" aria-live="polite">
          <div class="processing-top"><span id="status-label">Getting things ready…</span><span id="progress-value">0%</span></div>
          <div class="progress-track"><div id="progress-bar"></div></div>
          <p id="status-detail">Your file stays on this device.</p>
        </div>
        <div id="error-box" class="error-box hidden" role="alert"></div>
        <button class="primary-button" id="separate-button" disabled><span class="button-label">Separate track</span><span class="button-arrow">↗</span></button>
        <div class="workspace-foot"><span class="lock-icon">⌑</span> Audio is processed locally in your browser <span class="foot-divider">·</span> No account required</div>
      </section>
      <section class="results hidden" id="results">
        <div class="results-heading"><div><span class="step">02</span><h2>Your stems</h2></div><span class="success-label"><span>✓</span> Separation complete</span></div>
        <div class="stem-grid">
          <article class="stem-card vocal-card"><div class="stem-card-top"><span class="stem-icon vocal-icon">♫</span><span class="stem-number">STEM 01</span></div><h3>Vocals</h3><p>Lead and backing vocals</p><audio id="vocals-player" controls preload="metadata"></audio><a id="vocals-download" class="download-button" download="vocals.wav">Download WAV <span>↓</span></a></article>
          <article class="stem-card music-card"><div class="stem-card-top"><span class="stem-icon music-icon">≋</span><span class="stem-number">STEM 02</span></div><h3>Instrumental</h3><p>Music without vocals</p><audio id="music-player" controls preload="metadata"></audio><a id="music-download" class="download-button" download="instrumental.wav">Download WAV <span>↓</span></a></article>
        </div>
        <button class="secondary-button" id="new-track">＋ Separate another track</button>
      </section>
      <footer><span>STEM STUDIO</span><span>Made for the love of sound.</span></footer>
    </main>
  </div>
`;

const fileInput = document.querySelector<HTMLInputElement>("#audio-file")!;
const dropzone = document.querySelector<HTMLLabelElement>("#dropzone")!;
const selectedFile = document.querySelector<HTMLDivElement>("#selected-file")!;
const separateButton = document.querySelector<HTMLButtonElement>("#separate-button")!;
const processing = document.querySelector<HTMLDivElement>("#processing")!;
const errorBox = document.querySelector<HTMLDivElement>("#error-box")!;
const results = document.querySelector<HTMLElement>("#results")!;
let chosenFile: File | null = null;
let busy = false;
let resultUrls: string[] = [];

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function chooseFile(file: File | undefined): void {
  if (!file) return;
  errorBox.classList.add("hidden");
  if (!/\.(mp3|wav)$/i.test(file.name) && !["audio/mpeg", "audio/wav", "audio/x-wav"].includes(file.type)) {
    showError("Choose an MP3 or WAV audio file.");
    return;
  }
  if (file.size === 0) { showError("This file is empty. Choose another track."); return; }
  chosenFile = file;
  selectedFile.innerHTML = `<span class="file-badge">♪</span><span class="file-info"><strong></strong><small>${formatSize(file.size)}</small></span><button type="button" class="remove-file" aria-label="Remove selected file">×</button>`;
  selectedFile.querySelector("strong")!.textContent = file.name;
  selectedFile.classList.remove("hidden");
  dropzone.classList.add("has-file");
  document.querySelector("#drop-title")!.textContent = "Track ready to go";
  separateButton.disabled = busy;
  selectedFile.querySelector("button")!.addEventListener("click", (event) => {
    event.preventDefault(); event.stopPropagation(); clearSelection();
  });
}
function clearSelection(): void {
  chosenFile = null; fileInput.value = ""; selectedFile.classList.add("hidden");
  dropzone.classList.remove("has-file"); document.querySelector("#drop-title")!.textContent = "Drop audio file here";
  separateButton.disabled = true; errorBox.classList.add("hidden");
}
function showError(message: string): void {
  errorBox.textContent = message; errorBox.classList.remove("hidden");
}
function setProgress(progress: SeparationProgress): void {
  document.querySelector("#status-label")!.textContent = progress.label;
  document.querySelector("#status-detail")!.textContent = progress.detail;
  document.querySelector("#progress-value")!.textContent = `${Math.round(progress.fraction * 100)}%`;
  (document.querySelector("#progress-bar") as HTMLDivElement).style.width = `${Math.round(progress.fraction * 100)}%`;
}
fileInput.addEventListener("change", () => chooseFile(fileInput.files?.[0]));
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
});
for (const eventName of ["dragenter", "dragover"] as const) {
  dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add("dragging"); });
}
for (const eventName of ["dragleave", "drop"] as const) {
  dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove("dragging"); });
}
dropzone.addEventListener("drop", (event) => chooseFile((event as DragEvent).dataTransfer?.files?.[0]));
separateButton.addEventListener("click", async () => {
  if (!chosenFile || busy) return;
  busy = true; separateButton.disabled = true; errorBox.classList.add("hidden");
  processing.classList.remove("hidden"); results.classList.add("hidden");
  setProgress({ fraction: 0.02, label: "Preparing your track…", detail: "Audio is being decoded in this browser." });
  try {
    const output = await separateTrack(chosenFile, setProgress);
    resultUrls.forEach(URL.revokeObjectURL); resultUrls = [output.vocalsUrl, output.instrumentalUrl];
    (document.querySelector("#vocals-player") as HTMLAudioElement).src = output.vocalsUrl;
    (document.querySelector("#music-player") as HTMLAudioElement).src = output.instrumentalUrl;
    (document.querySelector("#vocals-download") as HTMLAnchorElement).href = output.vocalsUrl;
    (document.querySelector("#music-download") as HTMLAnchorElement).href = output.instrumentalUrl;
    results.classList.remove("hidden"); results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showError(error instanceof Error ? error.message : "Separation failed. Please try another audio file.");
  } finally {
    busy = false; separateButton.disabled = !chosenFile;
    document.querySelector(".button-label")!.textContent = "Separate track";
  }
});
document.querySelector("#new-track")!.addEventListener("click", () => {
  resultUrls.forEach(URL.revokeObjectURL); resultUrls = [];
  (document.querySelector("#vocals-player") as HTMLAudioElement).removeAttribute("src");
  (document.querySelector("#music-player") as HTMLAudioElement).removeAttribute("src");
  results.classList.add("hidden"); clearSelection(); window.scrollTo({ top: 0, behavior: "smooth" });
});
