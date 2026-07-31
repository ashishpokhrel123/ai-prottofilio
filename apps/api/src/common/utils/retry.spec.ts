import { backoffDelay, isRetryableProviderError, retry } from "./retry";

const FAST = { baseDelayMs: 1, maxDelayMs: 4 };

describe("retry", () => {
  it("returns immediately when the operation succeeds", async () => {
    const operation = jest.fn().mockResolvedValue("ok");

    await expect(retry(operation, FAST)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries until the operation succeeds", async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValue("ok");

    await expect(retry(operation, FAST)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("gives up after the attempt budget and rethrows the last error", async () => {
    const operation = jest.fn().mockRejectedValue(new Error("429 rate limit"));

    await expect(retry(operation, { ...FAST, attempts: 3 })).rejects.toThrow(
      "429 rate limit",
    );
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not retry an error the predicate rejects", async () => {
    const operation = jest.fn().mockRejectedValue(new Error("400 bad request"));

    // A malformed request will fail identically every time; retrying it four
    // times just multiplies the latency.
    await expect(
      retry(operation, { ...FAST, isRetryable: isRetryableProviderError }),
    ).rejects.toThrow("400 bad request");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("reports each retry to the callback", async () => {
    const onRetry = jest.fn();
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error("429"))
      .mockResolvedValue("ok");

    await retry(operation, { ...FAST, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      1,
      expect.any(Number),
      expect.any(Error),
    );
  });

  it("stops when the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const operation = jest.fn().mockRejectedValue(new Error("429"));

    await expect(
      retry(operation, { ...FAST, signal: controller.signal }),
    ).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe("backoffDelay", () => {
  it("grows exponentially with the attempt number", () => {
    const first = backoffDelay(1, 1000, 30_000);
    const third = backoffDelay(3, 1000, 30_000);

    expect(first).toBeLessThanOrEqual(1000);
    expect(third).toBeGreaterThan(first);
  });

  it("never exceeds the ceiling", () => {
    expect(backoffDelay(20, 1000, 5000)).toBeLessThanOrEqual(5000);
  });

  it("applies jitter, so concurrent workers do not retry in lockstep", () => {
    const samples = new Set(
      Array.from({ length: 40 }, () => backoffDelay(4, 1000, 30_000)),
    );

    expect(samples.size).toBeGreaterThan(1);
  });
});

describe("isRetryableProviderError", () => {
  it.each([429, 408, 500, 502, 503, 504])("retries status %s", (status) => {
    expect(
      isRetryableProviderError(Object.assign(new Error("x"), { status })),
    ).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])("does not retry status %s", (status) => {
    expect(
      isRetryableProviderError(Object.assign(new Error("x"), { status })),
    ).toBe(false);
  });

  it.each([
    "Embeddings request failed [429]: quota exceeded",
    "The model is overloaded",
    "rate limit exceeded",
    "fetch failed",
    "ECONNRESET",
  ])("recognises %j from the message", (message) => {
    expect(isRetryableProviderError(new Error(message))).toBe(true);
  });

  it("does not retry a plain application error", () => {
    expect(isRetryableProviderError(new Error("Invalid API key"))).toBe(false);
  });
});
