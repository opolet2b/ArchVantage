import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.canvas_models import CanvasThing, Canvas
from app.models.user import User
from app.models.scenario_models import Scenario
from app.services.agent_primitives.canvas_primitives import CanvasSetPropertyPrimitive

async def test():
    db = SessionLocal()
    try:
        # create dummy canvas and thing
        canvas = Canvas(owner_id=1)
        db.add(canvas)
        db.commit()
        db.refresh(canvas)
        
        thing = CanvasThing(canvas_id=canvas.id, type="document", title="Original")
        db.add(thing)
        db.commit()
        db.refresh(thing)
        print(f"Original title: {thing.title}, color: {thing.color}")
        
        # Execute primitive
        primitive = CanvasSetPropertyPrimitive()
        state = {"db": db, "variables": {"thing_id": thing.id}}
        params = {"id": "{{thing_id}}", "title": "red", "color": "#ff0000"}
        
        res = await primitive.execute(params, state)
        print(f"Primitive result: success={res.success}, error={res.error}")
        
        # Fetch again to verify commit
        db.expire_all()
        thing2 = db.query(CanvasThing).filter(CanvasThing.id == thing.id).first()
        print(f"After title: {thing2.title}, color: {thing2.color}")
        
    finally:
        db.close()
        
asyncio.run(test())
