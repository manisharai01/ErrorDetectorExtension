package fixtures;

class SystemOutPrintln {
  // BAD: System.out printing instead of a logger.
  void report(String id) {
    System.out.println("user " + id);
    System.out.print("done");
    System.out.printf("%d%n", 1);
  }

  // GOOD: uses a logger.
  private static final java.util.logging.Logger log =
      java.util.logging.Logger.getLogger("x");

  void logged(String id) {
    log.info("user " + id);
  }
}
