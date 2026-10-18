interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class BoundedTtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(defaultTtlMs = 300000, maxEntries = 200) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh key order for LRU behavior (delete and re-insert)
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (value === undefined || value === null) {
      return;
    }

    // Evict oldest if reaching capacity
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }

    const duration = ttlMs ?? this.defaultTtlMs;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + duration,
    });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
