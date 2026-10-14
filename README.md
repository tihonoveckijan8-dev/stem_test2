# Stem Studio

A browser-based audio separation workspace built with TypeScript, Vite, Web Audio API, ONNX Runtime Web, and the `web-audio-separation` MDX-Net adapter.

## Features
- MP3/WAV upload and drag-and-drop.
- Vocal and instrumental stems with in-browser preview and WAV downloads.
- Progress and readable errors for model loading and separation.
- Audio processing runs in the browser; audio files are not uploaded to an app server.
- GitHub Pages deployment through GitHub Actions.

## Development
- Node.js 20+
- `npm install`
- `npm run dev`
- `npm run typecheck`
- `npm run build`

The first separation downloads the pretrained `UVR-MDX-NET-Voc_FT` model (about 67 MB). Model availability and speed depend on the user's network and browser. WebGPU is preferred when available; WASM is configured as a fallback.

## GitHub Pages
Vite is configured with `base: "/stem_test2/"`. In the repository settings, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The workflow builds `dist` and deploys it.

The library's license does not automatically establish the license or commercial redistribution rights for third-party pretrained model weights; verify model provenance before commercial redistribution.
