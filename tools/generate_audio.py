#!/usr/bin/env python3
"""절차 생성 오디오. BGM 3종과 SFX 3종을 만든다.

왜 스크립트로 두는가:
  오디오는 바이너리라 diff 로 검토할 수 없다. 생성 규칙을 코드로 남겨야
  "이 소리가 왜 이런가" 를 나중에 되짚고 같은 파일을 재생성할 수 있다.

BGM 은 seamless loop 가 요구사항이다(docs/game-design/04-art-audio-bible.md).
그래서 모든 성분의 주기가 전체 길이를 정수로 나누도록 잡는다 — 끝과 시작이
샘플 단위로 이어져 이음매에 공백이 생기지 않는다.

BGM 은 `game-sound-pipeline` 산출물로 교체할 자리다. 여기서는 그 파이프라인이
없는 환경에서도 배선과 예산 게이트를 검증할 수 있도록 플레이스홀더를 만든다.
"""
import argparse
import math
import subprocess
import wave
from pathlib import Path

import numpy as np

RATE = 44100


def _adsr(n: int, attack: float, decay: float) -> np.ndarray:
    """하프·첼레스타처럼 때리고 사라지는 소리의 포락선."""
    a = max(1, int(attack * RATE))
    env = np.exp(-np.arange(n) / max(1.0, decay * RATE))
    env[:a] *= np.linspace(0.0, 1.0, a)
    return env


def _voice(freq: float, n: int, harmonics=(1.0, 0.5, 0.25)) -> np.ndarray:
    t = np.arange(n) / RATE
    out = np.zeros(n)
    for i, amp in enumerate(harmonics, start=1):
        out += amp * np.sin(2.0 * math.pi * freq * i * t)
    return out / sum(harmonics)


def _pad(freqs, total: int, cycles: int) -> np.ndarray:
    """루프 경계에서 위상이 0 으로 맞도록 주기를 총 길이에 정렬한다."""
    t = np.arange(total) / total
    out = np.zeros(total)
    for f in freqs:
        # 총 길이 안에 정확히 정수 번 들어가는 주파수로 반올림한다.
        k = max(1, round(f * total / RATE))
        out += np.sin(2.0 * math.pi * k * t)
    return out / len(freqs)


def _place(buf: np.ndarray, sample: np.ndarray, at: int) -> None:
    """루프를 넘어가는 꼬리는 앞으로 감아 넣는다. 이음매를 없애는 핵심이다."""
    n = len(buf)
    idx = (np.arange(len(sample)) + at) % n
    np.add.at(buf, idx, sample)


def bgm_main(seconds: float = 90.0) -> np.ndarray:
    """고요하고 따뜻한 배경음. 펜타토닉 아르페지오 + 낮은 패드."""
    total = int(seconds * RATE)
    buf = _pad([110.0, 164.81, 220.0], total, 1) * 0.16
    scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]
    step = int(RATE * 1.5)
    for i in range(total // step):
        freq = scale[(i * 3 + (i // 4)) % len(scale)]
        n = min(int(RATE * 2.2), total)
        note = _voice(freq, n, (1.0, 0.35, 0.12)) * _adsr(n, 0.01, 0.55) * 0.22
        _place(buf, note, i * step)
    return buf


def bgm_event(seconds: float = 60.0) -> np.ndarray:
    """호기심 어린 중간 템포. 피치카토 + 목관."""
    total = int(seconds * RATE)
    buf = _pad([146.83, 220.0], total, 1) * 0.12
    scale = [293.66, 349.23, 392.00, 440.00, 587.33]
    step = int(RATE * 0.5)
    for i in range(total // step):
        freq = scale[(i * 2) % len(scale)]
        n = min(int(RATE * 0.45), total)
        pluck = _voice(freq, n, (1.0, 0.6, 0.3)) * _adsr(n, 0.004, 0.09) * 0.2
        _place(buf, pluck, i * step)
        if i % 4 == 0:
            m = min(int(RATE * 1.6), total)
            wind = _voice(freq / 2.0, m, (1.0, 0.15)) * _adsr(m, 0.12, 0.5) * 0.14
            _place(buf, wind, i * step)
    return buf


def bgm_milestone(seconds: float = 60.0) -> np.ndarray:
    """긴장되지만 과하지 않은 시험 장면. 낮은 현 + 팀파니."""
    total = int(seconds * RATE)
    buf = _pad([98.0, 123.47, 146.83], total, 1) * 0.2
    step = int(RATE * 2.0)
    rng = np.random.default_rng(20260826)
    for i in range(total // step):
        n = min(int(RATE * 0.9), total)
        env = _adsr(n, 0.005, 0.22)
        drum = (_voice(58.0 + (i % 3) * 6.0, n, (1.0, 0.3))
                + rng.normal(0.0, 0.25, n)) * env * 0.28
        _place(buf, drum, i * step)
    return buf


def sfx_tap() -> np.ndarray:
    n = int(RATE * 0.08)
    return _voice(880.0, n, (1.0, 0.4)) * _adsr(n, 0.002, 0.02) * 0.5


def sfx_confirm() -> np.ndarray:
    n = int(RATE * 0.28)
    out = np.zeros(n)
    for i, f in enumerate([523.25, 659.25, 783.99]):
        seg = _voice(f, n, (1.0, 0.3)) * _adsr(n, 0.003, 0.09) * 0.36
        _place(out, seg, int(i * RATE * 0.05))
    return out


def sfx_page() -> np.ndarray:
    n = int(RATE * 0.16)
    rng = np.random.default_rng(7)
    noise = rng.normal(0.0, 1.0, n)
    # 저역을 걷어낸 종이 스치는 소리. 이동평균 차분이 하이패스 역할을 한다.
    smooth = np.convolve(noise, np.ones(48) / 48.0, mode="same")
    return (noise - smooth) * _adsr(n, 0.01, 0.05) * 0.35


def write_wav(path: Path, data: np.ndarray) -> None:
    peak = float(np.max(np.abs(data))) or 1.0
    pcm = np.clip(data / peak * 0.89, -1.0, 1.0)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)          # 모노. 스테레오는 예산을 넘긴다
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes((pcm * 32767.0).astype("<i2").tobytes())


def encode_ogg(src: Path, dst: Path, bitrate: str) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
         "-ac", "1", "-c:a", "libvorbis", "-b:a", bitrate, str(dst)],
        check=True,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?", default="assets/audio")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    tmp = out / ".tmp.wav"

    plan = [
        ("bgm_main", bgm_main(), "56k", 550 * 1024),
        ("bgm_event", bgm_event(), "56k", 400 * 1024),
        ("bgm_milestone", bgm_milestone(), "56k", 400 * 1024),
        ("sfx_tap", sfx_tap(), "48k", 30 * 1024),
        ("sfx_confirm", sfx_confirm(), "48k", 30 * 1024),
        ("sfx_page", sfx_page(), "48k", 30 * 1024),
    ]
    failed = 0
    for name, data, bitrate, limit in plan:
        write_wav(tmp, data)
        dst = out / f"{name}.ogg"
        encode_ogg(tmp, dst, bitrate)
        size = dst.stat().st_size
        mark = "OK " if size <= limit else "OVER"
        print(f"  {mark} {name}.ogg {size / 1024:.1f} KB (상한 {limit / 1024:.0f} KB)")
        if size > limit:
            failed += 1
    tmp.unlink(missing_ok=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
