# BAD: mutable defaults are shared across calls.
def append_item(item, bucket=[]):
    bucket.append(item)
    return bucket


def add_pair(key, value, cache={}):
    cache[key] = value
    return cache


def collect(tag, seen={"start"}):
    seen.add(tag)
    return seen


# GOOD: use None as a sentinel and build inside the body.
def append_item_ok(item, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket


# GOOD: immutable defaults are fine.
def greet(name, prefix="Hi", count=1, tup=()):
    return prefix * count + name
