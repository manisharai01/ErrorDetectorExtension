# Demo: Python bugs the interpreter only finds at runtime (or never).
import pickle


def add_tag(tag, tags=[]):  # IED-L011 mutable default, shared across calls
    tags.append(tag)
    return tags


def load_user(db, user_id):
    query = f"SELECT * FROM users WHERE id = {user_id}"  # IED-S012 SQL injection
    return db.execute(query)


def read_cache(path):
    f = open(path, "rb")  # IED-R005 file never closed on error; use `with`
    try:
        return pickle.load(f)  # IED-S013 unpickling untrusted data runs code
    except:  # IED-S011 bare except swallows KeyboardInterrupt too
        print("cache miss")  # IED-Q009 leftover print
        return None
