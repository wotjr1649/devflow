"""Read-only namespace metadata on disposable CI runners; never change policy."""
import json
import os
import pathlib
import platform
import re
import signal
import subprocess
import sys


def read(file, bound=4096):
    try:
        with pathlib.Path(file).open("r", encoding="utf-8") as stream:
            value = stream.read(bound + 1)
        return value if len(value) <= bound else None
    except (OSError, UnicodeError):
        return None


def number(file):
    value = read(file, 32)
    return int(value.strip()) if value and re.fullmatch(r"[0-9]{1,12}\s*", value) else None


def label(value):
    return value.strip() if value and re.fullmatch(r"[A-Za-z0-9_./ ()-]{1,160}\n?", value) else None


def status_fields(value):
    fields = {}
    for key, value in re.findall(r"^(CapEff|CapBnd|Seccomp|NoNewPrivs):\s*([^\n]+)$", value or "", re.M):
        if re.fullmatch(r"[0-9a-f]{16}" if key.startswith("Cap") else r"[0-9]{1,2}", value):
            fields[key] = value
    return fields


def process_metadata():
    return {"apparmorLabel": label(read("/proc/self/attr/current", 256)),
            "status": status_fields(read("/proc/self/status"))}


def run():
    if sys.platform != "linux":
        raise RuntimeError("LINUX_ONLY")
    if sys.argv[1:] == ["--child"]:
        print(json.dumps(process_metadata()))
        return
    version = re.search(r'^VERSION_ID="?([0-9.]+)"?$', read("/etc/os-release") or "", re.M)
    result = {"kind": "read-only environment diagnosis; not native sandbox PASS or model execution",
              "osVersion": version.group(1) if version else None, "kernel": platform.release(),
              "parent": process_metadata(),
              "usernsPolicy": {name: number("/proc/sys/" + path) for name, path in {
                  "apparmorRestrictUnprivilegedUserns": "kernel/apparmor_restrict_unprivileged_userns",
                  "unprivilegedUsernsClone": "kernel/unprivileged_userns_clone",
                  "maxUserNamespaces": "user/max_user_namespaces"}.items()}}
    command = ["/usr/bin/unshare", "--user", "--map-root-user", "--net", sys.executable, "-I", str(pathlib.Path(__file__).resolve()), "--child"]
    child = subprocess.Popen(command, env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
                             stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = child.communicate(timeout=8)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(child.pid, signal.SIGKILL)
        stdout, stderr = child.communicate(timeout=2)
    result["unshareExit"] = child.returncode
    result["unshareTimedOut"] = timed_out
    result["unshareClosed"] = child.returncode is not None
    result["child"] = None
    if child.returncode == 0 and len(stdout) <= 2048:
        data = json.loads(stdout)
        result["child"] = {"apparmorLabel": label(data.get("apparmorLabel")),
                           "status": {k: v for k, v in data.get("status", {}).items() if k in {"CapEff", "CapBnd", "Seccomp", "NoNewPrivs"}}}
    result["unshareError"] = ("OPERATION_NOT_PERMITTED" if b"Operation not permitted" in stderr else
                              "OTHER_ERROR" if child.returncode else None)
    print("DEVFLOW_ENVIRONMENT_EVIDENCE=" + json.dumps(result))


if __name__ == "__main__":
    run()
