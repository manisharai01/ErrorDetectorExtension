package fixtures;

class NullDerefChain {
  // BAD: three method-call links with no intermediate null check.
  String city(Order order) {
    return order.getCustomer().getAddress().getCity();
  }

  // BAD: three field-access links.
  int deepField(Config cfg) {
    return cfg.db.pool.size;
  }

  // GOOD: only two links.
  String name(Order order) {
    return order.getCustomer().toString();
  }

  // GOOD: intermediate values pulled out and null-checked.
  String safeCity(Order order) {
    Customer c = order.getCustomer();
    if (c == null) return "";
    Address a = c.getAddress();
    return a == null ? "" : a.getCity();
  }
}
