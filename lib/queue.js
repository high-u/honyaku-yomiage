/**
 * 非同期プロデューサー・コンシューマー用 FIFO キュー
 * 翻訳ワーカーが push し、TTS ワーカーが for await (... of queue) で非同期に取り出す。
 */
export class AsyncQueue {
  #buffer = [];
  #resolvers = [];
  #closed = false;
  #failure = undefined;

  push(item) {
    if (this.#closed) {
      throw new Error("Cannot push to a closed AsyncQueue");
    }
    if (this.#failure !== undefined) {
      throw this.#failure;
    }

    const waiter = this.#resolvers.shift();
    if (waiter) {
      waiter.resolve({ value: item, done: false });
    } else {
      this.#buffer.push(item);
    }
  }

  close() {
    this.#closed = true;
    while (this.#resolvers.length > 0) {
      const waiter = this.#resolvers.shift();
      waiter.resolve({ value: undefined, done: true });
    }
  }

  fail(err) {
    this.#failure = err;
    this.#closed = true;
    while (this.#resolvers.length > 0) {
      const waiter = this.#resolvers.shift();
      waiter.reject(err);
    }
  }

  get size() {
    return this.#buffer.length;
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.#failure !== undefined) {
          return Promise.reject(this.#failure);
        }
        if (this.#buffer.length > 0) {
          const value = this.#buffer.shift();
          return Promise.resolve({ value, done: false });
        }
        if (this.#closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve, reject) => {
          this.#resolvers.push({ resolve, reject });
        });
      },
    };
  }
}
