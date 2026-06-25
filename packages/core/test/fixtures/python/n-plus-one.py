# BAD: a query per loop iteration (N+1).
def list_orders(orders):
    result = []
    for order in orders:
        items = Item.objects.filter(order_id=order.id)
        result.append(items)
    return result


# GOOD: a single batched query outside the loop.
def list_orders_ok(order_ids):
    items = Item.objects.filter(order_id__in=order_ids)
    return list(items)
