import pickle
import yaml


# BAD: deserializing untrusted data.
def load_blob(blob):
    return pickle.loads(blob)


def load_config(path):
    return yaml.load(open(path))


# GOOD: safe alternatives.
def load_config_ok(path):
    return yaml.load(open(path), Loader=yaml.SafeLoader)


def load_json_ok(text):
    import json
    return json.loads(text)
