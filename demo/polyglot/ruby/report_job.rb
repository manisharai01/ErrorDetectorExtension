# Fixture that triggers every Ruby rule.

def find_user(db, id)
  # IED-S020: SQL built with interpolation, passed to a DB method
  db.execute("SELECT * FROM users WHERE id = #{id}")
end

def build_query(name)
  # IED-S020: assigned to a `sql`-named variable
  sql = "DELETE FROM accounts WHERE name = #{name}"
  sql
end

def run_code(src)
  # IED-S021: eval on a variable
  eval(src)
end

def configure(obj, code)
  # IED-S021: instance_eval on a variable
  obj.instance_eval(code)
end

def load_blob(data)
  # IED-S022: unsafe deserialization on untrusted data
  Marshal.load(data)
end

def load_config(text)
  # IED-S022: YAML.load on a variable
  YAML.load(text)
end

def debug_stuff(value)
  # IED-Q018: leftover debug output
  puts "value = #{value}"
  p value
end

def risky_work
  begin
    do_something
  rescue => e
    # IED-L020: empty rescue swallows the exception
  end
end
