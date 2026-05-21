export interface TelegramRpcLimitSnapshot {
  active: number;
  queued: number;
  concurrency: number;
}

interface QueuedTask<T> {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

// Minimal FIFO limiter for GramJS calls; keeping it local avoids adding runtime dependencies.
export class TelegramRpcLimiter {
  private active = 0;
  private readonly queue: QueuedTask<unknown>[] = [];

  constructor(private readonly concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('Telegram RPC limiter concurrency must be at least 1.');
    }
  }

  getSnapshot(): TelegramRpcLimitSnapshot {
    return {
      active: this.active,
      queued: this.queue.length,
      concurrency: this.concurrency,
    };
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      // Queue the original task so execution starts only after a slot opens, not while waiting.
      return new Promise<T>((resolve, reject) => {
        this.queue.push({ run: task, resolve: resolve as (value: unknown) => void, reject });
      });
    }

    return this.runNow(task);
  }

  private async runNow<T>(task: () => Promise<T>): Promise<T> {
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.drain();
    }
  }

  private drain() {
    // Start queued tasks without awaiting them; each task releases its own slot in runNow().
    while (this.active < this.concurrency && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) return;
      void this.runNow(next.run)
        .then(next.resolve)
        .catch(next.reject);
    }
  }
}
