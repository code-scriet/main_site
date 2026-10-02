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
  // The user's `int main(...)` is renamed to `__user_main`. The wrapper always
  // passes a dummy (argc, argv): plain `int main(void)` definitions simply
  // ignore the extra arguments (harmless on x86-64/AArch64 SysV ABIs), while
  // `int main(int argc, char **argv)` users get a working argv. Each test runs
  // in its own forked process so global state is isolated.
  const userSource = opts.userCode;
  const timeLimitMs = Math.max(100, Math.floor(opts.timeLimitMs));

  return `#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <signal.h>
#include <poll.h>
#include <time.h>
#include <stdint.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/wait.h>

#define main __user_main
${userSource}
#undef main

static long long __TIME_LIMIT_MS = ${timeLimitMs};

static char __judge_nonce[256] = "";

static const char *__B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static char *__judge_b64(const unsigned char *in, size_t len) {
  size_t out_len = 4 * ((len + 2) / 3) + 1;
  char *out = (char *)malloc(out_len);
  if (!out) return strdup("");
  size_t o = 0;
  int val = 0, valb = -6;
  for (size_t i = 0; i < len; i++) {
    val = (val << 8) + in[i];
    valb += 8;
    while (valb >= 0) {
      out[o++] = __B64[(val >> valb) & 0x3F];
      valb -= 6;
    }
  }
  if (valb > -6) out[o++] = __B64[((val << 8) >> (valb + 8)) & 0x3F];
  while (o % 4) out[o++] = '=';
  out[o] = 0;
  return out;
}

typedef struct { char *id; char *input; size_t input_len; } __JudgeTest;

// Read the WHOLE judge protocol straight off fd 0 with a raw read() syscall —
// deliberately bypassing the C stdin FILE. The parent must never touch the
// standard input streams: each forked child re-points fd 0 at its own pipe and
// relies on scanf/printf being pristine. If the parent consumed stdin through
// stdio, the child would inherit a spent/at-EOF stream buffer.
static char *__judge_data = NULL;
static size_t __judge_len = 0;
static size_t __judge_off = 0;

static char *__judge_read_line(void) {
  size_t start = __judge_off;
  while (__judge_off < __judge_len && __judge_data[__judge_off] != '\\n') __judge_off++;
  size_t end = __judge_off;
  if (end > start && __judge_data[end - 1] == '\\r') end -= 1;
  size_t len = end - start;
  char *line = (char *)malloc(len + 1);
  if (!line) return NULL;
  memcpy(line, __judge_data + start, len);
  line[len] = 0;
  if (__judge_off < __judge_len) __judge_off++;
  return line;
}

static int __judge_starts_with(const char *s, const char *prefix) {
  return strncmp(s, prefix, strlen(prefix)) == 0;
}

typedef struct { char *status; long long runtimeMs; char *payload; size_t payload_len; } __TestOutcome;

static __TestOutcome __run_one_test(const __JudgeTest *test) {
  int outPipe[2];
  int inPipe[2];
  __TestOutcome fail = { "FAIL", 0, NULL, 0 };
  if (pipe(outPipe) != 0 || pipe(inPipe) != 0) {
    fail.payload = strdup("harness: pipe() failed");
    fail.payload_len = strlen(fail.payload);
    return fail;
  }

  struct timespec t0;
  clock_gettime(CLOCK_MONOTONIC, &t0);
  pid_t child = fork();
  if (child < 0) {
    close(outPipe[0]); close(outPipe[1]);
    close(inPipe[0]); close(inPipe[1]);
    fail.payload = strdup("harness: fork() failed");
    fail.payload_len = strlen(fail.payload);
    return fail;
  }

  if (child == 0) {
    dup2(inPipe[0], STDIN_FILENO);
    dup2(outPipe[1], STDOUT_FILENO);
    dup2(outPipe[1], STDERR_FILENO);
    close(inPipe[0]); close(inPipe[1]);
    close(outPipe[0]); close(outPipe[1]);
    /* The student may define 'int main(void)' or 'int main(int argc, ...)'.
       Call through a cast pointer so both shapes compile even under strict
       compilers (which reject calling a ()-declared function with arguments).
       Extra args are ignored at runtime on x86-64/AArch64 SysV. */
    typedef int (*__user_main_fn_t)(int, char **);
    extern int __user_main();
    __user_main_fn_t __entry = (__user_main_fn_t)(void *)(uintptr_t)&__user_main;
    char *argv[2];
    argv[0] = "main";
    argv[1] = NULL;
    int rc = __entry(1, argv);
    fflush(stdout);
    fflush(stderr);
    _exit(rc == 0 ? 0 : 1);
  }

  close(inPipe[0]);
  close(outPipe[1]);
  fcntl(inPipe[1], F_SETFL, fcntl(inPipe[1], F_GETFL) | O_NONBLOCK);
  fcntl(outPipe[0], F_SETFL, fcntl(outPipe[0], F_GETFL) | O_NONBLOCK);

  size_t written = 0;
  char *payload = NULL;
  size_t payload_len = 0, payload_cap = 0;
  const size_t PAYLOAD_CAP = 5 * 1024 * 1024;
  int inputDone = !test->input_len;
  if (inputDone) close(inPipe[1]);
  int timedOut = 0;

  while (1) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    long long elapsed = (now.tv_sec - t0.tv_sec) * 1000LL + (now.tv_nsec - t0.tv_nsec) / 1000000LL;
    long long remaining = __TIME_LIMIT_MS - elapsed;
    if (remaining <= 0) { timedOut = 1; break; }

    struct pollfd pfds[2];
    int nfds = 0;
    pfds[nfds].fd = outPipe[0]; pfds[nfds].events = POLLIN; nfds++;
    if (!inputDone) { pfds[nfds].fd = inPipe[1]; pfds[nfds].events = POLLOUT; nfds++; }

    int pr = poll(pfds, nfds, remaining > 50 ? 50 : (int)remaining);
    if (pr < 0 && errno != EINTR) break;
    if (pr > 0) {
      if (pfds[0].revents & (POLLIN | POLLHUP)) {
        char buf[8192];
        ssize_t n = read(outPipe[0], buf, sizeof(buf));
        if (n > 0) {
          if (payload_len < PAYLOAD_CAP) {
            size_t room = PAYLOAD_CAP - payload_len;
            size_t take = (size_t)n < room ? (size_t)n : room;
            if (payload_len + take + 1 > payload_cap) {
              payload_cap = payload_len + take + 1;
              payload = realloc(payload, payload_cap);
            }
            memcpy(payload + payload_len, buf, take);
            payload_len += take;
          }
          if (payload_len >= PAYLOAD_CAP) break;
        } else if (n == 0) {
          break;
        } else if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
          break;
        }
      }
      if (!inputDone && nfds > 1 && (pfds[1].revents & (POLLOUT | POLLHUP))) {
        ssize_t w = write(inPipe[1], test->input + written, test->input_len - written);
        if (w > 0) {
          written += w;
        } else if (w < 0 && errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
          inputDone = 1;
        }
        if (written >= test->input_len) {
          close(inPipe[1]);
          inputDone = 1;
        }
      }
    }
  }

  if (timedOut) kill(child, SIGKILL);
  if (!inputDone) close(inPipe[1]);

  fcntl(outPipe[0], F_SETFL, fcntl(outPipe[0], F_GETFL) & ~O_NONBLOCK);
  for (int i = 0; i < 50; i++) {
    struct pollfd pf;
    pf.fd = outPipe[0]; pf.events = POLLIN; pf.revents = 0;
    if (poll(&pf, 1, 10) <= 0) break;
    char buf[4096];
    ssize_t n = read(outPipe[0], buf, sizeof(buf));
    if (n <= 0) break;
    if (payload_len < PAYLOAD_CAP) {
      size_t take = (size_t)n < PAYLOAD_CAP - payload_len ? (size_t)n : PAYLOAD_CAP - payload_len;
      if (payload_len + take + 1 > payload_cap) {
        payload_cap = payload_len + take + 1;
        payload = realloc(payload, payload_cap);
      }
      memcpy(payload + payload_len, buf, take);
      payload_len += take;
    } else break;
  }
  close(outPipe[0]);

  int status = 0;
  waitpid(child, &status, 0);
  struct timespec t1;
  clock_gettime(CLOCK_MONOTONIC, &t1);
  long long runtime = (t1.tv_sec - t0.tv_sec) * 1000LL + (t1.tv_nsec - t0.tv_nsec) / 1000000LL;

  __TestOutcome out;
  if (timedOut) {
    out.status = "TIMEOUT";
  } else {
    out.status = "RESULT";
  }
  out.runtimeMs = runtime;
  out.payload = payload ? payload : strdup("");
  out.payload_len = payload ? payload_len : 0;
  // Note: like the C++ harness, a non-zero child exit is NOT flagged here —
  // output comparison is the source of truth (falling off main is UB in C and
  // may trap after producing output).
  (void)status;
  return out;
}

int main(void) {
  char buf[65536];
  ssize_t n;
  size_t cap = 65536, len = 0;
  __judge_data = malloc(cap);
  while ((n = read(STDIN_FILENO, buf, sizeof(buf))) > 0) {
    if (len + (size_t)n + 1 > cap) {
      cap = (len + n + 1) * 2;
      __judge_data = realloc(__judge_data, cap);
    }
    memcpy(__judge_data + len, buf, n);
    len += n;
  }
  __judge_len = len;

  char *nonceLine = __judge_read_line();
  if (!nonceLine || !__judge_starts_with(nonceLine, "__NONCE=")) {
    fprintf(stderr, "judge harness: invalid judge input\\n");
    fflush(stderr);
    return 1;
  }
  strncpy(__judge_nonce, nonceLine + 8, sizeof(__judge_nonce) - 1);

  int total = 0;
  {
    char *header = __judge_read_line();
    if (!header || !__judge_starts_with(header, "__N=")) {
      fprintf(stderr, "judge harness: invalid judge input\\n");
      fflush(stderr);
      return 1;
    }
    total = atoi(header + 4);
  }
  for (int i = 0; i < total; i++) {
    char *idLine = __judge_read_line();
    char *lenLine = __judge_read_line();
    if (!idLine || !lenLine || !__judge_starts_with(idLine, "__ID=") || !__judge_starts_with(lenLine, "__LEN=")) {
      fprintf(stderr, "judge harness: invalid judge test metadata\\n");
      fflush(stderr);
      return 1;
    }
    int length = atoi(lenLine + 6);
    char *body = malloc(length + 1);
    size_t got = 0;
    while (got < (size_t)length && __judge_off < __judge_len) {
      body[got++] = __judge_data[__judge_off++];
    }
    body[got] = 0;
    if (__judge_off < __judge_len && __judge_data[__judge_off] == '\\r') __judge_off++;
    if (__judge_off < __judge_len && __judge_data[__judge_off] == '\\n') __judge_off++;
    {
      __JudgeTest t;
      t.id = idLine + 5;
      t.input = body;
      t.input_len = got;
      __TestOutcome outcome = __run_one_test(&t);
      char *b64 = __judge_b64((unsigned char *)outcome.payload, outcome.payload_len);
      printf("__JUDGE_%s:%s:%s:%lld:%s\\n", __judge_nonce, t.id, outcome.status, outcome.runtimeMs, b64);
      fflush(stdout);
    }
  }
  {
    char *b64 = __judge_b64((unsigned char *)"", 0);
    printf("__JUDGE_%s:__end:OK:0:%s\\n", __judge_nonce, b64);
    fflush(stdout);
  }
  return 0;
}
`;
}
