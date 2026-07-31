import { TimeoutError, safeCheck, withTimeout } from "./with-timeout";

const later = <T>(value: T, ms: number) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const neverSettles = () => new Promise<never>(() => undefined);

describe("withTimeout", () => {
  it("resolves when the promise wins the race", async () => {
    await expect(withTimeout(later("done", 5), 200)).resolves.toBe("done");
  });

  /**
   * Regression: an unbounded `redis.ping()` against an unreachable host left
   * /health/ready hanging for 12s+, so the probe never answered at all.
   */
  it("rejects with TimeoutError when the promise never settles", async () => {
    await expect(withTimeout(neverSettles(), 20)).rejects.toThrow(TimeoutError);
  });

  it("names the operation in the message", async () => {
    await expect(withTimeout(neverSettles(), 20, "redis ping")).rejects.toThrow(
      /redis ping timed out after 20ms/,
    );
  });

  it("propagates the original rejection rather than masking it", async () => {
    const failure = Promise.reject(new Error("connection refused"));

    await expect(withTimeout(failure, 200)).rejects.toThrow(
      "connection refused",
    );
  });

  it("clears its timer, so a resolved call cannot hold the event loop open", async () => {
    jest.useFakeTimers();
    const clear = jest.spyOn(global, "clearTimeout");

    try {
      await withTimeout(Promise.resolve("ok"), 1000);
      expect(clear).toHaveBeenCalled();
    } finally {
      clear.mockRestore();
      jest.useRealTimers();
    }
  });

  it("accepts a thenable, not just a native promise", async () => {
    // Prisma's `$queryRaw` returns a PrismaPromise, not a native Promise, so
    // the signature has to accept anything with a `then`.
    const thenable: PromiseLike<string> = {
      then: (onfulfilled, onrejected) =>
        Promise.resolve("value").then(onfulfilled, onrejected),
    };

    await expect(withTimeout(thenable, 200)).resolves.toBe("value");
  });
});

describe("safeCheck", () => {
  it("returns the value when the check succeeds", async () => {
    await expect(
      safeCheck(() => later(true, 5), false, 200, "db"),
    ).resolves.toBe(true);
  });

  it("returns the fallback when the check times out", async () => {
    await expect(
      safeCheck(() => neverSettles(), false, 20, "db"),
    ).resolves.toBe(false);
  });

  it("returns the fallback when the check throws", async () => {
    await expect(
      safeCheck(() => Promise.reject(new Error("boom")), false, 200, "db"),
    ).resolves.toBe(false);
  });

  it("never throws — a health check must always produce an answer", async () => {
    await expect(
      safeCheck(
        () => {
          throw new Error("synchronous explosion");
        },
        "fallback",
        200,
        "db",
      ),
    ).resolves.toBe("fallback");
  });
});
