import os

func handle(_ user: User) {
    let logger = Logger()
    logger.print()
    logger.debug("entering handle")
    process(user)
}
