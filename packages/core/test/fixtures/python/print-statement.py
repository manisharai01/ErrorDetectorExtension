import logging

logger = logging.getLogger(__name__)


# BAD: leftover debug prints.
def process(items):
    print("starting")
    for item in items:
        print(item)


# GOOD: use logging.
def process_ok(items):
    logger.info("starting")
    for item in items:
        logger.debug(item)
