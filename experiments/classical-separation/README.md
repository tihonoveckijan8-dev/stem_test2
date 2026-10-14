# Classical separation experiment (no pretrained models)

This experiment is intentionally isolated from the production browser app. It must not replace the existing separator until measured results are acceptable.

## Goal

Investigate a model-free CPU pipeline using:
1. STFT analysis.
2. HPSS (harmonic/percussive separation).
3. NMF on selected spectrograms.
4. Soft spectral masks and inverse STFT reconstruction.

## Important limitation

This is a research prototype, not a reliable seven-stem separator. HPSS does not identify instruments: its harmonic output can contain vocals, piano, and both guitars; its percussive output can contain drums and transient guitar/piano sounds. NMF decomposes a mixture into spectral components, but without trained source models or suitable reference templates it cannot reliably label those components as vocals, piano, drums, bass, acoustic guitar, electric guitar, and effects.

The prototype must not label guessed components as clean instrument stems. Before any user-facing release, compare outputs on a test set and document leakage/artifacts.

## Runtime architecture

GitHub Pages is static hosting and cannot run the CPU processing job. To keep work off the user's device, the processing pipeline needs a separate CPU backend. Supabase Edge Functions should only authenticate/coordinate the job, not run the audio decomposition itself.

Privacy target:
- no permanent source/result storage;
- temporary job files only;
- remove temporary files in a cleanup/finally path;
- avoid logging audio or signed URLs;
- disclose that temporary server-side processing occurs.

## Benchmark plan

For each test track, record:
- duration, sample rate, channels, input format;
- runtime and peak memory;
- whether output reconstructs the input when stems are summed;
- leakage between vocal/instrument parts;
- audible artifacts for piano, bass, drums, acoustic guitar, electric guitar, and effects.

Start with HPSS + NMF as a baseline and retain a copy of the original mix. Do not claim seven-stem quality unless listening tests confirm each stem is useful.
