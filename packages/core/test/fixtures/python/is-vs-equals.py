# BAD: identity comparison against literals.
def check(x, name):
    if x is 5:
        return "five"
    if name is "admin":
        return "boss"
    if x is not 0:
        return "nonzero"
    return "other"


# GOOD: value comparison, and legitimate singleton identity checks.
def check_ok(x, flag):
    if x == 5:
        return "five"
    if x is None:
        return "missing"
    if flag is True:
        return "on"
    return "other"
