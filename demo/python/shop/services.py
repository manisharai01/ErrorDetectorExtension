from shop.models import Order


def notify(order):
    return f"order of {order.total} placed"


def reorder(total):
    return Order(total)
