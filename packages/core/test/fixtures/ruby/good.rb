# Fixture that triggers NO Ruby rules.

def find_user(db, id)
  # Parameterized query — no interpolation
  db.execute("SELECT * FROM users WHERE id = ?", [id])
end

def build_query(name)
  # Plain literal, no interpolation
  sql = "SELECT * FROM accounts"
  sql
end

def run_code
  # eval on a constant literal is left alone
  eval("1 + 1")
end

def load_config(text)
  # Safe loader
  YAML.safe_load(text)
end

def load_blob(text)
  # Literal argument, not flagged
  YAML.load("a: 1")
end

def do_output(logger, value)
  # A logger, not a bare debug print
  logger.info("value = #{value}")
end

def use_p
  # `p` as a local variable reference, not a call
  p = 42
  p
end

def risky_work(logger)
  begin
    do_something
  rescue => e
    logger.error(e)
  end
end
