import { createSeparator, SeparationStage } from "web-audio-separation";
import type { MDXSeparator } from "web-audio-separation";

export interface SeparationProgress {
  fraction: number;
  label: string;
  detail: string;
}
export interface SeparationResult {
  vocalsUrl: string;
  instrumentalUrl: string;
}

type SeparatorProgressEvent = {
  stage?: SeparationStage;
  fraction?: number;
  chunk?: number;
  totalChunks?: number;
};

let separatorInstance: MDXSeparator | null = null;

function getSeparator(onProgress: (progress: SeparationProgress) => void): MDXSeparator {
  if (!separatorInstance) {
    separatorInstance = createSeparator("UVR-MDX-NET-Voc_FT", {
      common: {
        logLevel: "warning",
        onProgress: (event: SeparatorProgressEvent) => {
          const fraction = Math.max(0, Math.min(1, event.fraction ?? 0));
          onProgress({
            fraction: 0.08 + fraction * 0.35,
            label: event.stage === SeparationStage.LoadingModel ? "Loading the AI model…" : "Warming up the audio engine…",
            detail: "The model is cached by your browser after the first download.",
          });
        },
      },
      mdx: {
        segmentSize: 256,
        overlap: 0.25,
        batchSize: 1,
        hopLength: 1024,
        executionProviders: ["webgpu", "wasm"],
      },
    });
  }
  return separatorInstance;
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const output = new ArrayBuffer(44 + frames * channels * bytesPerSample);
  const view = new DataView(output);
  const writeText = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeText(0, "RIFF");
  view.setUint32(4, output.byteLength - 8, true);
  writeText(8, "WAVE"); writeText(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, 16, true);
  writeText(36, "data"); view.setUint32(40, frames * channels * bytesPerSample, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
      offset += 2;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

export async function separateTrack(
  file: File,
  onProgress: (progress: SeparationProgress) => void,
): Promise<SeparationResult> {
  let inputUrl: string | null = null;
  let temporaryUrls: string[] = [];
  try {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) throw new Error("This browser does not support Web Audio. Try the latest Chrome or Edge.");
    onProgress({ fraction: 0.03, label: "Decoding audio…", detail: "Reading the selected file locally." });
    const context = new AudioContextClass();
    const sourceBytes = await file.arrayBuffer();
    const decoded = await context.decodeAudioData(sourceBytes.slice(0));
    if (decoded.duration > 12 * 60) throw new Error("This version supports tracks up to 12 minutes long.");
    const wavBlob = audioBufferToWav(decoded);
    inputUrl = URL.createObjectURL(wavBlob);
    await context.close();

    onProgress({ fraction: 0.08, label: "Loading the AI model…", detail: "The first download is about 67 MB; later visits may use the browser cache." });
    const separator = getSeparator(onProgress);
    await separator.loadModel();
    onProgress({ fraction: 0.45, label: "Separating vocals and music…", detail: "This can take a few minutes depending on your device." });
    const outputUrls = await separator.separate(inputUrl);
    temporaryUrls = [...outputUrls];
    if (outputUrls.length < 2) throw new Error("The model did not return both audio stems. Please try again.");
    onProgress({ fraction: 0.78, label: "Preparing downloads…", detail: "Converting the separated stems to WAV." });

    const buffers: AudioBuffer[] = [];
    for (const url of outputUrls.slice(0, 2)) {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not read the model output. Please retry.");
      const audioContext = new AudioContextClass();
      try { buffers.push(await audioContext.decodeAudioData(await response.arrayBuffer())); }
      finally { await audioContext.close(); }
    }
    // MDX's secondary output is the accompaniment; its primary output is the vocal stem.
    const instrumentalUrl = URL.createObjectURL(audioBufferToWav(buffers[0]!));
    const vocalsUrl = URL.createObjectURL(audioBufferToWav(buffers[1]!));
    onProgress({ fraction: 1, label: "All done", detail: "Your stems are ready to preview and download." });
    return { vocalsUrl, instrumentalUrl };
  } catch (error) {
    if (error instanceof Error && /webgpu|wasm|onnx|fetch|network|model/i.test(error.message)) {
      throw new Error(`The audio separation engine could not start. Check your connection for the model download and try the latest Chrome or Edge. Details: ${error.message}`);
    }
    throw error;
  } finally {
    if (inputUrl) URL.revokeObjectURL(inputUrl);
    temporaryUrls.forEach((url) => URL.revokeObjectURL(url));
  }
}
