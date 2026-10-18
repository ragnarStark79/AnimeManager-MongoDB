export class RequestThrottler {
  private lastRequestTime = 0;
  private readonly minIntervalMs: number;
  private queue: Promise<void> = Promise.resolve();

  constructor(minIntervalMs = 350) {
    this.minIntervalMs = minIntervalMs;
  }

  async throttle(): Promise<void> {
    if (this.minIntervalMs <= 0) {
      return;
    }

    // Chain onto the queue to serialize invocations
    this.queue = this.queue.then(async () => {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < this.minIntervalMs) {
        const waitTime = this.minIntervalMs - elapsed;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
      this.lastRequestTime = Date.now();
    });

    return this.queue;
  }

  reset(): void {
    this.lastRequestTime = 0;
    this.queue = Promise.resolve();
  }
}
