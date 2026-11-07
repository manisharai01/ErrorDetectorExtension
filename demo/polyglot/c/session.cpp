// C++ fixture exercising the bad paths of every c-family rule.
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <iostream>

void copy_in(char *src) {
  char buf[4];
  strcat(buf, src);   // IED-S015 unbounded copy
}

void log_it(char *msg) {
  std::snprintf(nullptr, 0, msg); // IED-S016 non-literal format
}

void release(int *p) {
  delete p;
  int x = *p;         // IED-R010 use after free
  (void)x;
}

char *alloc(int n, int w) {
  return static_cast<char *>(malloc(n * w)); // IED-L017 size overflow
}

void debug(int x) {
  std::cout << "x = " << x << std::endl; // IED-Q016 debug cout
}
