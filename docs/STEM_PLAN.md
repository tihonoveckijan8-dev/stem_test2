# Stem Studio — audit and implementation plan

> Stage 0 audit only. No application code or dependencies were changed in this stage.
> The dependency source reviewed online is `incidentist/web-audio-separation`; the repository does not commit `node_modules`, so the installed package files could not be inspected directly through GitHub. Before implementation, re-check the exact installed `node_modules/web-audio-separation` version (the app declares `^0.3.1`, while the public upstream main/package metadata currently reports `0.3.0`).

## 1. Current pipeline and library findings

### Existing app

- `src/model/StemSeparator.ts` creates `UVR-MDX-NET-Voc_FT`, sets `segmentSize: 256`, `overlap: 0.25`, `batchSize: 1`, `hopLength: 1024`, and `executionProviders: ["webgpu", "wasm"]`.
- The current app decodes the input in the main thread, encodes an intermediate 16-bit WAV, passes a blob URL to the library, decodes two output URLs, and encodes those to WAV again. This creates avoidable copies and blocks the UI during CPU-heavy work.
- The app's current 12-minute duration guard is fixed, not derived from available memory.
- The library caches model bytes in Cache Storage under `web-demix2-models`, but the reviewed implementation does not verify SHA-256 before creating the ONNX session. Its progress events are stage/chunk progress, not a streamed byte counter.
- The library's ONNX session and PFFFT-based STFT/ISTFT are internal to the adapter. The current API exposes blob URLs for two output stems, not raw `Float32Array` buffers or worker cancellation/session disposal controls.

### Architecture and model support

The public upstream source currently supports **MDX only**. Its registry contains MDX models including `UVR-MDX-NET-Voc_FT`, `Kim_Vocal_2`, `UVR_MDXNET_Main`, and `UVR_MDXNET_KARA_2`. The architecture discriminant is prepared for future architectures, but MDX23C, BS-Roformer, and Demucs are not registered as supported architectures in this library. The current model API is a two-stem separator: a primary source plus a derived secondary source. It does not turn a two-stem model into four independent stems.

Relevant MDX configuration:
- `segmentSize`, `overlap`, `batchSize`, `hopLength` configure its chunked spectrogram inference.
- STFT/ISTFT is performed with the library's PFFFT WASM implementation on typed arrays.
- ONNX Runtime execution providers are configured in preference order; the library configures `["webgpu", "wasm"]` by default.
- WASM is single-threaded unless `crossOriginIsolated` is true, when the implementation enables a bounded thread count. GitHub Pages cannot set COOP/COEP response headers directly, so that optimization cannot be assumed.
- The adapter's normalization is peak-based. It is not the HT-Demucs mean/std normalization described in the requested target pipeline.

Sources reviewed: [library README](https://github.com/incidentist/web-audio-separation), [model registry](https://github.com/incidentist/web-audio-separation/blob/main/src/models/registry.ts), [MDX separator](https://github.com/incidentist/web-audio-separation/blob/main/src/separator/architectures/mdx_separator.ts), [common separator](https://github.com/incidentist/web-audio-separation/blob/main/src/separator/common_separator.ts).

## 2. Vocals/instrumental output-order audit

The source registry defines `UVR-MDX-NET-Voc_FT` with `primary_stem: 'Vocals'`. The factory derives `primaryStemName = 'vocals'` and `secondaryStemName = 'instrumental'`. In the reviewed MDX implementation, output URLs are appended in secondary-then-primary order. Therefore, **the current mapping of `outputUrls[0]` to Instrumental and `outputUrls[1]` to Vocals is consistent with that implementation's output order**; the nearby comment is also consistent with this interpretation.

**Real-track verification is not complete.** No audio fixture was provided, and this audit environment cannot run the user's browser or installed app, so it would be dishonest to claim a listening test or measured correlation. Before changing the mapping, run a real vocal recording through the currently installed package and confirm that output 1 contains vocals and output 0 contains accompaniment (e.g. listen and compare RMS/correlation against the input). Keep the mapping unchanged until that test is recorded. If the installed `0.3.1` code differs from upstream main, the installed code takes precedence.

## 3. Model options

| Option | Quality potential | Weights / delivery | Browser performance | Engineering and licensing |
|---|---|---|---|---|
| **A. HT-Demucs / htdemucs ONNX, 4 stems** | Strong general-purpose 4-stem baseline; quality is model-variant dependent. Standard `htdemucs` is not the higher-quality FT specialist bag. | Public `StemSplitio/htdemucs-onnx` documents a single-file fp16-weights model around **166 MB**, above the 100 MB per-file hosting constraint, so it must be fetched from external CORS-enabled hosting. Four-stem FT bag is much larger (multiple models). | ONNX Runtime Web can use WebGPU where supported and WASM otherwise. Actual browser performance on this app's supported devices has not been measured. | Moderate/high: model-specific input/output tensor contract, external STFT/iSTFT, segment overlap-add, worker lifecycle, integrity and cache layer. The cited model card declares MIT for the ONNX export and attributes the upstream HT-Demucs weights to MIT; pin a reviewed model revision and retain license/notice. |
| **B. Another architecture (MDX23C / BS-Roformer)** | Can be excellent for some sources, but quality depends on the exact model and training set; no browser-ready 4-stem export is established by the current dependency. | Often substantially larger than 100 MB; exact chosen model and provenance must be checked individually. | Unknown without a specific ONNX graph and target-device benchmark. | Highest uncertainty: export/operator compatibility, dynamic shapes, tensor contracts and weights licensing all need independent validation. Not recommended as the first implementation. |
| **C. Cascade current MDX vocals/instrumental, then split instrumental** | Can reuse the existing vocal model, but the second model adds errors and latency; no suitable, verified second-stage four-source model is present in the current adapter. It cannot be claimed to match Demucs quality without benchmarks. | First model is about 67 MB; second model size/license/hosting depends on selection. | At least two inference passes; likely slower and more memory intensive than one 4-stem model. | Lower first-step change but more complex final pipeline and weaker quality rationale. Useful only as a fallback if a compatible single-model ONNX export cannot be shipped. |

Model references:
- [StemSplit htdemucs model table and published measurements](https://github.com/StemSplit/demucs-onnx/blob/main/docs/models.md)
- [Browser integration and model sizes](https://github.com/StemSplit/demucs-onnx/blob/main/docs/browser.md)
- [Hugging Face htdemucs ONNX model card](https://huggingface.co/StemSplitio/htdemucs-onnx)

Published performance figures in those sources are not measurements from Stem Studio and must not be presented as this app's benchmark.

## 4. Recommendation

**Recommend Option A: a single-file `htdemucs` 4-stem ONNX export with fp16-stored weights, STFT/iSTFT outside the ONNX graph, and a dedicated module worker.** It directly predicts vocals, drums, bass, and other rather than chaining two models. Keep the model hosted externally (Hugging Face or another stable CORS-enabled origin), pin an immutable revision/file, stream the response, compute SHA-256 with Web Crypto before caching/using it, and keep the model file outside the GitHub Pages repository so the 100 MB repository asset limit is not violated.

Important qualifications:
- fp16-stored weights reduce download size, but the cited export computes in fp32 at runtime; this does **not** halve runtime tensor memory or guarantee faster inference.
- A 166 MB download still exceeds the requested 100 MB model-file ceiling, so a single request is okay only if the ceiling applies to repository-hosted files. If the app must also avoid a >100 MB single remote file, use a verified chunked/range-capable distribution scheme or a smaller model; do not split ONNX bytes into arbitrary chunks and pass them directly to ORT without a reassembly/cache implementation.
- Do not promise “quality no worse than Demucs” as an absolute claim. This is a Demucs model, but the single `htdemucs` export is not the `htdemucs_ft` specialist bag and quality must be evaluated on a fixed local test set.
- Six stems can be considered later with `htdemucs_6s` (vocals, drums, bass, other, guitar, piano) only after the four-stem pipeline is validated. It is a different model, not an option exposed by the current MDX adapter.

**Fallback:** Option C only if a reproducible browser-compatible four-stem ONNX model cannot be safely loaded under the project's hosting constraints. It is not the preferred quality/performance path.

## 5. Licensing audit

- `web-audio-separation` declares **MIT** in its public package metadata and repository.
- The current UVR-MDX-NET-Voc_FT weight is hosted by multiple third parties. The reviewed registry points to a mirror; a Hugging Face file page shows a SHA-256, but mirror metadata alone is not enough to establish the original weight author's complete license/provenance. **Treat the current UVR weight license as not fully established from the evidence reviewed; do not infer it from the wrapper's MIT license.**
- The cited StemSplit `htdemucs` ONNX model repository explicitly declares MIT for its export and identifies the original HT-Demucs weights as MIT. Use a pinned revision and include the applicable MIT notice and model attribution in README's Licenses section before distributing it.
- ONNX Runtime Web's own license and any bundled WASM/FFT notices must also be preserved when changing the pipeline.

## 6. Planned implementation sequence (not performed in Stage 0)

1. Add a worker protocol (`progress`, `done`, `error`, `cancel`) and move decode/resample/inference/overlap-add/WAV preparation off the main thread.
2. Implement deterministic stereo/44.1 kHz conversion, model-correct normalization, chunk overlap-add and tested WAV/ZIP writers.
3. Add a pinned external model manifest (URL, revision, expected byte length, SHA-256, license metadata), streaming download progress, integrity check, Cache Storage/OPFS versioning and cache deletion UI.
4. Implement one 4-stem output contract, then a synchronized Web Audio mixer with Solo/Mute/volume and downloads.
5. Add unit tests and a Python reference script. Compare per-stem outputs on a fixed, legally distributable test clip; report actual SNR/correlation and device/browser performance, not estimates.
6. Review memory limits, cancellation/session cleanup, offline behavior, GitHub Pages worker asset paths under `/stem_test2/`, and README/QA documentation.

## 7. Stage 0 verification status

- Source/config review: **completed** from repository files and public upstream source.
- Local commands (`npm run typecheck`, `npm run build`): **not run** in this audit; no checkout/runtime was available through the GitHub connector.
- Real-track output-order check: **pending**; no test audio was supplied and no actual inference/listening was run.
- No code, dependency, model, or UI changes were made in this stage.
