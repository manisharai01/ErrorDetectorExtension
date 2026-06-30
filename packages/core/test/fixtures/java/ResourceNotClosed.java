package fixtures;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.FileInputStream;

class ResourceNotClosed {
  // BAD: resource assigned to a local outside try-with-resources.
  void leak(String path) throws Exception {
    FileInputStream in = new FileInputStream(path);
    in.read();
  }

  // GOOD: managed by try-with-resources.
  void managed(String path) throws Exception {
    try (FileInputStream in = new FileInputStream(path)) {
      in.read();
    }
  }

  // GOOD: not a resource type, not flagged.
  void plain() {
    StringBuilder sb = new StringBuilder();
    sb.append("x");
  }

  // BAD outer (BufferedReader local), GOOD inner (FileReader is an argument,
  // not assigned to a local, so it is not flagged).
  void nested(String path) throws Exception {
    BufferedReader r = new BufferedReader(new FileReader(path));
    r.readLine();
  }
}
