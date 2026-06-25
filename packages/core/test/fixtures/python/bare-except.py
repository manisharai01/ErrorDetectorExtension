# BAD: bare except swallows everything.
def risky():
    try:
        do_work()
    except:
        pass


# GOOD: catch a specific exception type.
def careful():
    try:
        do_work()
    except ValueError as e:
        handle(e)
    except (KeyError, IndexError):
        recover()
