#!/usr/bin/env python3
"""Trusted Linux job supervisor, invoked by devflow-execution.js in isolated mode.

This is lifecycle accounting, not a sandbox. It observes the launched process tree,
including double-forked/setsid descendants. Work delegated to an unrelated daemon,
remote service or another host is outside this process-tree contract.

Linux contracts: PR_SET_CHILD_SUBREAPER(2const), waitpid(2) / __WALL.
https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html
https://man7.org/linux/man-pages/man2/waitpid.2.html
"""
import ctypes
import errno
import json
import os
import signal
import subprocess
import sys
import time

PR_SET_CHILD_SUBREAPER = 36
PR_GET_CHILD_SUBREAPER = 37
WAIT_ALL = 0x40000000  # Linux __WALL includes clone children with non-SIGCHLD exits.
MAX_REPORTED_EXITS = 4096


def exit_record(pid, status, root_pid):
    if os.WIFEXITED(status):
        return {"pid": pid, "root": pid == root_pid, "exitCode": os.WEXITSTATUS(status), "signal": None}
    if os.WIFSIGNALED(status):
        number = os.WTERMSIG(status)
        try:
            name = signal.Signals(number).name
        except ValueError:
            name = "SIG" + str(number)
        return {"pid": pid, "root": pid == root_pid, "exitCode": None, "signal": name}
    return None


def run(request):
    started = time.monotonic()
    result = {"version": 1, "adapter": "linux-subreaper-v1", "state": "not_started",
              "reason": "supervisor_error", "launched": False, "rootPid": None,
              "rootExit": None, "observedExits": [], "observedExitCount": 0,
              "hasObservedFailure": False, "outputComplete": False}
    child = None
    try:
        # Set and verify before launching anything. No process-group/PID snapshot
        # is used as evidence of settlement. Isolated Python ignores PYTHONPATH.
        libc = ctypes.CDLL(None, use_errno=True)
        prctl = libc.prctl
        prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
        prctl.restype = ctypes.c_int
        observed = ctypes.c_int(0)
        if prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) != 0 or prctl(
                PR_GET_CHILD_SUBREAPER, ctypes.addressof(observed), 0, 0, 0) != 0 or observed.value != 1:
            result.update(reason="subreaper_unavailable", errorCode=errno.errorcode.get(ctypes.get_errno(), "PRCTL_FAILED"))
            return result
        signal.signal(signal.SIGCHLD, signal.SIG_DFL)
        with open(request["stdoutPath"], "wb", buffering=0) as out, open(
                request["stderrPath"], "wb", buffering=0) as err, open(
                request["stdinPath"], "rb") as inp, open(
                request["exitsPath"], "w", encoding="utf-8", buffering=1) as exits:
            try:
                child = subprocess.Popen([request["file"], *request["args"]], cwd=request["cwd"],
                                         env=request["env"], stdin=inp, stdout=out, stderr=err,
                                         shell=False, close_fds=True)
            except OSError as error:
                result.update(reason="launch_failed", errorCode=errno.errorcode.get(error.errno, "SPAWN_ERROR"),
                              errorMessage=str(error))
                return result
            result.update(state="unknown", reason="supervisor_error", launched=True, rootPid=child.pid)
            deadline = started + request["timeout"] / 1000
            while True:
                try:
                    pid, status = os.waitpid(-1, os.WNOHANG | WAIT_ALL)
                except ChildProcessError:
                    # ECHILD, after the root's exit was reaped, proves this subreaper
                    # has no remaining child or adopted orphan. Every live local
                    # descendant would still have a live ancestor in this job.
                    if result["rootExit"] is not None:
                        result.update(state="settled", reason="completed", outputComplete=True)
                    else:
                        result.update(reason="missing_root_exit")
                    return result
                if pid:
                    record = exit_record(pid, status, child.pid)
                    if record is not None:
                        exits.write(json.dumps(record, separators=(",", ":")) + "\n")
                        result["observedExitCount"] += 1
                        if len(result["observedExits"]) < MAX_REPORTED_EXITS:
                            result["observedExits"].append(record)
                        if record["exitCode"] not in (None, 0) or record["signal"] is not None:
                            result["hasObservedFailure"] = True
                        if pid == child.pid:
                            result["rootExit"] = record
                            child.returncode = record["exitCode"] if record["signal"] is None else -os.WTERMSIG(status)
                    if time.monotonic() >= deadline:
                        result.update(reason="timeout")
                        return result
                    continue
                if time.monotonic() >= deadline:
                    # Do not terminate user processes. The caller must retain its
                    # unresolved reservation; retained output files may still grow.
                    result.update(reason="timeout")
                    return result
                time.sleep(min(0.01, max(0, deadline - time.monotonic())))
    except BaseException as error:
        result.update(reason="supervisor_error", errorCode=type(error).__name__, errorMessage=str(error))
        return result
    finally:
        result["durationMs"] = round((time.monotonic() - started) * 1000)
        # Popen's destructor may poll/reap the root after a timeout; never let
        # that later observation become a claimed settled result.
        if child is not None and result["state"] != "settled" and child.returncode is None:
            child.returncode = -1


if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        response = run(request)
    except BaseException as error:
        response = {"version": 1, "adapter": "linux-subreaper-v1", "state": "not_started",
                    "reason": "supervisor_error", "launched": False, "rootPid": None, "rootExit": None,
                    "observedExits": [], "observedExitCount": 0, "hasObservedFailure": False,
                    "outputComplete": False, "errorCode": type(error).__name__, "errorMessage": str(error)}
    sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
    sys.stdout.flush()
