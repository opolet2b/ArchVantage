import asyncio
import time

def mock_init_schema():
    print("[Mock] Starting schema init...")
    time.sleep(3)  # Simulate blocking work
    print("[Mock] Schema init complete!")

async def startup_event():
    print("[Startup] Starting other services...")
    # This is what we did in main.py
    asyncio.create_task(asyncio.to_thread(mock_init_schema))
    print("[Startup] Other services started immediately!")

async def main():
    await startup_event()
    print("[Main] Server is now 'ready' for login.")
    await asyncio.sleep(4) # Wait to see if background task finishes

if __name__ == "__main__":
    asyncio.run(main())
