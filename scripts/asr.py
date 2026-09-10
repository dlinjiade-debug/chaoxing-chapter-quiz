"""下载学习通音频并用 vosk 离线转写。

用法:
    python scripts/asr.py <objectId> [<objectId> ...] [--model <模型目录>]

依赖: requests, vosk, imageio-ffmpeg  (见 requirements.txt)
输出: out/asr_<objectId>.txt

注意：vosk 模型目录必须是纯 ASCII 路径（如 C:/asr/vosk-model-small-en-us-0.15），
      中文路径会让 vosk 报 "does not contain model files"。
"""
import os
import sys
import json
import wave
import shutil
import subprocess
import argparse

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
# 库的临时目录一律放到仓库内，避免写到系统盘
_TMP = os.path.join(BASE_DIR, '.tmp')
os.makedirs(_TMP, exist_ok=True)
os.environ['TEMP'] = _TMP
os.environ['TMP'] = _TMP
os.environ['TMPDIR'] = _TMP

import requests  # noqa: E402
import imageio_ffmpeg  # noqa: E402


def load_config():
    p = os.environ.get('CX_CONFIG', os.path.join(BASE_DIR, 'config.json'))
    if not os.path.exists(p):
        sys.exit(f'缺少配置文件 {p}，请先复制 config.example.json')
    return json.load(open(p, encoding='utf-8'))


def build_session(cfg):
    """从 Playwright storageState 还原 Cookie。"""
    s = requests.Session()
    s.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    })
    state_path = cfg.get('storageState', '')
    state_path = state_path if os.path.isabs(state_path) else os.path.join(BASE_DIR, state_path)
    if os.path.exists(state_path):
        st = json.load(open(state_path, encoding='utf-8'))
        for c in st.get('cookies', []):
            if 'chaoxing.com' in (c.get('domain') or ''):
                s.cookies.set(c['name'], c['value'], domain=c.get('domain'), path=c.get('path', '/'))
    else:
        print(f'警告：找不到登录态 {state_path}，未登录可能下载失败')
    return s


def fetch_audio(sess, oid, out_dir):
    r = sess.get(f'https://mooc1.chaoxing.com/ananas/status/{oid}', timeout=30)
    r.raise_for_status()
    meta = r.json()
    name = meta.get('filename') or f'{oid}.mp3'
    url = meta.get('download')
    if not url:
        raise RuntimeError(f'该音频没有下载地址: {meta}')
    safe = ''.join(ch if (ch.isalnum() or ch in '._-') else '_' for ch in name)
    path = os.path.join(out_dir, safe)
    with sess.get(url, timeout=300, stream=True) as resp:
        resp.raise_for_status()
        with open(path, 'wb') as f:
            for chunk in resp.iter_content(65536):
                f.write(chunk)
    return path, name, meta.get('duration')


def to_wav(mp3):
    wav = os.path.splitext(mp3)[0] + '.16k.wav'
    subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-i', mp3, '-ar', '16000', '-ac', '1', '-f', 'wav', wav],
        check=True, capture_output=True)
    return wav


def transcribe(wav, model_path):
    from vosk import Model, KaldiRecognizer, SetLogLevel
    SetLogLevel(-1)
    if not os.path.isdir(model_path):
        sys.exit(f'找不到 vosk 模型: {model_path}')
    model = Model(model_path)
    wf = wave.open(wav, 'rb')
    rec = KaldiRecognizer(model, wf.getframerate())
    rec.SetWords(True)
    parts = []
    while True:
        data = wf.readframes(4000)
        if not data:
            break
        if rec.AcceptWaveform(data):
            parts.append(json.loads(rec.Result()).get('text', ''))
    parts.append(json.loads(rec.FinalResult()).get('text', ''))
    return ' '.join(p for p in parts if p).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('objectids', nargs='+')
    ap.add_argument('--model', default=None, help='vosk 模型目录（纯 ASCII 路径）')
    args = ap.parse_args()

    cfg = load_config()
    model_path = args.model or (cfg.get('asr') or {}).get('modelPath') or 'C:/asr/vosk-model-small-en-us-0.15'
    audio_dir = os.path.join(BASE_DIR, 'out', 'audio')
    out_dir = os.path.join(BASE_DIR, 'out')
    os.makedirs(audio_dir, exist_ok=True)

    sess = build_session(cfg)
    print('登录态已加载' if sess.cookies else '未加载登录态')
    for oid in args.objectids:
        try:
            mp3, name, dur = fetch_audio(sess, oid, audio_dir)
            wav = to_wav(mp3)
            text = transcribe(wav, model_path)
            with open(os.path.join(out_dir, f'asr_{oid}.txt'), 'w', encoding='utf-8') as f:
                f.write(f'{name}\n时长 {dur}s\n\n{text}\n')
            print(f'=== {oid}  {name}  {dur}s')
            print(text)
            print()
        except Exception as e:
            print(f'!! {oid} 失败: {type(e).__name__}: {e}')


if __name__ == '__main__':
    main()
