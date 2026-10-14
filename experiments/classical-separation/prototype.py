#!/usr/bin/env python3
"""Model-free HPSS + NMF experiment. This exports components, not labeled instrument stems."""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from sklearn.decomposition import NMF


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--output-dir', type=Path, default=Path('classical-output'))
    parser.add_argument('--components', type=int, default=8)
    parser.add_argument('--iterations', type=int, default=100)
    parser.add_argument('--max-seconds', type=float, default=180)
    args = parser.parse_args()
    if args.components < 2 or args.components > 32:
        parser.error('--components must be between 2 and 32')
    if args.iterations < 10 or args.iterations > 500:
        parser.error('--iterations must be between 10 and 500')

    started = time.perf_counter()
    audio, sr = librosa.load(args.input, sr=None, mono=True, duration=args.max_seconds)
    if audio.size == 0:
        raise SystemExit('No audio samples decoded.')
    args.output_dir.mkdir(parents=True, exist_ok=True)

    # HPSS gives broad harmonic/percussive groups; it does not recognize instruments.
    stft = librosa.stft(audio)
    harmonic_stft, percussive_stft = librosa.decompose.hpss(stft)
    groups = {'harmonic': harmonic_stft, 'percussive': percussive_stft}

    for group_name, group_stft in groups.items():
        magnitude = np.abs(group_stft).astype(np.float32)
        phase = np.exp(1j * np.angle(group_stft))
        # NMF factors this spectrogram into mathematical components, not named sources.
        factorizer = NMF(
            n_components=args.components,
            init='nndsvda',
            solver='cd',
            max_iter=args.iterations,
            random_state=0,
        )
        activations = factorizer.fit_transform(magnitude.T).T
        templates = factorizer.components_
        estimate = templates.T @ activations
        denominator = np.maximum(estimate, 1e-8)
        for index in range(args.components):
            # Soft masks split this broad group among NMF components.
            component_estimate = np.outer(templates[index], activations[index])
            mask = component_estimate / denominator
            masked_stft = group_stft * np.clip(mask, 0.0, 1.0)
            reconstructed = librosa.istft(masked_stft, length=len(audio))
            out_path = args.output_dir / f'{group_name}_component_{index + 1:02d}.wav'
            sf.write(out_path, reconstructed, sr)

        reconstructed_group = librosa.istft(group_stft, length=len(audio))
        sf.write(args.output_dir / f'{group_name}_baseline.wav', reconstructed_group, sr)

    sf.write(args.output_dir / 'reference_mono.wav', audio, sr)
    elapsed = time.perf_counter() - started
    print(f'Finished {len(audio) / sr:.1f}s audio in {elapsed:.1f}s at {sr} Hz.')
    print(f'Wrote experimental components to: {args.output_dir.resolve()}')
    print('WARNING: components are NOT reliable labels for vocals, piano, drums, bass, guitars, or effects.')


if __name__ == '__main__':
    main()
