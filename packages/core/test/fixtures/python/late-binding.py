# BAD: the lambda captures `i` by reference; all callbacks see the last value.
callbacks = []
for i in range(3):
    callbacks.append(lambda: i)

# BAD: same problem inside a comprehension.
funcs = [lambda: n for n in range(5)]


# GOOD: bind the loop variable as a default argument.
fixed = []
for j in range(3):
    fixed.append(lambda j=j: j)

# GOOD: comprehension that binds the variable.
ok_funcs = [lambda m=m: m for m in range(5)]
