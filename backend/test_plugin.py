import asyncio
import sys
sys.path.append("C:/Users/opole/Documents/Work/T2B/Projects/Internal/ArchVantage/backend")
from unittest.mock import MagicMock
from app.plugins.trade_off_matrix import extract_trade_off_matrix_options
from app.schemas.canvas_schemas import AnalyzeAction

async def main():
    try:
        request = MagicMock()
        request.action = AnalyzeAction.ASK
        request.custom_prompt = "You are an expert Enterprise Architect analyzing a document."
        request.thing_id = "test_123"
        
        thing = MagicMock()
        thing.canvas_id = "canvas_123"
        thing.content = {}
        
        db = MagicMock()
        db.query().filter().first.return_value = MagicMock()
        user = MagicMock()
        
        res = await extract_trade_off_matrix_options(request, thing, db, user)
        print("Result:", res)
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(main())
