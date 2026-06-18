export function buildHarness(opts: {
  userCode: string;
  testCases: Array<{ id: string; input: string }>;
  approach: 'A' | 'B';
  timeLimitMs: number;
}): string {
  // The user's `int main(...)` is renamed to `__user_main` via macro. We support
  // both `int main()` and `int main(int argc, char** argv)` via templated overloads.
  // Each test runs in its own forked process so global state is isolated.
  return `#include <bits/stdc++.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <signal.h>
#include <poll.h>
#include <time.h>
using namespace std;

static const long long __TIME_LIMIT_MS = ${Math.max(100, Math.floor(opts.timeLimitMs))};

#define main __user_main
${opts.userCode}
#undef main

// Forwarding stub that supports either user-main signature.
template <typename F>
auto __invoke_user_main(F fn, int) -> decltype(fn(0, (char**)nullptr), int()) {
  char arg0[] = "main";
  char* argv[2] = { arg0, nullptr };
  return fn(1, argv);
}
template <typename F>
auto __invoke_user_main(F fn, long) -> decltype(fn(), int()) {
  return fn();
}

struct __JudgeTest {
  string id;
  string input;
};

static const string __B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

string __judge_b64(const string& in) {
  string out;
  int val = 0;
  int valb = -6;
  for (unsigned char c : in) {
    val = (val << 8) + c;
    valb += 8;
    while (valb >= 0) {
      out.push_back(__B64[(val >> valb) & 0x3F]);
      valb -= 6;
    }
  }
  if (valb > -6) out.push_back(__B64[((val << 8) >> (valb + 8)) & 0x3F]);
  while (out.size() % 4) out.push_back('=');
  return out;
}

// Read the WHOLE judge protocol straight off fd 0 with a raw read() syscall —
// deliberately bypassing cin / the C stdin FILE. The parent must never touch the
// standard input streams: each forked child re-points fd 0 at its own pipe and
// relies on cin/scanf being pristine (see __run_one_test). If the parent consumed
// stdin through cin, the child would inherit a spent/at-EOF stream buffer.
static string __judge_read_all_stdin() {
  string data;
  char buf[65536];
  ssize_t n;
  while ((n = read(STDIN_FILENO, buf, sizeof(buf))) > 0) {
    data.append(buf, buf + n);
  }
  return data;
}

vector<__JudgeTest> __judge_read_tests() {
  string data = __judge_read_all_stdin();
  size_t off = 0;
  auto readLine = [&]() -> string {
    size_t nl = data.find('\\n', off);
    size_t end = (nl == string::npos) ? data.size() : nl;
    if (end > off && data[end - 1] == '\\r') end -= 1;
    string line = data.substr(off, end - off);
    off = (nl == string::npos) ? data.size() : nl + 1;
    return line;
  };

  vector<__JudgeTest> tests;
  string header = readLine();
  if (header.rfind("__N=", 0) != 0) throw runtime_error("invalid judge input");
  int total = stoi(header.substr(4));
  for (int i = 0; i < total; ++i) {
    string idLine = readLine();
    string lenLine = readLine();
    if (idLine.rfind("__ID=", 0) != 0 || lenLine.rfind("__LEN=", 0) != 0) {
      throw runtime_error("invalid judge metadata");
    }
    int length = stoi(lenLine.substr(6));
    string body = data.substr(off, length);
    off += length;
    if (off < data.size() && data[off] == '\\r') off += 1;
    if (off < data.size() && data[off] == '\\n') off += 1;
    tests.push_back({ idLine.substr(5), body });
  }
  return tests;
}

struct __TestOutcome {
  string status;
  long long runtimeMs;
  string payload;
};

// Run user's __user_main() once with the given input. Forks so global state
// is isolated between tests. Child's stdout+stderr are captured into payload.
__TestOutcome __run_one_test(const __JudgeTest& test) {
  int outPipe[2];
  int inPipe[2];
  if (pipe(outPipe) != 0 || pipe(inPipe) != 0) {
    return { "FAIL", 0, "harness: pipe() failed" };
  }

  auto start = chrono::steady_clock::now();
  pid_t child = fork();
  if (child < 0) {
    close(outPipe[0]); close(outPipe[1]);
    close(inPipe[0]); close(inPipe[1]);
    return { "FAIL", 0, "harness: fork() failed" };
  }

  if (child == 0) {
    // ------- child -------
    // Wire fds: inPipe[0] → stdin; outPipe[1] → stdout & stderr.
    dup2(inPipe[0], STDIN_FILENO);
    dup2(outPipe[1], STDOUT_FILENO);
    dup2(outPipe[1], STDERR_FILENO);
    close(inPipe[0]); close(inPipe[1]);
    close(outPipe[0]); close(outPipe[1]);

    // Do NOT reopen /dev/stdin|stdout|stderr here. The execution sandbox (both
    // Wandbox and godbolt) does not expose those device files — fopen returns
    // NULL and ofstream("/dev/stdout") silently fails to open, which used to
    // rebind cout to a dead streambuf and DISCARD every byte the user printed
    // (every C++ submission came back with empty output → wrong answer).
    // Instead we rely on the dup2 above: fd 0/1/2 already point at the pipes,
    // and because the parent read the protocol via a raw read() syscall (never
    // through cin / the C stdin FILE), the child's cin/cout/scanf/printf are
    // pristine and operate directly on the new fds. Nothing to rebind.
    cin.clear();
    cout.clear();
    cerr.clear();

    int rc = 0;
    try {
      rc = __invoke_user_main(__user_main, 0);
    } catch (const exception& ex) {
      cout.flush();
      fprintf(stderr, "%s", ex.what());
      fflush(stderr);
      _exit(2);
    } catch (...) {
      cout.flush();
      fprintf(stderr, "unknown runtime error");
      fflush(stderr);
      _exit(2);
    }
    cout.flush();
    cerr.flush();
    fflush(stdout);
    fflush(stderr);
    _exit(rc == 0 ? 0 : 1);
  }

  // ------- parent -------
  close(inPipe[0]);
  close(outPipe[1]);

  fcntl(inPipe[1], F_SETFL, fcntl(inPipe[1], F_GETFL) | O_NONBLOCK);
  fcntl(outPipe[0], F_SETFL, fcntl(outPipe[0], F_GETFL) | O_NONBLOCK);

  size_t written = 0;
  string payload;
  const size_t PAYLOAD_CAP = 5 * 1024 * 1024;
  bool inputDone = false;
  bool timedOut = false;

  // Poll until either: child closes stdout, we exceed __TIME_LIMIT_MS, or the
  // payload cap is hit.
  while (true) {
    auto now = chrono::steady_clock::now();
    long long elapsed = chrono::duration_cast<chrono::milliseconds>(now - start).count();
    long long remaining = __TIME_LIMIT_MS - elapsed;
    if (remaining <= 0) {
      timedOut = true;
      break;
    }

    struct pollfd pfds[2];
    int nfds = 0;
    pfds[nfds].fd = outPipe[0]; pfds[nfds].events = POLLIN; nfds++;
    if (!inputDone) { pfds[nfds].fd = inPipe[1]; pfds[nfds].events = POLLOUT; nfds++; }

    int pr = poll(pfds, nfds, (int)min<long long>(remaining, 50));
    if (pr < 0 && errno != EINTR) break;

    if (pr > 0) {
      // Stdout side
      if (pfds[0].revents & (POLLIN | POLLHUP)) {
        char buf[8192];
        ssize_t n = read(outPipe[0], buf, sizeof(buf));
        if (n > 0) {
          if (payload.size() < PAYLOAD_CAP) {
            payload.append(buf, buf + min<size_t>(n, PAYLOAD_CAP - payload.size()));
          }
          if (payload.size() >= PAYLOAD_CAP) break;
        } else if (n == 0) {
          // EOF — child closed stdout
          break;
        } else if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
          break;
        }
      }
      // Stdin side
      if (!inputDone && nfds > 1 && (pfds[1].revents & (POLLOUT | POLLHUP))) {
        if (written < test.input.size()) {
          ssize_t w = write(inPipe[1], test.input.data() + written, test.input.size() - written);
          if (w > 0) written += w;
          else if (w < 0 && errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
            inputDone = true;
          }
        }
        if (written >= test.input.size()) {
          close(inPipe[1]);
          inputDone = true;
        }
      }
    }
  }

  if (timedOut) {
    kill(child, SIGKILL);
  }
  if (!inputDone) close(inPipe[1]);

  // Drain any leftover output without blocking forever.
  fcntl(outPipe[0], F_SETFL, fcntl(outPipe[0], F_GETFL) & ~O_NONBLOCK);
  // Brief drain loop with poll so we don't block past timeout.
  for (int i = 0; i < 50; i++) {
    struct pollfd pf = { outPipe[0], POLLIN, 0 };
    int pr = poll(&pf, 1, 10);
    if (pr <= 0) break;
    char buf[4096];
    ssize_t n = read(outPipe[0], buf, sizeof(buf));
    if (n <= 0) break;
    if (payload.size() < PAYLOAD_CAP) {
      payload.append(buf, buf + min<size_t>(n, PAYLOAD_CAP - payload.size()));
    } else {
      break;
    }
  }
  close(outPipe[0]);

  int status = 0;
  waitpid(child, &status, 0);
  auto end = chrono::steady_clock::now();
  long long runtime = chrono::duration_cast<chrono::milliseconds>(end - start).count();

  if (timedOut) {
    return { "TIMEOUT", runtime, payload };
  }
  // Note: we intentionally do not flag non-zero exit codes / signals as FAIL.
  // The user's main() becomes __user_main() via macro, so falling off the end
  // of an int-returning function is undefined behavior — GCC emits a ud2 trap
  // that raises SIGILL right after the user's last meaningful statement.
  // The output has already been captured, so output comparison is the source
  // of truth. Real crashes that suppress output naturally manifest as a
  // wrong-answer against the expected output.
  (void)status;
  return { "RESULT", runtime, payload };
}

int main() {
  try {
    vector<__JudgeTest> tests = __judge_read_tests();
    for (const auto& test : tests) {
      __TestOutcome outcome = __run_one_test(test);
      cout << "__JUDGE:" << test.id << ":" << outcome.status
           << ":" << outcome.runtimeMs << ":" << __judge_b64(outcome.payload) << "\\n";
      cout.flush();
    }
  } catch (const exception& ex) {
    cout << "__JUDGE:__harness:FAIL:0:" << __judge_b64(ex.what()) << "\\n";
  }
  return 0;
}
`;
}
