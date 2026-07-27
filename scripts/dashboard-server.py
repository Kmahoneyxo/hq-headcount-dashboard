#!/usr/bin/env python3
"""Serve the dashboard with a Refresh button that triggers a data update.

Usage:
  python3 scripts/dashboard-server.py

Open http://localhost:8080 and click **Refresh data**.

The button calls POST /api/refresh, which runs DASHBOARD_REFRESH_CMD (if set) and
returns the updated snapshot from dashboard/data/headcount.json.

Example — refresh from a CSV export you dropped in dashboard/data/export.csv:
  DASHBOARD_REFRESH_CMD="python3 scripts/csv-to-dashboard-json.py dashboard/data/export.csv" \\
    python3 scripts/dashboard-server.py

Example — custom script that calls Quest and writes headcount.json:
  DASHBOARD_REFRESH_CMD="./scripts/refresh-from-quest.sh" python3 scripts/dashboard-server.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "dashboard"
JSON_OUT = DASHBOARD / "data" / "headcount.json"
REFRESH_CMD = os.environ.get("DASHBOARD_REFRESH_CMD", "")


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DASHBOARD), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/data/config.json":
            self.send_json(
                {
                    "refresh_api": "/api/refresh",
                    "live_refresh": bool(REFRESH_CMD),
                }
            )
            return
        return super().do_GET()

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/api/refresh":
            self.send_error(404)
            return
        try:
            if REFRESH_CMD:
                subprocess.run(REFRESH_CMD, shell=True, check=True, cwd=str(ROOT))
            elif not JSON_OUT.exists():
                raise RuntimeError(
                    "Set DASHBOARD_REFRESH_CMD to update data, or add dashboard/data/headcount.json"
                )
            payload = json.loads(JSON_OUT.read_text(encoding="utf-8"))
            payload["refreshed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            JSON_OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
            self.send_json(
                {
                    "ok": True,
                    "updated_at": payload.get("updated_at"),
                    "refreshed_at": payload["refreshed_at"],
                    "markets": len(payload.get("markets", [])),
                    "live": bool(REFRESH_CMD),
                }
            )
        except subprocess.CalledProcessError as exc:
            self.send_json({"ok": False, "error": f"Refresh command failed (exit {exc.returncode})"}, status=500)
        except Exception as exc:  # noqa: BLE001
            self.send_json({"ok": False, "error": str(exc)}, status=500)

    def send_json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - [%s] %s\n" % (self.log_date_time_string(), self.client_address[0], fmt % args))


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), DashboardHandler)
    print(f"Dashboard: http://localhost:{port}")
    if REFRESH_CMD:
        print(f"Refresh command: {REFRESH_CMD}")
    else:
        print("Refresh command: not set (button reloads JSON file only)")
        print("  Set DASHBOARD_REFRESH_CMD to run query 10 before each refresh")
    server.serve_forever()


if __name__ == "__main__":
    main()
