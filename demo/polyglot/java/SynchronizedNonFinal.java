package fixtures;

class SynchronizedNonFinal {
  private Object lock = new Object();        // non-final
  private final Object safeLock = new Object();

  // BAD: synchronizing on a non-final field.
  void bad() {
    synchronized (lock) {
      doWork();
    }
  }

  // BAD: same, written as this.lock.
  void badThis() {
    synchronized (this.lock) {
      doWork();
    }
  }

  // GOOD: synchronizing on a final field.
  void good() {
    synchronized (safeLock) {
      doWork();
    }
  }

  // GOOD: lock is a local, not a field.
  void localLock() {
    Object local = new Object();
    synchronized (local) {
      doWork();
    }
  }

  void doWork() {}
}
