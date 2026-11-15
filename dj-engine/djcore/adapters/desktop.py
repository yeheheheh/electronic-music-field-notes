"""Desktop entry point for the portable Windows build."""

from __future__ import annotations

import os
import threading
import time
import urllib.request
import webbrowser

import uvicorn

from djcore.adapters.api import app

PORT = int(os.environ.get("DJ_PORT", "5601"))
PAGE = f"http://127.0.0.1:{PORT}/#/dj/automix"


def _wait_ready(url: str, timeout: float = 40.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=0.5):
                return True
        except Exception:
            time.sleep(0.4)
    return False


def main() -> None:
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True, name="djcore-http")
    thread.start()
    if _wait_ready(f"http://127.0.0.1:{PORT}/api/health"):
        webbrowser.open(PAGE)
    else:
        print(f"服务启动超时，请手动打开 {PAGE}")
    print(f"djcore 正在运行：{PAGE}")
    print("关闭这个窗口即退出。")
    try:
        while thread.is_alive():
            thread.join(0.5)
    except KeyboardInterrupt:
        server.should_exit = True


if __name__ == "__main__":
    main()
