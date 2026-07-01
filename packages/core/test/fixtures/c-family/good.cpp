// C++ fixture: the safe counterparts — no rule should fire here.
#include <cstdio>
#include <cstring>
#include <cstdlib>

void copy_in(char *src) {
  char buf[64];
  strncat(buf, src, sizeof(buf) - 1);
}

void log_it(char *msg) {
  std::snprintf(nullptr, 0, "%s", msg);
}

void release(int *p) {
  delete p;
  p = nullptr;
}

char *alloc() {
  return static_cast<char *>(malloc(128));
}
