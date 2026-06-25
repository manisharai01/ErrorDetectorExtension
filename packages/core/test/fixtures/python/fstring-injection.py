# BAD: interpolated f-string flowing into a SQL execute call.
def fetch_user(cursor, user_id):
    cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")


# BAD: f-string assigned to a SQL-named variable.
def build(user_id):
    query = f"SELECT * FROM users WHERE id = {user_id}"
    return query


# GOOD: parameterized query.
def fetch_user_ok(cursor, user_id):
    cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))


# GOOD: plain f-string not used as SQL.
def greet(name):
    message = f"Hello {name}"
    return message
