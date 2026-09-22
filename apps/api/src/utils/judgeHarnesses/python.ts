export function buildHarness(opts: {
  userCode: string;
  testCases: Array<{ id: string; input: string }>;
  approach: 'A' | 'B';
  timeLimitMs: number;
  /**
   * Deliberately UNUSED here. The frame nonce reaches this harness through the
   * judge stdin, never through the generated source — embedding it would let a
   * submission recover it by reading its own program file.
   */
  nonce: string;
}): string {
  const userSource = JSON.stringify(opts.userCode);
  const timeLimitMs = Math.max(100, Math.floor(opts.timeLimitMs));

  // Each test runs in a FORKED CHILD whose fd 1/2 are pipes, mirroring the C++
  // harness. This is the only sound isolation for Python: the previous version
  // swapped `sys.stdout` for a StringIO, which is a language-level redirect that
  // `os.write(1, ...)` walks straight past — a submission could emit forged
  // `__JUDGE:` frames from an `atexit` hook after the harness had printed the
  // genuine ones. With fork, the child simply does not hold the real stdout, and
  // it cannot reach the parent's globals to recover the nonce (which the child
  // scrubs from its inherited copy before running user code anyway).
  return `import sys, os, io, base64, time, traceback, select, signal

_USER_SOURCE = ${userSource}
_TIME_LIMIT_MS = ${timeLimitMs}
_NONCE = ""
_MAX_CAPTURE = 262144

def _readline_bytes():
    line = sys.stdin.buffer.readline()
    if line.endswith(b"\\n"):
        line = line[:-1]
    if line.endswith(b"\\r"):
        line = line[:-1]
    return line.decode("utf-8")

def _read_nonce():
    header = _readline_bytes()
    if not header.startswith("__NONCE="):
        raise RuntimeError("invalid judge input")
    return header.split("=", 1)[1]

def _read_tests():
    header = _readline_bytes()
    if not header.startswith("__N="):
        raise RuntimeError("invalid judge input")
    total = int(header.split("=", 1)[1])
    tests = []
    for _ in range(total):
        id_line = _readline_bytes()
        len_line = _readline_bytes()
        if not id_line.startswith("__ID=") or not len_line.startswith("__LEN="):
            raise RuntimeError("invalid judge test metadata")
        test_id = id_line.split("=", 1)[1]
        length = int(len_line.split("=", 1)[1])
        body = sys.stdin.buffer.read(length).decode("utf-8")
        sys.stdin.buffer.readline()
        tests.append((test_id, body))
    return tests

def _emit(test_id, status, runtime_ms, payload_bytes):
    encoded = base64.b64encode(payload_bytes).decode("ascii")
    line = "__JUDGE_%s:%s:%s:%d:%s\\n" % (_NONCE, test_id, status, runtime_ms, encoded)
    os.write(1, line.encode("utf-8"))

def _child(input_str):
    # Drop the inherited nonce before any user code runs: even though the child
    # cannot write to the parent's stdout, it must not be able to read the token
    # either (Python's frame introspection would otherwise find it).
    globals()["_NONCE"] = None
    sys.stdin = io.TextIOWrapper(io.BytesIO(input_str.encode("utf-8")), encoding="utf-8")
    code = 0
    try:
        exec(_USER_SOURCE, {"__name__": "__main__"})
    except SystemExit:
        pass
    except BaseException:
        sys.stderr.write(traceback.format_exc())
        code = 1
    try:
        sys.stdout.flush()
    except BaseException:
        pass
    try:
        sys.stderr.flush()
    except BaseException:
        pass
    os._exit(code)

def _run_one(input_str):
    out_r, out_w = os.pipe()
    err_r, err_w = os.pipe()
    started = time.perf_counter()
    pid = os.fork()
    if pid == 0:
        try:
            os.close(out_r)
            os.close(err_r)
            os.dup2(out_w, 1)
            os.dup2(err_w, 2)
            os.close(out_w)
            os.close(err_w)
            _child(input_str)
        except BaseException:
            os._exit(3)
    os.close(out_w)
    os.close(err_w)

    buffers = {out_r: b"", err_r: b""}
    open_fds = [out_r, err_r]
    deadline = time.time() + (_TIME_LIMIT_MS / 1000.0)
    timed_out = False
    while open_fds:
        remaining = deadline - time.time()
        if remaining <= 0:
            timed_out = True
            break
        ready, _, _ = select.select(open_fds, [], [], remaining)
        if not ready:
            timed_out = True
            break
        for fd in ready:
            chunk = os.read(fd, 65536)
            if not chunk:
                open_fds.remove(fd)
                continue
            if len(buffers[fd]) < _MAX_CAPTURE:
                buffers[fd] += chunk
    if timed_out:
        try:
            os.kill(pid, signal.SIGKILL)
        except BaseException:
            pass
    for fd in (out_r, err_r):
        try:
            os.close(fd)
        except BaseException:
            pass
    exited_ok = False
    try:
        _, wait_status = os.waitpid(pid, 0)
        exited_ok = os.WIFEXITED(wait_status) and os.WEXITSTATUS(wait_status) == 0
    except BaseException:
        pass
    runtime = int((time.perf_counter() - started) * 1000)
    return buffers[out_r], buffers[err_r], runtime, timed_out, exited_ok

try:
    _NONCE = _read_nonce()
    for _test_id, _body in _read_tests():
        _out, _err, _rt, _timed_out, _ok = _run_one(_body)
        if _timed_out:
            _emit(_test_id, "TIMEOUT", _rt, _out)
        elif not _ok:
            _emit(_test_id, "FAIL", _rt, _err if _err else _out)
        else:
            _emit(_test_id, "RESULT", _rt, _out)
    _emit("__end", "OK", 0, b"")
except BaseException:
    if _NONCE:
        _emit("__harness", "FAIL", 0, traceback.format_exc().encode("utf-8"))
    else:
        sys.stderr.write(traceback.format_exc())
`;
}
