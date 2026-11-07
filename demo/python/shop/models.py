# Demo: models.py and services.py import each other at module load ->
# IED-X001 import cycle ("partially initialized module" at runtime).
from .services import notify


class Order:
    def __init__(self, total):
        self.total = total
        notify(self)
