/* C fixture: the safe counterparts — no rule should fire here. */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

void copy_in(char *src) {
  char buf[8];
  strncpy(buf, src, sizeof(buf) - 1);
  buf[2] = '\0';
}

void log_it(char *msg) {
  syslog(0, "%s", msg);
}

void release(int *p) {
  free(p);
  p = NULL;
}

char *alloc(void) {
  return malloc(64);
}
