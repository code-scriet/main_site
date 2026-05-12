function rewriteMainClass(source: string): string {
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
}): string {
  const rewritten = rewriteMainClass(opts.userCode);
  const timeLimitMs = Math.max(100, Math.floor(opts.timeLimitMs));

  // Each test loads a FRESH copy of __UserMain through an isolated URLClassLoader,
  // so static fields are reset between invocations. Java classes loaded via
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

  static java.util.List<JudgeTest> readTests() throws Exception {
    byte[] bytes = System.in.readAllBytes();
    int[] offset = new int[] { 0 };
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
    return tests;
  }

  static String readLine(byte[] bytes, int[] offset) {
    int start = offset[0];
    while (offset[0] < bytes.length && bytes[offset[0]] != 10) offset[0]++;
    int end = offset[0];
    if (offset[0] < bytes.length && bytes[offset[0]] == 10) offset[0]++;
    if (end > start && bytes[end - 1] == 13) end--;
    return new String(bytes, start, end - start, java.nio.charset.StandardCharsets.UTF_8);
  }

  static java.net.URL[] classpathUrls() throws Exception {
    String cp = System.getProperty("java.class.path", ".");
    String[] entries = cp.split(java.io.File.pathSeparator);
    java.net.URL[] urls = new java.net.URL[entries.length];
    for (int i = 0; i < entries.length; i++) {
      String entry = entries[i].isEmpty() ? "." : entries[i];
      urls[i] = new java.io.File(entry).toURI().toURL();
    }
    return urls;
  }

  // ClassLoader that reloads __UserMain (and its inner/nested classes) fresh
  // every instance, but delegates all other classes to the system loader so
  // java.util.*, java.io.*, third-party libs, etc. remain shared.
  static class IsolatingLoader extends java.net.URLClassLoader {
    IsolatingLoader(java.net.URL[] urls) {
      super(urls, null);
    }
    @Override
    protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
      if (name.startsWith("__UserMain")) {
        synchronized (getClassLoadingLock(name)) {
          Class<?> c = findLoadedClass(name);
          if (c == null) c = findClass(name);
          if (resolve) resolveClass(c);
          return c;
        }
      }
      // Fall back to the system loader for everything else.
      return ClassLoader.getSystemClassLoader().loadClass(name);
    }
  }

  public static void main(String[] args) throws Exception {
    java.util.List<JudgeTest> tests = readTests();
    java.net.URL[] urls = classpathUrls();
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
        loader = new IsolatingLoader(urls);
        final Class<?> userClass = loader.loadClass("__UserMain");
        final java.lang.reflect.Method userMain = userClass.getDeclaredMethod("main", String[].class);
        userMain.setAccessible(true);

        // Run user code in a dedicated thread so a watchdog can interrupt it
        // when it exceeds the per-test time limit. A flat Future timeout is
        // the cleanest way to express this.
        final Throwable[] caught = new Throwable[1];
        Thread runner = new Thread(() -> {
          try {
            userMain.invoke(null, (Object) new String[0]);
          } catch (java.lang.reflect.InvocationTargetException ite) {
            caught[0] = ite.getCause() != null ? ite.getCause() : ite;
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
      } finally {
        if (loader != null) {
          try { loader.close(); } catch (Exception ignore) {}
        }
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
      realOut.println("__JUDGE:" + test.id + ":" + status + ":" + runtime + ":" + encoded);
    }
  }
}
`;
}
