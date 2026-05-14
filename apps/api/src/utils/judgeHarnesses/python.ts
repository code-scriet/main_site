export function buildHarness(opts: {
  userCode: string;
  testCases: Array<{ id: string; input: string }>;
  approach: 'A' | 'B';
  timeLimitMs: number;
}): string {
  const userSource = JSON.stringify(opts.userCode);
  const timeLimitMs = Math.max(100, Math.floor(opts.timeLimitMs));

  return `import sys, io, base64, time, traceback, threading, _thread

_USER_SOURCE = ${userSource}
_TIME_LIMIT_MS = ${timeLimitMs}

def _readline_bytes():
    line = sys.stdin.buffer.readline()
    if line.endswith(b"\\n"):
        line = line[:-1]
    if line.endswith(b"\\r"):
        line = line[:-1]
    return line.decode("utf-8")

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

def _run_one(input_str):
    real_stdin = sys.stdin
    real_stdout = sys.stdout
    # Use TextIOWrapper(BytesIO) instead of StringIO so user code that does
    # sys.stdin.buffer.read() (a very common competitive-Python pattern) keeps
    # working — StringIO does not expose .buffer at all.
    sys.stdin = io.TextIOWrapper(io.BytesIO(input_str.encode("utf-8")), encoding="utf-8")
    sys.stdout = io.StringIO()
    t0 = time.perf_counter()
    err = [None]
    done = [False]

    def _worker():
        try:
            exec(_USER_SOURCE, {"__name__": "__main__"})
        except SystemExit:
            pass
        except BaseException:
            err[0] = traceback.format_exc()
        finally:
            done[0] = True

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    t.join(_TIME_LIMIT_MS / 1000.0)
    timed_out = not done[0]
    if timed_out:
        # Best-effort kill — the user thread might still be running but we
        # discard its eventual output and report TIMEOUT regardless.
        try:
            _thread.interrupt_main()
        except Exception:
            pass

    runtime = int((time.perf_counter() - t0) * 1000)
    out = sys.stdout.getvalue()
    sys.stdin = real_stdin
    sys.stdout = real_stdout
    return out, runtime, err[0], timed_out

try:
    for test_id, body in _read_tests():
        out, rt, err, timed_out = _run_one(body)
        if timed_out:
            payload = out
            status = "TIMEOUT"
        elif err:
            payload = err
            status = "FAIL"
        else:
            payload = out
            status = "RESULT"
        encoded = base64.b64encode(payload.encode("utf-8")).decode("ascii")
        print(f"__JUDGE:{test_id}:{status}:{rt}:{encoded}")
except BaseException:
    encoded = base64.b64encode(traceback.format_exc().encode("utf-8")).decode("ascii")
    print(f"__JUDGE:__harness:FAIL:0:{encoded}")
`;
}
