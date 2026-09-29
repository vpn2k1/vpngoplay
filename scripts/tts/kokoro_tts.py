"""Synthesises the clips planned by `node scripts/generate-audio.mjs --plan jobs.json` with
Kokoro-82M (Apache-2.0) and writes them as MP3 (needs ffmpeg). Runs on GitHub Actions
(.github/workflows/audio.yml), so nothing has to be installed on a developer machine.

    python scripts/tts/kokoro_tts.py jobs.json
"""

import json
import os
import subprocess
import sys

import numpy as np
from kokoro import KModel, KPipeline

REPO = "hexgrad/Kokoro-82M"
SAMPLE_RATE = 24000
SPEED = float(os.environ.get("TTS_SPEED", "0.95"))


def main(plan_path: str) -> int:
    with open(plan_path, encoding="utf-8") as f:
        jobs = json.load(f)
    if not jobs:
        print("nothing to synthesise")
        return 0

    model = KModel(repo_id=REPO).eval()  # one model shared by the language pipelines
    pipelines: dict[str, KPipeline] = {}
    failed = 0
    for i, job in enumerate(jobs, 1):
        try:
            code = job["kokoroLang"]
            if code not in pipelines:
                pipelines[code] = KPipeline(lang_code=code, repo_id=REPO, model=model)
            chunks = [r.audio.numpy() for r in pipelines[code](job["text"], voice=job["voice"], speed=SPEED) if r.audio is not None]
            if not chunks:
                raise RuntimeError("no audio produced")
            pcm = (np.clip(np.concatenate(chunks), -1, 1) * 32767).astype("<i2").tobytes()
            os.makedirs(os.path.dirname(job["out"]), exist_ok=True)
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "1",
                 "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "48k", job["out"]],
                input=pcm,
                check=True,
            )
        except Exception as e:  # keep going; the manifest only lists clips that exist
            failed += 1
            print(f"✗ [{job['lang']}] {job['text']}: {e}", file=sys.stderr, flush=True)
        if i % 50 == 0 or i == len(jobs):
            print(f"{i}/{len(jobs)} clips ({failed} failed)", flush=True)

    # A few odd texts may fail; a broken setup fails most of them.
    return 1 if failed > max(5, len(jobs) // 10) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
