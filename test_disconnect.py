import asyncio
import httpx
import time

async def test_disconnect():
    print("Sending POST request to start generation...")
    async with httpx.AsyncClient() as client:
        # Start the request but disconnect after 2 seconds
        try:
            async with client.stream("POST", "http://localhost:8000/api/v1/executive_summary/generate", json={
                "source_docs": ["Some test content to generate"],
                "thing_id": "5ae4681a-c171-45ac-9723-18ba366245fa",
                "source_asset_ids": [],
                "llm_preset": "default",
                "vlm_preset": "default"
            }) as response:
                print("Connected! Reading first line...")
                async for line in response.aiter_lines():
                    print("Received:", line)
                    break # Read one line then break to simulate disconnect
        except Exception as e:
            print("Disconnected:", e)
            
    print("Disconnected. Now waiting 5 seconds for backend to potentially crash...")
    await asyncio.sleep(5)
    
    import sqlite3
    conn = sqlite3.connect("backend/db/sql_app.db")
    c = conn.cursor()
    c.execute("SELECT json_extract(content, '$.status'), json_extract(content, '$.error_message') FROM canvas_things WHERE id = '5ae4681a-c171-45ac-9723-18ba366245fa'")
    print("DB state after disconnect:", c.fetchone())
    conn.close()

if __name__ == "__main__":
    asyncio.run(test_disconnect())
