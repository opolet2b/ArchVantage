import asyncio
from app.services.workflow_service import get_saver
from app.core.database import SessionLocal, get_db_path
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
import aiosqlite

async def main():
    config = {"configurable": {"thread_id": "debug_inst_999"}}
    db_path = get_db_path() or "backend/db/sql_app.db"
    async with aiosqlite.connect(db_path) as aio_conn:
        async_saver = AsyncSqliteSaver(aio_conn)
        state_snap = await async_saver.aget(config)
        print("type(state_snap):", type(state_snap))
        if isinstance(state_snap, dict):
            print("Keys in state_snap:", list(state_snap.keys()))
        else:
            print("Attributes of state_snap:", dir(state_snap))
            
if __name__ == "__main__":
    asyncio.run(main())
