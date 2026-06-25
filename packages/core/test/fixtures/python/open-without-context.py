# BAD: open() assigned to a variable, no context manager.
def read_all(path):
    f = open(path)
    data = f.read()
    f.close()
    return data


# GOOD: use a with statement.
def read_all_ok(path):
    with open(path) as f:
        return f.read()
