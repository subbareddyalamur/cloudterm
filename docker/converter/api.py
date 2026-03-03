"""
Recording Converter API — converts .guac recordings to .mp4 using guacenc + ffmpeg.

Endpoints:
  POST /convert   {filename}  → {job_id}
  GET  /status/<job_id>       → {status, output, error}
  GET  /health                → 200 OK
"""

import http.server
import json
import os
import subprocess
import threading
import time
import uuid

RECORDINGS_DIR = os.environ.get("RECORDINGS_DIR", "/app/recordings")
PORT = int(os.environ.get("PORT", "5002"))

# In-memory job store.
jobs = {}


def convert_recording(job_id, filename):
    """Background worker: guacenc .guac → .m4v, then ffmpeg → .mp4"""
    jobs[job_id]["status"] = "running"

    src = os.path.join(RECORDINGS_DIR, filename)
    if not os.path.isfile(src):
        jobs[job_id].update(status="error", error="File not found")
        return

    base, ext = os.path.splitext(filename)
    m4v_path = src + ".m4v"      # guacenc appends .m4v
    mp4_path = os.path.join(RECORDINGS_DIR, base + ".mp4")

    try:
        if ext == ".guac":
            # guacenc converts .guac → .guac.m4v
            r = subprocess.run(
                ["guacenc", "-f", "-s", "1904x1159", src],
                capture_output=True, text=True, timeout=600,
            )
            if r.returncode != 0:
                jobs[job_id].update(status="error", error=r.stderr or "guacenc failed")
                return

            # Remux .m4v → .mp4 for broader compatibility
            if os.path.isfile(m4v_path):
                r2 = subprocess.run(
                    ["ffmpeg", "-y", "-i", m4v_path, "-c", "copy", mp4_path],
                    capture_output=True, text=True, timeout=600,
                )
                # Clean up intermediate .m4v
                try:
                    os.remove(m4v_path)
                except OSError:
                    pass
                if r2.returncode != 0:
                    jobs[job_id].update(status="error", error=r2.stderr or "ffmpeg failed")
                    return
            else:
                jobs[job_id].update(status="error", error=".m4v not created by guacenc")
                return

        elif ext == ".cast":
            # .cast → .gif via agg, then .gif → .mp4 via ffmpeg
            gif_path = os.path.join(RECORDINGS_DIR, base + ".gif")
            r = subprocess.run(
                ["agg", "--font-size", "14", src, gif_path],
                capture_output=True, text=True, timeout=600,
            )
            if r.returncode != 0:
                jobs[job_id].update(status="error", error=r.stderr or "agg failed")
                return

            if os.path.isfile(gif_path):
                r2 = subprocess.run(
                    ["ffmpeg", "-y", "-i", gif_path,
                     "-movflags", "faststart", "-pix_fmt", "yuv420p",
                     "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                     mp4_path],
                    capture_output=True, text=True, timeout=600,
                )
                try:
                    os.remove(gif_path)
                except OSError:
                    pass
                if r2.returncode != 0:
                    jobs[job_id].update(status="error", error=r2.stderr or "ffmpeg failed")
                    return
            else:
                jobs[job_id].update(status="error", error=".gif not created by agg")
                return

        else:
            jobs[job_id].update(status="error", error="Unknown format: " + ext)
            return

        output_name = base + ".mp4"
        jobs[job_id].update(status="done", output=output_name)

    except subprocess.TimeoutExpired:
        jobs[job_id].update(status="error", error="Conversion timed out")
    except Exception as e:
        jobs[job_id].update(status="error", error=str(e))


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[converter] {fmt % args}")

    def _json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"status": "ok"})
            return

        if self.path.startswith("/status/"):
            job_id = self.path[len("/status/"):]
            job = jobs.get(job_id)
            if not job:
                self._json(404, {"error": "Job not found"})
                return
            self._json(200, {
                "status": job["status"],
                "output": job.get("output", ""),
                "error": job.get("error", ""),
            })
            return

        self._json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path == "/convert":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            filename = body.get("filename", "")
            if not filename:
                self._json(400, {"error": "filename required"})
                return

            # Check if already converting or done.
            for jid, j in jobs.items():
                if j["filename"] == filename and j["status"] in ("pending", "running"):
                    self._json(200, {"job_id": jid, "status": j["status"]})
                    return
                if j["filename"] == filename and j["status"] == "done":
                    self._json(200, {"job_id": jid, "status": "done", "output": j.get("output", "")})
                    return

            job_id = uuid.uuid4().hex[:12]
            jobs[job_id] = {"filename": filename, "status": "pending"}
            t = threading.Thread(target=convert_recording, args=(job_id, filename), daemon=True)
            t.start()
            self._json(202, {"job_id": job_id})
            return

        self._json(404, {"error": "Not found"})


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[converter] Listening on port {PORT}")
    print(f"[converter] Recordings dir: {RECORDINGS_DIR}")
    # Verify guacenc is available.
    try:
        subprocess.run(["guacenc", "-v"], capture_output=True, timeout=5)
        print("[converter] guacenc: available")
    except Exception as e:
        print(f"[converter] WARNING: guacenc not available: {e}")
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        print("[converter] ffmpeg: available")
    except Exception as e:
        print(f"[converter] WARNING: ffmpeg not available: {e}")
    try:
        subprocess.run(["agg", "--version"], capture_output=True, timeout=5)
        print("[converter] agg: available")
    except Exception as e:
        print(f"[converter] WARNING: agg not available: {e}")
    server.serve_forever()
