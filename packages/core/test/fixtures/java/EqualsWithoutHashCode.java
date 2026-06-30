package fixtures;

class EqualsWithoutHashCode {
  private final int x;

  EqualsWithoutHashCode(int x) {
    this.x = x;
  }

  // BAD: equals without hashCode.
  @Override
  public boolean equals(Object o) {
    return o instanceof EqualsWithoutHashCode
        && ((EqualsWithoutHashCode) o).x == x;
  }
}

class EqualsWithHashCode {
  private final int x;

  EqualsWithHashCode(int x) {
    this.x = x;
  }

  // GOOD: both equals and hashCode are present.
  @Override
  public boolean equals(Object o) {
    return o instanceof EqualsWithHashCode
        && ((EqualsWithHashCode) o).x == x;
  }

  @Override
  public int hashCode() {
    return x;
  }
}

class NoEquals {
  // GOOD: neither method overridden.
  int value() {
    return 1;
  }
}
