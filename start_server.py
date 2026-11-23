from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import errno
import os
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORTS = range(4317, 4337)
ENTRY = "groupquest_app_v2_3.html"


class GroupQuestHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".webp": "image/webp",
        ".woff2": "font/woff2",
    }


def find_chrome():
    if sys.platform != "win32":
        return shutil.which("google-chrome") or shutil.which("chromium")

    import winreg

    key_name = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for view in (0, winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
            try:
                with winreg.OpenKey(hive, key_name, 0, winreg.KEY_READ | view) as key:
                    executable = Path(os.path.expandvars(winreg.QueryValue(key, None).strip('"')))
                    if executable.is_file():
                        return executable
            except OSError:
                continue

    for variable in ("LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"):
        if folder := os.environ.get(variable):
            executable = Path(folder) / "Google" / "Chrome" / "Application" / "chrome.exe"
            if executable.is_file():
                return executable
    return shutil.which("chrome.exe")


def bind_server(site):
    handler = partial(GroupQuestHandler, directory=str(site))
    for port in PORTS:
        try:
            return ThreadingHTTPServer((HOST, port), handler)
        except OSError as error:
            if error.errno not in (errno.EADDRINUSE, 10048, 10013):
                raise
    raise OSError("No free local port in the range 4317-4336")


def main():
    site = ROOT
    if not (site / ENTRY).is_file():
        sys.exit("GroupQuest files are missing. Extract the entire ZIP before running START.bat.")

    with bind_server(site) as server:
        url = f"http://{HOST}:{server.server_port}/{ENTRY}"
        print(f"GroupQuest: {url}", flush=True)
        print("Keep this window open while playing. Press Ctrl+C to stop.", flush=True)
        if "--no-browser" not in sys.argv:
            chrome = find_chrome()
            try:
                if chrome is None:
                    raise FileNotFoundError("Chrome executable not found")
                subprocess.Popen([str(chrome), url])
            except OSError:
                print("Open the GroupQuest address shown above in Chrome.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
