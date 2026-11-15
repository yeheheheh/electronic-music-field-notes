"""Master and verify the locally rendered film; no external services."""
from pathlib import Path
import json
import re
import subprocess
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
TL = json.loads((ROOT / 'timeline.json').read_text(encoding='utf-8'))
FINAL = ROOT / 'electronic-field-notes-douyin.mp4'

def run(args):
    return subprocess.run([FF, '-nostdin', '-hide_banner', *args], cwd=ROOT,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          encoding='utf-8', errors='replace', check=True)

def measure(file):
    result = run(['-i', str(file), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])
    blocks = re.findall(r'\{\s*"input_i"[\s\S]*?\}', result.stderr)
    if not blocks:
        raise RuntimeError('No loudness measurement returned')
    return json.loads(blocks[-1])

def timecode(t):
    ms = round(t * 1000)
    return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'

def main():
    source = ROOT / 'soundtrack.wav'
    picture = ROOT / 'picture.mp4'
    assert source.is_file() and picture.is_file()
    first = measure(source)
    # Leave 3 dB pre-codec headroom: AAC reconstruction overshot the -1.5 dB
    # loudnorm ceiling in the initial encode, so the encoded file is remeasured.
    normal = ('loudnorm=I=-14:TP=-3.0:LRA=11:'
              f'measured_I={first["input_i"]}:measured_TP={first["input_tp"]}:'
              f'measured_LRA={first["input_lra"]}:measured_thresh={first["input_thresh"]}:'
              f'offset={first["target_offset"]}:linear=true,aresample=48000')
    temp = ROOT / 'mastering.mp4'
    run(['-y', '-i', str(picture), '-i', str(source), '-map', '0:v:0', '-map', '1:a:0',
         '-c:v', 'copy', '-af', normal, '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
         '-t', str(TL['duration']), '-movflags', '+faststart', '-metadata',
         'title=Electronic Music Field Notes - From Feeling to Making', str(temp)])
    decoded = run(['-v', 'error', '-xerror', '-i', str(temp), '-map', '0:v:0', '-map', '0:a:0',
                   '-progress', 'pipe:1', '-f', 'null', '-'])
    frame_matches = re.findall(r'^frame=(\d+)', decoded.stdout, re.M)
    time_matches = re.findall(r'^out_time_us=(\d+)', decoded.stdout, re.M)
    frames = int(frame_matches[-1])
    duration = int(time_matches[-1]) / 1e6
    assert frames == TL['fps'] * TL['duration'], (frames, TL)
    assert abs(duration - TL['duration']) < 0.08, duration
    metadata = run(['-i', str(temp), '-t', '0.1', '-f', 'null', '-']).stderr
    assert f"{TL['width']}x{TL['height']}" in metadata
    assert '48000 Hz' in metadata and 'stereo' in metadata and 'h264' in metadata
    final_loudness = measure(temp)
    integrated = float(final_loudness['input_i'])
    peak = float(final_loudness['input_tp'])
    assert abs(integrated + 14) <= 1.0, final_loudness
    assert peak <= -1.2, final_loudness
    black = run(['-i', str(temp), '-vf', 'blackdetect=d=0.1:pix_th=0.02:pic_th=0.999', '-an', '-f', 'null', '-'])
    blank_frames = re.findall(r'black_start:[^\n]+', black.stderr)
    assert not blank_frames, blank_frames
    temp.replace(FINAL)
    # Contact sheet sourced from the actual H.264 stream, not the animation source.
    run(['-y', '-i', str(FINAL), '-vf', 'fps=1/2,scale=216:384:flags=lanczos,tile=6x4',
         '-frames:v', '1', '-update', '1', str(ROOT / 'review/final-contact-sheet.jpg')])
    for t in [2, 10, 16, 24, 29, 35.8, 36.3, 40, 44, 47.8]:
        run(['-y', '-ss', str(t), '-i', str(FINAL), '-frames:v', '1', '-update', '1',
             str(ROOT / f'review/final-{t}.jpg')])
    # Half-speed strip around the shared 36-second hit.
    run(['-y', '-ss', '35.2', '-i', str(FINAL), '-vf', 'fps=5,scale=216:384:flags=lanczos,tile=5x2',
         '-frames:v', '1', '-update', '1', str(ROOT / 'review/drop-strip.jpg')])
    srt=[]
    for i, s in enumerate(TL['scenes'], 1):
        title = s['title'].replace('\n', '')
        srt.append(f'{i}\n{timecode(s["start"])} --> {timecode(s["end"])}\n{title}\n{s["caption"]}\n')
    (ROOT / 'electronic-field-notes.srt').write_text('\n'.join(srt), encoding='utf-8-sig')
    report = {
        'file': str(FINAL), 'bytes': FINAL.stat().st_size, 'durationSeconds': duration,
        'frames': frames, 'resolution': [TL['width'], TL['height']], 'fps': TL['fps'],
        'video': 'H.264 yuv420p BT.709', 'audio': 'AAC stereo 48000Hz 320kbps',
        'integratedLUFS': integrated, 'truePeakDBTP': peak,
        'fullDecode': 'passed', 'blankFrames': blank_frames,
        'sourceLayoutAudit': json.loads((ROOT / 'review/layout-audit.json').read_text()),
        'review': '29 source frames + final decoded contact sheet + drop strip. No subjective audio audition performed.',
        'soundtrack': 'Original synthesized electronic composition, no external song samples',
    }
    (ROOT / 'review/final-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
