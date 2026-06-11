/**
 * ArchiveCycleGuard serializes concurrent `runArchiveCycle` invocations and
 * manages the stash-and-replay re-entrancy guard for concurrent `start()` calls.
 *
 * Concurrency model:
 * - Only one cycle runs at a time. A second call while a cycle is in-flight ORs
 *   its `force` flag into `_pendingForce` and returns the in-flight promise.
 * - When the in-flight cycle completes, exactly one follow-up cycle runs with
 *   the strongest `force` value seen during coalescing.
 * - `start()` re-entrancy is managed via `beginStart()` / `endStart()`:
 *   the first caller acquires the lock; subsequent callers stash their config
 *   and return immediately.
 */
export class ArchiveCycleGuard {
  private _inFlightCycle: Promise<void> | undefined = undefined;
  private _pendingForce: boolean | undefined = undefined;
  private _starting = false;

  /**
   * Run `fn(force)` as a serialized cycle. If a cycle is already in-flight,
   * coalesces the `force` flag and returns the existing promise.
   */
  public run(fn: (force: boolean) => Promise<void>, force: boolean): Promise<void> {
    if (this._inFlightCycle) {
      this._pendingForce = (this._pendingForce ?? false) || force;
      return this._inFlightCycle;
    }
    this._inFlightCycle = fn(force).finally(async () => {
      this._inFlightCycle = undefined;
      const pf = this._pendingForce;
      if (pf !== undefined) {
        this._pendingForce = undefined;
        await this.run(fn, pf);
      }
    });
    return this._inFlightCycle;
  }

  /**
   * Await the in-flight cycle (if any) and clear the pending-force slot.
   * Used by `stop()` to ensure no orphaned cycle runs after stop returns.
   */
  public async awaitAndReset(): Promise<void> {
    await this._inFlightCycle;
    this._pendingForce = undefined;
  }

  /**
   * Attempt to acquire the start lock.
   * Returns `true` when the lock was free and is now held by this caller.
   * Returns `false` when the lock was already held — caller should stash config.
   */
  public beginStart(): boolean {
    if (this._starting) {
      return false;
    }
    this._starting = true;
    return true;
  }

  /**
   * Release the start lock.
   */
  public endStart(): void {
    this._starting = false;
  }

  /**
   * Whether a `start()` is currently in progress.
   */
  public get isStarting(): boolean {
    return this._starting;
  }
}
