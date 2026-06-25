import requests
import time
import asyncio
import aiohttp


# BAD: blocking calls inside async functions.
async def fetch(url):
    response = requests.get(url)
    time.sleep(1)
    return response.text


async def read_file(path):
    f = open(path)
    return f.read()


# GOOD: async equivalents.
async def fetch_ok(url):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            await asyncio.sleep(1)
            return await response.text()


# GOOD: blocking calls in a normal (sync) function are fine.
def fetch_sync(url):
    return requests.get(url)
