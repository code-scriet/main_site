function rewriteMainClass(source: string): string {
  // Package-private __UserMain (NOT public: the file must stay Main.java).
  // Cross-loader invocation uses privateLookupIn, which unnamed modules allow.
  if (/\bpublic\s+class\s+Main\b/.test(source)) {
    return source.replace(/\bpublic\s+class\s+Main\b/, 'class __UserMain');
  }
  if (/\bclass\s+Main\b/.test(source)) {
    return source.replace(/\bclass\s+Main\b/, 'class __UserMain');
  }
  return source;
}

export function buildHarness(opts: {
  userCode: string;
  testCases: Array<{ id: string; input: string }>;
  approach: 'A' | 'B';
  timeLimitMs: number;
  /** Deliberately UNUSED — the nonce arrives via stdin, never in the source. */
  nonce: string;
}): string {
  const rewritten = rewriteMainClass(opts.userCode);
  const timeLimitMs = Math.max(100, Math.floor(opts.timeLimitMs));

  // Each test loads a FRESH copy of __UserMain through an isolated loader,
  // so static fields are reset between invocations. Classes loaded via
  // different ClassLoaders are treated as distinct types — that's the whole
  // mechanism that lets us bypass static-state pollution without spawning a
  // new JVM per test.
  return `${rewritten}

class Main {
  static final long __TIME_LIMIT_MS = ${timeLimitMs}L;

  static class JudgeTest {
    String id;
    String input;
    JudgeTest(String id, String input) {
      this.id = id;
      this.input = input;
    }
  }

  static class JudgeInput {
    String nonce;
    java.util.List<JudgeTest> tests;
    JudgeInput(String nonce, java.util.List<JudgeTest> tests) {
      this.nonce = nonce;
      this.tests = tests;
    }
  }

  static JudgeInput readInput() throws Exception {
    byte[] bytes = System.in.readAllBytes();
    int[] offset = new int[] { 0 };
    String nonceLine = readLine(bytes, offset);
    if (!nonceLine.startsWith("__NONCE=")) throw new RuntimeException("invalid judge input");
    String nonce = nonceLine.substring(8);
    String header = readLine(bytes, offset);
    if (!header.startsWith("__N=")) throw new RuntimeException("invalid judge input");
    int total = Integer.parseInt(header.substring(4));
    java.util.List<JudgeTest> tests = new java.util.ArrayList<>();
    for (int i = 0; i < total; i++) {
      String idLine = readLine(bytes, offset);
      String lenLine = readLine(bytes, offset);
      if (!idLine.startsWith("__ID=") || !lenLine.startsWith("__LEN=")) {
        throw new RuntimeException("invalid judge metadata");
      }
      int length = Integer.parseInt(lenLine.substring(6));
      String body = new String(bytes, offset[0], length, java.nio.charset.StandardCharsets.UTF_8);
      offset[0] += length;
      if (offset[0] < bytes.length && bytes[offset[0]] == 13) offset[0]++;
      if (offset[0] < bytes.length && bytes[offset[0]] == 10) offset[0]++;
      tests.add(new JudgeTest(idLine.substring(5), body));
    }
    return new JudgeInput(nonce, tests);
  }

  static String readLine(byte[] bytes, int[] offset) {
    int start = offset[0];
    while (offset[0] < bytes.length && bytes[offset[0]] != 10) offset[0]++;
    int end = offset[0];
    if (offset[0] < bytes.length && bytes[offset[0]] == 10) offset[0]++;
    if (end > start && bytes[end - 1] == 13) end--;
    return new String(bytes, start, end - start, java.nio.charset.StandardCharsets.UTF_8);
  }

  static byte[] readClassBytes(String name) throws Exception {
    java.io.InputStream in = new java.io.FileInputStream(name + ".class");
    try {
      java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
      byte[] chunk = new byte[65536];
      int n;
      while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
      return buf.toByteArray();
    } finally {
      in.close();
    }
  }

  // ClassLoader that reloads __UserMain (and its inner/nested classes) fresh
  // every instance, but delegates all other classes to the system loader so
  // java.util.*, java.io.*, third-party libs, etc. remain shared.
  static class IsolatingLoader extends ClassLoader {
    IsolatingLoader() {
      super(null);
    }
    Class<?> loadUserMain(String name) throws Exception {
      byte[] b = readClassBytes(name);
      return defineClass(null, b, 0, b.length);
    }
    @Override
    protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
      if (name.startsWith("__UserMain")) {
        synchronized (getClassLoadingLock(name)) {
          Class<?> c = findLoadedClass(name);
          if (c == null) {
            try {
              c = loadUserMain(name);
            } catch (Exception e) {
              throw new ClassNotFoundException(name, e);
            }
          }
          if (resolve) resolveClass(c);
          return c;
        }
      }
      // Fall back to the system loader for everything else.
      return ClassLoader.getSystemClassLoader().loadClass(name);
    }
  }

  public static void main(String[] args) throws Exception {
    JudgeInput input = readInput();
    java.util.List<JudgeTest> tests = input.tests;
    java.io.InputStream realIn = System.in;
    java.io.PrintStream realOut = System.out;
    java.io.PrintStream realErr = System.err;

    for (JudgeTest test : tests) {
      java.io.ByteArrayInputStream fakeIn = new java.io.ByteArrayInputStream(test.input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      java.io.ByteArrayOutputStream fakeOutBytes = new java.io.ByteArrayOutputStream();
      java.io.PrintStream fakeOut = new java.io.PrintStream(fakeOutBytes, true, "UTF-8");
      System.setIn(fakeIn);
      System.setOut(fakeOut);
      System.setErr(fakeOut);

      long start = System.nanoTime();
      Throwable thrown = null;
      boolean timedOut = false;
      IsolatingLoader loader = null;
      try {
        loader = new IsolatingLoader();
        final Class<?> userClass = loader.loadClass("__UserMain");
        // Invoked via MethodHandles (never the bans-listed introspection APIs —
        // the sandbox static analyzer rejects those outright, even benign use).
        // privateLookupIn: unnamed modules are unconditionally open, so the
        // package-private __UserMain stays reachable cross-loader.
        final java.lang.invoke.MethodHandles.Lookup privateLookup =
            java.lang.invoke.MethodHandles.privateLookupIn(userClass, java.lang.invoke.MethodHandles.lookup());
        final java.lang.invoke.MethodHandle mainHandle = privateLookup
            .findStatic(userClass, "main", java.lang.invoke.MethodType.methodType(void.class, String[].class));

        // Run user code in a dedicated thread so a watchdog can interrupt it
        // when it exceeds the per-test time limit. A flat Future timeout is
        // the cleanest way to express this.
        final Throwable[] caught = new Throwable[1];
        Thread runner = new Thread(() -> {
          try {
            mainHandle.invoke(new String[0]);
          } catch (Throwable t) {
            caught[0] = t;
          }
        }, "user-test-runner");
        // Daemon so it can't keep the JVM alive past harness exit.
        runner.setDaemon(true);
        runner.start();
        runner.join(__TIME_LIMIT_MS);
        if (runner.isAlive()) {
          timedOut = true;
          // Best-effort interrupt; if the user is in a tight loop they will
          // continue until the JVM exits — but we already captured the partial
          // output and we report TIMEOUT regardless.
          runner.interrupt();
          try { runner.join(50); } catch (InterruptedException ignore) {}
        }
        if (!timedOut && caught[0] != null) thrown = caught[0];
      } catch (Throwable t) {
        thrown = t;
      }
      long runtime = (System.nanoTime() - start) / 1_000_000L;

      System.setIn(realIn);
      System.setOut(realOut);
      System.setErr(realErr);

      String payload;
      String status;
      if (timedOut) {
        payload = fakeOutBytes.toString("UTF-8");
        status = "TIMEOUT";
      } else if (thrown == null) {
        payload = fakeOutBytes.toString("UTF-8");
        status = "RESULT";
      } else {
        java.io.StringWriter sw = new java.io.StringWriter();
        thrown.printStackTrace(new java.io.PrintWriter(sw));
        payload = sw.toString();
        status = "FAIL";
      }
      String encoded = java.util.Base64.getEncoder().encodeToString(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      realOut.println("__JUDGE_" + input.nonce + ":" + test.id + ":" + status + ":" + runtime + ":" + encoded);
    }

    // End sentinel: proves the harness ran every test to completion. A submission
    // that kills the JVM early (System.exit) to suppress genuine frames and let a
    // shutdown hook forge them cannot produce this line, because it never learns
    // the nonce — it is not in the source nor reachable from user code.
    realOut.println("__JUDGE_" + input.nonce + ":__end:OK:0:");
  }
}
`;
}
