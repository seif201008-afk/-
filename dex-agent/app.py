import json
import logging
import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser

import requests
from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context

APP_NAME = "Dex"
BASE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
UI_DIR = os.path.join(BASE_DIR, "ui")
DATA_DIR = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "DexAgent")
os.makedirs(DATA_DIR, exist_ok=True)
CHATS_FILE = os.path.join(DATA_DIR, "chats.json")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")
LOG_FILE = os.path.join(DATA_DIR, "dex.log")

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    encoding="utf-8",
)
log = logging.getLogger("dex")

IS_WIN = os.name == "nt"
NO_WINDOW = 0x08000000 if IS_WIN else 0

DEFAULT_SETTINGS = {
    "ollamaUrl": "http://127.0.0.1:11434",
    "defaultModel": "qwen2.5:7b",
    "defaultMode": "chat",
    "autoApprove": False,
    "autoSendVoice": True,
    "whisperModel": "medium",
    "theme": "dark",
    "extraInstructions": "",
}


def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


settings = {**DEFAULT_SETTINGS, **load_json(SETTINGS_FILE, {})}


def ollama_url():
    return settings["ollamaUrl"].rstrip("/")


# ---------- Speech to text ----------

whisper = {"model": None, "state": "idle", "error": ""}
whisper_lock = threading.Lock()


def load_whisper():
    with whisper_lock:
        if whisper["model"] is not None or whisper["state"] == "loading":
            return
        whisper["state"] = "loading"
    try:
        from faster_whisper import WhisperModel

        size = settings["whisperModel"]
        try:
            model = WhisperModel(size, device="cpu", compute_type="int8", local_files_only=True)
        except Exception:
            model = WhisperModel(size, device="cpu", compute_type="int8")
        whisper["model"] = model
        whisper["state"] = "ready"
        whisper["error"] = ""
        log.info("whisper %s ready", size)
    except Exception as e:
        whisper["state"] = "error"
        whisper["error"] = str(e)
        log.exception("whisper load failed")


class Recorder:
    def __init__(self):
        self.stream = None
        self.frames = []
        self.lock = threading.Lock()

    def _callback(self, indata, frames, t, status):
        self.frames.append(indata.copy())

    def start(self):
        import sounddevice as sd

        with self.lock:
            if self.stream is not None:
                return
            self.frames = []
            self.stream = sd.InputStream(
                samplerate=16000, channels=1, dtype="float32", callback=self._callback
            )
            self.stream.start()

    def stop(self):
        import numpy as np

        with self.lock:
            if self.stream is None:
                return None
            self.stream.stop()
            self.stream.close()
            self.stream = None
            frames, self.frames = self.frames, []
        if not frames:
            return None
        return np.concatenate(frames, axis=0)[:, 0]


recorder = Recorder()


# ---------- Tools the agent can call ----------

def run_shell(command, timeout=60):
    if IS_WIN:
        args = [
            "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
            "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " + command,
        ]
    else:
        args = ["bash", "-lc", command]
    try:
        p = subprocess.run(
            args, capture_output=True, timeout=timeout,
            creationflags=NO_WINDOW, cwd=os.path.expanduser("~"),
        )
        out = (p.stdout or b"").decode("utf-8", "replace") + (p.stderr or b"").decode("utf-8", "replace")
        out = out.strip() or f"(اتنفذ من غير مخرجات، كود الخروج {p.returncode})"
    except subprocess.TimeoutExpired:
        out = f"الأمر أخد أكتر من {timeout} ثانية واتوقف."
    return out[:6000]


def ps_quote(s):
    return "'" + s.replace("'", "''") + "'"


def tool_run_command(args):
    return run_shell(str(args.get("command", "")))


def tool_open_app(args):
    name = str(args.get("name", "")).strip()
    if not name:
        return "لازم تحدد اسم البرنامج."
    if IS_WIN:
        out = run_shell(f"Start-Process -FilePath {ps_quote(name)}", timeout=20)
        return f"تم فتح {name}." if out.startswith("(اتنفذ") else out
    subprocess.Popen(["xdg-open", name])
    return f"تم فتح {name}."


def tool_open_url(args):
    url = str(args.get("url", "")).strip()
    if not url:
        return "لازم تحدد الرابط."
    if "://" not in url:
        url = "https://" + url
    if not url.startswith(("http://", "https://")):
        return "مسموح بروابط http و https بس."
    webbrowser.open(url)
    return f"تم فتح الرابط {url}."


def expand_path(p):
    return os.path.abspath(os.path.expandvars(os.path.expanduser(str(p))))


def tool_read_file(args):
    path = expand_path(args.get("path", ""))
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            data = f.read(8000)
        return data or "(الملف فاضي)"
    except OSError as e:
        return f"معرفتش أقرا الملف: {e}"


def tool_write_file(args):
    path = expand_path(args.get("path", ""))
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(str(args.get("content", "")))
        return f"تم حفظ الملف في {path}"
    except OSError as e:
        return f"معرفتش أكتب الملف: {e}"


TOOLS = {
    "run_command": tool_run_command,
    "open_app": tool_open_app,
    "open_url": tool_open_url,
    "read_file": tool_read_file,
    "write_file": tool_write_file,
}


# ---------- Web server ----------

app = Flask(__name__, static_folder=None)


@app.get("/")
def index():
    return send_from_directory(UI_DIR, "index.html")


@app.get("/api/status")
def status():
    models, ok = [], False
    try:
        r = requests.get(ollama_url() + "/api/tags", timeout=2)
        models = [m["name"] for m in r.json().get("models", [])]
        ok = True
    except Exception:
        pass
    return jsonify({
        "ollama": ok,
        "models": models,
        "whisper": whisper["state"],
        "whisperError": whisper["error"],
        "recording": recorder.stream is not None,
    })


@app.route("/api/settings", methods=["GET", "POST"])
def settings_route():
    if request.method == "POST":
        incoming = request.get_json(force=True) or {}
        old_whisper = settings["whisperModel"]
        for k in DEFAULT_SETTINGS:
            if k in incoming:
                settings[k] = incoming[k]
        save_json(SETTINGS_FILE, settings)
        if settings["whisperModel"] != old_whisper:
            whisper.update({"model": None, "state": "idle", "error": ""})
            threading.Thread(target=load_whisper, daemon=True).start()
    return jsonify(settings)


@app.route("/api/chats", methods=["GET", "POST"])
def chats_route():
    if request.method == "POST":
        save_json(CHATS_FILE, request.get_json(force=True) or [])
        return jsonify({"ok": True})
    return jsonify(load_json(CHATS_FILE, []))


@app.post("/api/chat")
def chat():
    payload = request.get_json(force=True)

    def generate():
        try:
            with requests.post(
                ollama_url() + "/api/chat", json=payload, stream=True, timeout=(5, 900)
            ) as r:
                if r.status_code != 200:
                    yield json.dumps({"error": f"Ollama ({r.status_code}): {r.text[:300]}"}) + "\n"
                    return
                for line in r.iter_lines():
                    if line:
                        yield line.decode("utf-8") + "\n"
        except requests.ConnectionError:
            yield json.dumps({"error": "مش قادر أوصل لـ Ollama. اتأكد إنه شغال."}) + "\n"
        except Exception as e:
            yield json.dumps({"error": str(e)}) + "\n"

    return Response(stream_with_context(generate()), mimetype="application/x-ndjson")


@app.post("/api/tool")
def tool():
    body = request.get_json(force=True) or {}
    name = body.get("name")
    args = body.get("arguments") or {}
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except ValueError:
            args = {"command": args}
    fn = TOOLS.get(name)
    if fn is None:
        return jsonify({"output": f"الأداة {name} مش موجودة."})
    log.info("tool %s %s", name, json.dumps(args, ensure_ascii=False)[:500])
    try:
        output = fn(args)
    except Exception as e:
        log.exception("tool failed")
        output = f"حصل خطأ: {e}"
    return jsonify({"output": output})


@app.post("/api/record/start")
def record_start():
    if whisper["model"] is None and whisper["state"] != "loading":
        threading.Thread(target=load_whisper, daemon=True).start()
    try:
        recorder.start()
    except Exception as e:
        log.exception("mic start failed")
        return jsonify({"error": f"مش قادر أفتح الميكروفون: {e}"})
    return jsonify({"ok": True})


@app.post("/api/record/stop")
def record_stop():
    try:
        audio = recorder.stop()
    except Exception as e:
        return jsonify({"error": f"مشكلة في التسجيل: {e}"})
    if audio is None or len(audio) < 16000 * 0.4:
        return jsonify({"error": "التسجيل قصير جدًا، جرب تاني."})
    deadline = time.time() + 180
    while whisper["model"] is None and time.time() < deadline:
        if whisper["state"] == "error":
            return jsonify({"error": "موديل الصوت مش شغال: " + whisper["error"]})
        time.sleep(0.3)
    if whisper["model"] is None:
        return jsonify({"error": "موديل الصوت لسه بيحمّل، استنى شوية وجرب تاني."})
    segments, _ = whisper["model"].transcribe(audio, language="ar", beam_size=5, vad_filter=True)
    text = "".join(s.text for s in segments).strip()
    if not text:
        return jsonify({"error": "مسمعتش كلام واضح، جرب تاني."})
    return jsonify({"text": text})


@app.get("/<path:filename>")
def static_files(filename):
    return send_from_directory(UI_DIR, filename)


# ---------- Startup ----------

def ensure_ollama():
    try:
        requests.get(ollama_url() + "/api/tags", timeout=2)
        return
    except Exception:
        pass
    try:
        subprocess.Popen(
            ["ollama", "serve"], creationflags=NO_WINDOW,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        log.info("started ollama serve")
    except FileNotFoundError:
        log.warning("ollama not found on PATH")


def free_port(preferred=5717):
    for port in [preferred, *range(preferred + 1, preferred + 60)]:
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("no free port")


def wait_for_server(url, timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            requests.get(url + "/api/settings", timeout=1)
            return
        except Exception:
            time.sleep(0.2)


def main():
    headless = "--no-window" in sys.argv
    port = free_port()
    url = f"http://127.0.0.1:{port}"

    threading.Thread(target=ensure_ollama, daemon=True).start()
    if "--no-voice" not in sys.argv:
        threading.Thread(target=load_whisper, daemon=True).start()

    server = threading.Thread(
        target=lambda: app.run(host="127.0.0.1", port=port, threaded=True, use_reloader=False),
        daemon=True,
    )
    server.start()
    wait_for_server(url)
    log.info("server on %s", url)

    if headless:
        print(url, flush=True)
        server.join()
        return

    try:
        import webview
    except ImportError:
        webbrowser.open(url)
        server.join()
        return

    webview.create_window(
        APP_NAME, url, width=1280, height=820, min_size=(900, 600),
        background_color="#262624" if settings["theme"] == "dark" else "#faf9f5",
    )
    webview.start()
    os._exit(0)


if __name__ == "__main__":
    main()
