"""Original 48-second, 120 BPM minimal melodic house ident.

Only writes soundtrack.wav and music-report.json beside this script. No samples,
network, subprocess output files, or package installation. All oscillators,
percussion and ambience are synthesized here with a fixed random seed.
Run with the project's dj-engine/.venv/Scripts/python.exe -B music.py.
"""
from __future__ import annotations

import json
import math
import re
import subprocess
from pathlib import Path

import imageio_ffmpeg
import numpy as np
import soundfile as sf
from scipy import signal

ROOT = Path(__file__).resolve().parent
SR = 48000
DURATION = 48.0
N = int(SR * DURATION)
RNG = np.random.default_rng(4820120)
TAU = 2.0 * np.pi
TARGET_PEAK_DB = -1.8  # Additional margin below the requested -1.5 dB ceiling.


def db(value):
    return float(20.0 * np.log10(max(float(value), 1e-12)))


def rms(x):
    return float(np.sqrt(np.mean(np.square(x, dtype=np.float64))))


def hz(midi):
    return 440.0 * 2.0 ** ((midi - 69.0) / 12.0)


def time_axis(seconds):
    return np.arange(round(seconds * SR), dtype=np.float64) / SR


def smooth_ramp(n):
    return np.sin(np.linspace(0, np.pi / 2, n)) ** 2


def edges(x, attack=0.002, release=0.012):
    x = x.copy()
    a = min(round(attack * SR), len(x))
    r = min(round(release * SR), len(x))
    if a:
        x[:a] *= smooth_ramp(a)
    if r:
        x[-r:] *= smooth_ramp(r)[::-1]
    return x


def filt(x, frequency, kind, order=2):
    return signal.sosfilt(
        signal.butter(order, frequency, btype=kind, fs=SR, output="sos"),
        x, axis=0,
    ).astype(np.float32)


def noise(n, lo, hi):
    x = RNG.standard_normal(n).astype(np.float32)
    x = filt(x, [lo, hi], "bandpass")
    return x / max(rms(x) * 3.5, 1e-9)


STEMS = {
    name: np.zeros((N, 2), dtype=np.float32)
    for name in ("kick", "drums", "bass", "pluck", "lead", "pad", "fx")
}
KICK_TIMES = []
EVENTS = {name: 0 for name in STEMS}


def put(stem, start, voice, gain=1.0, pan=0.0):
    offset = round(start * SR)
    source = 0
    if offset < 0:
        source, offset = -offset, 0
    length = min(len(voice) - source, N - offset)
    if length <= 0:
        return
    v = voice[source:source + length]
    if v.ndim == 1:
        angle = (pan + 1.0) * np.pi / 4.0
        STEMS[stem][offset:offset + length, 0] += v * (gain * np.cos(angle))
        STEMS[stem][offset:offset + length, 1] += v * (gain * np.sin(angle))
    else:
        STEMS[stem][offset:offset + length] += v * gain
    EVENTS[stem] += 1


def kick():
    t = time_axis(0.40)
    # A short pitched body, restrained sub tail and audible low-mid knock.
    frequency = 55.0 + 91.0 * np.exp(-t / 0.016)
    phase = TAU * np.cumsum(frequency) / SR
    body = 0.92 * np.sin(phase) * np.exp(-t / 0.065)
    knock = 0.36 * np.sin(2.0 * phase + 0.12) * np.exp(-t / 0.032)
    click = noise(len(t), 1600, 7200) * 0.095 * np.exp(-t / 0.004)
    x = (body + knock + click) * (1.0 - np.exp(-t / 0.0006))
    return edges(filt(x, 31, "highpass"), 0.0005, 0.025)


def hat(opened=False, brightness=1.0):
    length = 0.235 if opened else 0.060
    t = time_axis(length)
    decay = 0.066 if opened else 0.014
    metal = sum(
        np.sin(TAU * f * t + RNG.uniform(0, TAU))
        for f in (5431, 7177, 8893, 10337)
    ) / 9.0
    air = noise(len(t), 5800, 14500)
    x = (0.76 * air + 0.24 * metal) * np.exp(-t / decay)
    return edges(x * brightness, 0.0007, 0.014)


def clap():
    t = time_axis(0.235)
    n = noise(len(t), 1100, 9500)
    envelope = np.zeros(len(t))
    for delay, level in ((0.0, 0.70), (0.011, 0.85), (0.024, 1.0)):
        dt = np.maximum(0.0, t - delay)
        envelope += (t >= delay) * level * np.exp(-dt / 0.009)
    envelope += (t >= 0.024) * 0.55 * np.exp(-np.maximum(0, t - 0.024) / 0.048)
    body = 0.075 * np.sin(TAU * 191 * t) * np.exp(-t / 0.027)
    return edges(n * envelope + body, 0.0009, 0.022)


def snare():
    t = time_axis(0.15)
    tone = (0.20 * np.sin(TAU * (184 * t + 0.35 * (1 - np.exp(-t / 0.012))))
            + 0.075 * np.sin(TAU * 329 * t)) * np.exp(-t / 0.024)
    wire = noise(len(t), 1700, 10000) * np.exp(-t / 0.036) * 0.75
    return edges(tone + wire, 0.001, 0.02)


def bass(midi, length, accent=1.0):
    t = time_axis(length)
    p = TAU * hz(midi) * t
    # Harmonics carry the line on small speakers; no pure-sub-only bass.
    x = (0.43 * np.sin(p) + 0.54 * np.sin(2 * p + 0.08)
         + 0.29 * np.sin(3 * p) + 0.14 * np.sin(4 * p + 0.14)
         + 0.08 * np.sin(5 * p))
    x = np.tanh(x * 1.18) / 1.20
    envelope = (0.78 + 0.22 * np.exp(-t / 0.085)) * np.exp(-t / 1.3)
    return edges(filt(x * envelope * accent, 38, "highpass"), 0.006, 0.038)


def pluck(midi, brightness=1.0, length=1.10):
    t = time_axis(length)
    f = hz(midi)
    p = TAU * f * t
    x = np.zeros(len(t))
    for harmonic, amplitude in ((1, 0.78), (2, 0.39), (3, 0.20),
                                (4, 0.11), (5, 0.055), (7, 0.033), (9, 0.018)):
        if f * harmonic >= 16500:
            continue
        decay = 0.31 / (1.0 + 0.25 * (harmonic - 1))
        # Tiny decaying phase modulation gives a glass/wood hybrid attack.
        fm = 0.13 * brightness * np.sin(p * 1.003) * np.exp(-t / 0.037)
        x += amplitude * np.sin(harmonic * p + fm) * np.exp(-t / decay)
    return edges(x, 0.003, 0.035).astype(np.float32)


def lead(midi, length):
    t = time_axis(length)
    f = hz(midi)
    p = TAU * f * t + 0.028 * np.sin(TAU * 4.3 * t)
    x = (np.sin(p) + 0.22 * np.sin(2 * p) * np.exp(-t / 0.4)
         + 0.08 * np.sin(3 * p)) * np.exp(-t / 0.8)
    return edges(x, 0.017, 0.16).astype(np.float32)


def pad(notes, length, closing=False):
    t = time_axis(length)
    x = np.zeros((len(t), 2), dtype=np.float64)
    for index, note in enumerate(notes):
        f = hz(note)
        for channel, cents in enumerate((-3.2, 3.2)):
            detune = 2.0 ** ((cents + (index % 3 - 1) * 0.9) / 1200.0)
            p = TAU * f * detune * t + index * 0.61
            shimmer = 1.0 + 0.055 * np.sin(TAU * (0.22 + index * 0.03) * t)
            x[:, channel] += shimmer * (
                np.sin(p) + 0.26 * np.sin(2 * p) + 0.12 * np.sin(3 * p)
                + 0.04 * np.sin(5 * p)
            )
    x *= 0.44 / np.sqrt(len(notes))
    if closing:
        env = (1.0 - np.exp(-t / 0.04)) * np.exp(-t / 0.70)
    else:
        env = np.minimum(t / 0.17, 1.0)
        release = min(0.65, length * 0.4)
        count = round(release * SR)
        env[-count:] *= smooth_ramp(count)[::-1]
    x *= env[:, None]
    x = filt(x, 170, "highpass")
    x = filt(x, 3500, "lowpass")
    x[:144] *= smooth_ramp(144)[:, None]
    x[-1200:] *= smooth_ramp(1200)[::-1, None]
    return x.astype(np.float32)


def whoosh(length, rising=True):
    t = time_axis(length)
    position = t / max(length, 1e-6)
    x = np.empty((len(t), 2), np.float32)
    for c in range(2):
        source = RNG.standard_normal(len(t))
        low = filt(source, [650, 2300], "bandpass")
        high = filt(source, [3500, 10500], "bandpass")
        sweep = position if rising else 1.0 - position
        v = (low * (1.0 - sweep) + high * sweep) / 2.6
        envelope = position ** 1.7 if rising else np.exp(-position * 7.0)
        x[:, c] = edges(v * envelope, 0.022, 0.027)
    return x


def delay_and_room(dry, dotted_gain=0.20, room_gain=0.08):
    result = dry.copy()
    # Tempo-locked ping-pong, then a small filtered early-reflection field.
    for seconds, gain, swap in ((0.375, dotted_gain, True),
                                (0.750, dotted_gain * 0.53, False),
                                (1.125, dotted_gain * 0.25, True)):
        shift = round(seconds * SR)
        v = dry[:-shift, ::-1] if swap else dry[:-shift]
        result[shift:] += filt(v, [430, 6300], "bandpass") * gain
    room_source = filt(dry, [490, 4900], "bandpass")
    for index, seconds in enumerate((0.043, 0.071, 0.113, 0.157, 0.211,
                                      0.281, 0.353, 0.449, 0.577, 0.719)):
        shift = round(seconds * SR)
        v = room_source[:-shift, ::-1] if index % 2 else room_source[:-shift]
        result[shift:] += v * room_gain * np.exp(-seconds / 0.29)
    return result


HARMONY = {
    "Dm": {"root": 38, "pad": [50, 57, 60, 64, 65],
           "motif": [74, 69, 72, 76, 77, 76, 72, 69]},
    "Bb": {"root": 34, "pad": [53, 58, 62, 65, 69],
           "motif": [74, 69, 77, 72, 81, 77, 74, 72]},
    "Gm": {"root": 43, "pad": [55, 58, 62, 65, 69],
           "motif": [74, 70, 69, 77, 79, 77, 74, 70]},
    "Am": {"root": 33, "pad": [52, 57, 60, 64, 67],
           "motif": [72, 69, 76, 79, 81, 79, 76, 72]},
    "A7": {"root": 33, "pad": [52, 57, 61, 64, 67],
           "motif": [73, 69, 76, 79, 81, 79, 76, 73]},
}
BAR_CHORDS = ["Dm", "Dm", "Dm", "Dm", "Bb", "Bb", "Gm", "Gm",
              "Am", "Am", "Dm", "Dm", "Bb", "Bb", "Gm", "Am",
              "Bb", "A7", "Dm", "Dm", "Bb", "Dm", "Dm", "Dm"]


def in_gap(t):
    return 3.5 <= t < 4.0 or 35.5 <= t < 36.0


def intensity(t):
    if t < 4:
        return 0.72
    if t < 8:
        return 0.87
    if t < 14:
        return 0.93
    if t < 20:
        return 0.86
    if t < 26:
        return 0.99
    if t < 32:
        return 1.03
    if t < 36:
        return 0.80
    if t < 38:
        return 1.21
    if t < 42:
        return 1.06
    return 0.94


def compose():
    kick_voice = kick()
    # Four-to-the-floor foundation, deliberately opened up before double drop.
    for beat in range(92):
        t = beat * 0.5
        if in_gap(t) or 32.0 <= t < 34.0:
            continue
        if t < 4 and beat not in (0, 2, 4, 5, 6):
            continue
        put("kick", t, kick_voice, 0.66 * intensity(t))
        KICK_TIMES.append(t)

    for bar in range(23):
        start = bar * 2.0
        energy = intensity(start)
        h = HARMONY[BAR_CHORDS[bar]]
        # Pads change with the edit structure as well as the underlying bars.
        if bar % 2 == 0 or BAR_CHORDS[bar] != BAR_CHORDS[bar - 1] or start in (14, 26, 38, 42):
            duration = 2.25
            if bar < 22 and BAR_CHORDS[bar + 1] == BAR_CHORDS[bar]:
                duration = 4.20
            put("pad", start, pad(h["pad"], duration), 0.16 * energy)

        for offset in (0.5, 1.5):
            t = start + offset
            if in_gap(t) or t < 4 or 32 <= t < 34:
                continue
            put("drums", t + 0.002, clap(), 0.39 * energy, -0.045)
            put("drums", t, snare(), 0.115 * energy, 0.025)

        # Off-beat hats, quiet swung sixteenths, and omitted hits avoid a loop test.
        for step in range(8):
            offbeat = step % 2 == 1
            t = start + step * 0.25 + (0.009 if step % 2 else 0.0)
            if in_gap(t) or (t < 4 and step % 2 == 0):
                continue
            if 32 <= t < 34 and step not in (1, 5):
                continue
            opened = offbeat and t >= 8 and step in ((3, 7) if bar % 2 else (1, 5, 7))
            velocity = (0.266 if opened else (0.28 if offbeat else 0.147))
            velocity *= energy * (0.93 + 0.14 * RNG.random())
            put("drums", t, hat(opened), velocity, 0.22 if offbeat else -0.27)
            if bar >= 5 and bar % 3 != 0 and step in (2, 6) and not (32 <= t < 36):
                put("drums", t + 0.139, hat(False, 0.82), 0.085 * energy, -0.38)

        if bar % 3 == 2 and not 32 <= start < 36:
            for offset, velocity in ((1.25, 0.055), (1.875, 0.09)):
                if not in_gap(start + offset):
                    put("drums", start + offset, snare(), velocity * energy, -0.15)

        # Syncopated mono bass: roots, fifth pickups, occasional octave answers.
        bass_pattern = [(0.0, 0, 0.185, 0.88), (0.25, 0, 0.205, 1.0),
                        (0.75, 0, 0.185, 0.93), (1.0, 12, 0.17, 0.67),
                        (1.25, 0, 0.20, 1.0), (1.75, 7, 0.18, 0.73)]
        if bar % 2:
            bass_pattern[-1] = (1.75, 0, 0.18, 0.88)
        for offset, interval, duration, velocity in bass_pattern:
            t = start + offset
            if in_gap(t) or (t < 4 and offset not in (0.25, 1.25)) or 32 <= t < 34:
                continue
            put("bass", t, bass(h["root"] + interval, duration),
                0.375 * energy * velocity)

        offsets = [0.0, 0.375, 0.75, 1.0, 1.375, 1.75]
        indices = [0, 1, 2, 3, 4, 5] if bar % 2 == 0 else [2, 0, 6, 1, 3, 7]
        if bar < 2:
            offsets, indices = [0.0, 0.75, 1.5], [0, 1, 3]
        elif 14 <= start < 20:
            offsets, indices = [0.0, 0.75, 1.375, 1.75], [0, 2, 4, 6]
        elif 32 <= start < 36:
            offsets = [0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.375, 1.5, 1.625, 1.75, 1.875]
            indices = [0, 1, 2, 3, 4, 5, 6, 7, 4, 5, 3]
        for j, (offset, index) in enumerate(zip(offsets, indices)):
            t = start + offset
            if in_gap(t) or t >= 45.5:
                continue
            velocity = (1.0 if j in (0, 4) else 0.73) * energy
            put("pluck", t, pluck(h["motif"][index]), 0.25 * velocity,
                (-0.23, 0.19, -0.11, 0.26)[j % 4])

    # Deliberate melodic answers, not a constantly repeating arpeggiator.
    for t, note, length, gain in (
        (8.0, 77, 0.72, 0.11), (9.25, 74, 0.65, 0.095),
        (10.75, 72, 0.8, 0.10), (12.0, 74, 1.05, 0.10),
        (20.0, 77, 0.7, 0.115), (21.25, 76, 0.62, 0.11),
        (22.0, 74, 0.9, 0.115), (23.5, 69, 0.9, 0.09),
        (26.0, 77, 0.6, 0.11), (26.75, 81, 0.8, 0.105),
        (28.0, 79, 0.8, 0.11), (29.25, 77, 0.75, 0.11),
        (30.0, 76, 0.8, 0.105), (31.0, 72, 0.8, 0.10),
        (36.0, 86, 0.66, 0.17), (36.75, 81, 0.60, 0.155),
        (37.25, 84, 0.52, 0.16), (37.75, 88, 0.66, 0.145),
        (38.5, 89, 0.8, 0.135), (39.5, 88, 0.55, 0.12),
        (40.0, 86, 0.8, 0.12), (41.0, 84, 0.8, 0.115),
        (42.0, 81, 0.95, 0.12), (43.25, 77, 0.7, 0.115),
        (44.0, 76, 0.7, 0.105), (44.75, 74, 1.10, 0.10),
    ):
        put("lead", t, lead(note, length), gain, 0.055)

    # Half-bar pickups at picture edits; the two requested gaps stay uncovered.
    for cut in (4, 8, 14, 20, 26, 32, 36, 38, 42):
        end = cut - 0.5 if cut in (4, 36) else cut
        length = 0.56 if cut != 36 else 1.18
        put("fx", end - length, whoosh(length), 0.14 if cut != 36 else 0.20)
        reverse = pluck(81 if cut != 36 else 85, length=0.55)[::-1].copy()
        put("fx", end - 0.55, edges(reverse, 0.025, 0.018), 0.115, -0.18)
        if cut != 32:
            put("fx", cut, whoosh(0.68, rising=False), 0.14 if cut != 36 else 0.24)

    # A measured snare acceleration, with increasing velocity and no sub rise.
    build_times = list(np.arange(32.5, 34.0, 0.5))
    build_times += list(np.arange(34.0, 35.0, 0.25))
    build_times += list(np.arange(35.0, 35.5, 0.125))
    for i, t in enumerate(build_times):
        put("drums", float(t), snare(), 0.10 + 0.15 * i / len(build_times),
            0.14 * (-1 if i % 2 else 1))
    # Double drop: bass/kick return simultaneously, plus open harmonic register.
    put("drums", 36.0, clap(), 0.31, 0.0)
    put("pad", 36.0, pad([62, 65, 69, 72, 76], 1.9), 0.11)
    for t in np.arange(36.25, 42, 0.5):
        put("drums", float(t), hat(True, 0.72), 0.115, -0.34)

    # The 46-second cadence is harmonic only. No percussion exists after 46.
    put("pad", 46.0, pad([50, 57, 62, 65, 69, 76], 2.0, closing=True), 0.25)


def mix():
    for stem, depth in (("bass", 0.46), ("pad", 0.34),
                        ("pluck", 0.20), ("lead", 0.14)):
        envelope = np.ones(N, dtype=np.float32)
        t = time_axis(0.34)
        recovery = 1.0 - depth * np.exp(-t / 0.072)
        for onset in KICK_TIMES:
            start = round(onset * SR)
            length = min(len(recovery), N - start)
            envelope[start:start + length] = np.minimum(
                envelope[start:start + length], recovery[:length])
        STEMS[stem] *= envelope[:, None]

    STEMS["pluck"] = delay_and_room(STEMS["pluck"], 0.25, 0.105)
    STEMS["lead"] = delay_and_room(STEMS["lead"], 0.22, 0.10)
    STEMS["pad"] = delay_and_room(STEMS["pad"], 0.065, 0.055)
    STEMS["drums"] = delay_and_room(STEMS["drums"], 0.018, 0.048)

    for name in ("kick", "drums", "bass", "fx"):
        end = 46.0 if name != "bass" else 45.96
        release = 0.035 if name != "fx" else 0.12
        first, last = round((end - release) * SR), round(end * SR)
        STEMS[name][first:last] *= smooth_ramp(last - first)[::-1, None]
        STEMS[name][last:] = 0
    drum_tail_peak = float(np.max(np.abs(STEMS["drums"][46 * SR:])))

    master = sum(STEMS.values())
    master = filt(master, 27, "highpass", 3)
    # Modest broadband tonal shaping, not a loudness maximizer.
    low = filt(master, 120, "lowpass", 2)
    master -= low * 0.10
    master = filt(master, 17400, "lowpass", 2)
    mid = (master[:, 0] + master[:, 1]) * 0.5
    side = (master[:, 0] - master[:, 1]) * 0.5
    side = filt(side, 190, "highpass", 3)
    master[:, 0], master[:, 1] = mid + side, mid - side

    # Pre-fade, near-silent hold, then a short onset fade AFTER each cut.
    gate = np.ones(N, dtype=np.float64)
    for begin, end in ((3.5, 4.0), (35.5, 36.0)):
        a, b = round(begin * SR), round(end * SR)
        pre, post = round(0.023 * SR), round(0.0025 * SR)
        gate[a - pre:a] = 0.0006 + 0.9994 * smooth_ramp(pre)[::-1]
        gate[a:b] = 0.0006
        gate[b:b + post] = 0.0006 + 0.9994 * smooth_ramp(post)
    gate[:96] *= smooth_ramp(96)
    fade_start, fade_end = round(46.80 * SR), round(47.96 * SR)
    gate[fade_start:fade_end] *= smooth_ramp(fade_end - fade_start)[::-1]
    gate[fade_end:] = 0
    master *= gate[:, None]
    assert np.isfinite(master).all()
    # No brickwall limiting or LUFS normalization; preserve the arranged dynamics.
    master *= 10.0 ** (TARGET_PEAK_DB / 20.0) / float(np.max(np.abs(master)))
    return master.astype(np.float32), drum_tail_peak


def ffmpeg_stderr(arguments):
    process = subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-nostdin", *arguments],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
        text=True, encoding="utf-8", errors="replace",
    )
    return process.stderr


def loudness(wav):
    stderr = ffmpeg_stderr([
        "-i", str(wav), "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
        "-f", "null", "-",
    ])
    matches = re.findall(r'\{\s*"input_i"[\s\S]*?\}', stderr)
    if not matches:
        raise RuntimeError("FFmpeg loudnorm did not return input measurements")
    return json.loads(matches[-1])


def band_energy(wav):
    graph = "[0:a]acrossover=split='20 120 500 2000 8000 20000':order=8th"
    graph += "".join(f"[b{i}]" for i in range(7)) + ";"
    graph += ";".join(
        f"[b{i}]astats@band{i}=metadata=0:reset=0:measure_perchannel=none:"
        f"measure_overall=RMS_level[a{i}]" for i in range(7)
    )
    arguments = ["-i", str(wav), "-filter_complex", graph]
    for i in range(7):
        arguments += ["-map", f"[a{i}]"]
    stderr = ffmpeg_stderr(arguments + ["-f", "null", "-"])
    pairs = re.findall(r"\[astats@band(\d+)[^\]]*\] RMS level dB:\s*([-\w.]+)", stderr)
    readings = {int(i): float(level) for i, level in pairs}
    if set(readings) != set(range(7)):
        raise RuntimeError("Incomplete FFmpeg acrossover/astats energy measurements")
    powers = np.array([10.0 ** (readings[i] / 10.0) for i in range(7)])
    labels = ("<20", "20-120", "120-500", "500-2000", "2000-8000", "8000-20000", ">20000")
    return {name: round(float(power / powers.sum() * 100.0), 3)
            for name, power in zip(labels, powers)}


def main():
    timeline = json.loads((ROOT / "timeline.json").read_text(encoding="utf-8-sig"))
    assert timeline["duration"] == 48 and timeline["bpm"] == 120
    assert [scene["start"] for scene in timeline["scenes"]] == [0, 4, 8, 14, 20, 26, 32, 38, 42]
    assert timeline["music"]["nearSilences"] == [[3.5, 4], [35.5, 36]]
    assert timeline["music"]["drop"] == 36 and timeline["music"]["endResolve"] == 46
    compose()
    audio, drum_tail_peak = mix()
    wav = ROOT / "soundtrack.wav"
    sf.write(str(wav), audio, SR, subtype="PCM_24")
    measured = loudness(wav)
    # Account for intersample overshoot as well as sample peaks, if necessary.
    true_peak = float(measured["input_tp"])
    if true_peak > -1.6:
        audio *= 10.0 ** ((-1.75 - true_peak) / 20.0)
        sf.write(str(wav), audio, SR, subtype="PCM_24")
        measured = loudness(wav)
    actual, rate = sf.read(str(wav), dtype="float32", always_2d=True)
    peak_db = db(np.max(np.abs(actual)))
    silence_db = [round(db(rms(actual[round(a * SR):round(b * SR)])), 2)
                  for a, b in ((3.5, 4), (35.5, 36))]
    bars = [round(db(rms(actual[b * SR:(b + 2) * SR])), 2)
            for b in range(0, 48, 2)]
    side = (actual[:, 0] - actual[:, 1]) * 0.5
    mid = actual.mean(axis=1)
    low_side = filt(side, 120, "lowpass", 4)
    low_mid = filt(mid, 120, "lowpass", 4)
    energy = band_energy(wav)
    assert actual.shape == (2304000, 2) and rate == 48000
    assert peak_db <= -1.5 and float(measured["input_tp"]) <= -1.5
    assert max(silence_db) < -55
    assert float(np.max(np.abs(actual[-1920:]))) == 0
    assert drum_tail_peak == 0
    assert np.isfinite(actual).all()
    assert energy["20-120"] < 45, "Rebalance excessive bass before delivery"
    assert int(np.argmax(bars)) * 2 == 36, "Double drop must be the strongest two-second bar"
    report = {
        "files": [str(ROOT / "music.py"), str(wav), str(ROOT / "music-report.json")],
        "format": "48s / 48000Hz / stereo / PCM24 / 120BPM / D minor",
        "ffmpeg": {
            "I_LUFS": float(measured["input_i"]),
            "true_peak_dBTP": float(measured["input_tp"]),
            "LRA_LU": float(measured["input_lra"]),
            "band_energy_percent_Hz": energy,
            "energy_method": "8th-order acrossover + astats RMS, normalized band mean-square",
        },
        "checks": {
            "sample_peak_dBFS": round(peak_db, 3),
            "RMS_dBFS": round(db(rms(actual)), 2),
            "crest_dB": round(peak_db - db(rms(actual)), 2),
            "near_silence_RMS_dBFS": silence_db,
            "strongest_2s_start": int(np.argmax(bars)) * 2,
            "bar_RMS_dBFS": bars,
            "sub120_side_to_mid_dB": round(db(rms(low_side) / rms(low_mid)), 2),
            "drum_stem_peak_after46": drum_tail_peak,
            "last40ms_peak": float(np.max(np.abs(actual[-1920:]))),
            "stereo_correlation": round(float(np.corrcoef(actual.T)[0, 1]), 4),
        },
        "summary": "原创振荡器/噪声合成，无人声、外部采样或版权曲。两处近静音、36秒双drop、46秒停鼓与和弦尾响已数值校验；48秒收净。未主观试听，未做最终-14LUFS归一化。",
    }
    (ROOT / "music-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
