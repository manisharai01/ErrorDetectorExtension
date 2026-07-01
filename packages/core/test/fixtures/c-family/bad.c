/* C fixture exercising the bad paths of every c-family rule. */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

void copy_in(char *src) {
  char buf[8];
  strcpy(buf, src);   /* IED-S015 unbounded copy */
  buf[10] = '\0';     /* IED-S015 constant out-of-bounds index */
}

void log_it(char *msg) {
  printf(msg);              /* IED-S016 non-literal format */
  fprintf(stderr, msg);     /* IED-S016 non-literal format */
}

void release(int *p) {
  free(p);
  *p = 1;             /* IED-R010 use after free */
}

char *alloc(int n) {
  return malloc(n * sizeof(int)); /* IED-L017 size overflow */
}

void debug(int x) {
  printf("x = %d\n", x);  /* IED-Q016 debug printf */
}
