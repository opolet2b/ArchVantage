"""
Canvas Primitives

Primitives for manipulating the Semantic Canvas from agent workflows.
Includes setting properties, moving nodes, and creating links.
"""
from typing import Any, Dict
from sqlalchemy.orm import Session
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult
from app.models.canvas_models import CanvasThing, Domain, CanvasLink


class CanvasSetPropertyPrimitive(BasePrimitive):
    """
    Primitive for updating properties of a canvas thing or domain.
    """
    
    @property
    def name(self) -> str:
        return "CANVAS_SET_PROPERTY"
    
    @property
    def description(self) -> str:
        return "Updates properties (color, title, metadata) of a canvas thing or domain."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "ID of the thing or domain to update (supports {{variable}} resolution)"
                },
                "color": {
                    "type": "string",
                    "description": "New hex color or CSS color name"
                },
                "title": {
                    "type": "string",
                    "description": "New title for the thing or domain"
                },
                "metadata": {
                    "type": "object",
                    "description": "Metadata fields to update"
                }
            },
            "required": ["id"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        db: Session = state.get("db")
        if not db:
            return PrimitiveResult(success=False, error="Database session not found in state.")
        
        target_id = params.get("id")
        if not target_id:
            return PrimitiveResult(success=False, error="Parameter 'id' is required.")
        
        # Resolve ID if it's a template
        if target_id.startswith("{{"):
            target_id = self.resolve_variables(target_id, state)
            
        try:
            # Try to find as a Thing first
            item = db.query(CanvasThing).filter(CanvasThing.id == target_id).first()
            if not item:
                # Try as a Domain
                item = db.query(Domain).filter(Domain.id == target_id).first()
            
            if not item:
                return PrimitiveResult(success=False, error=f"Target ID '{target_id}' not found on canvas.")
            
            # Apply updates
            if "color" in params:
                item.color = params["color"]
            if "title" in params:
                item.title = params["title"]
            if "metadata" in params:
                # Merge metadata if it's a thing
                if isinstance(item, CanvasThing):
                    # Thing doesn't have a direct 'metadata' field in model? 
                    # Checking canvas_models.py... it has 'content' (JSON).
                    # Actually, for things, scenarios use 'metadata' as part of 'content'?
                    # Or maybe it has summaries.
                    # Looking at models again... CanvasThing has 'content' (JSON) and 'summaries' (JSON).
                    # Scenario custom domains often store metadata in 'content'.
                    new_metadata = params["metadata"]
                    # If item has content, merge it?
                    current_content = item.content or {}
                    item.content = {**current_content, **new_metadata}
                elif isinstance(item, Domain):
                    # Domain has metadata_values
                    item.metadata_values = {**(item.metadata_values or {}), **params["metadata"]}
            
            db.commit()
            return PrimitiveResult(success=True, output={"id": target_id, "status": "updated"})
            
        except Exception as e:
            db.rollback()
            return PrimitiveResult(success=False, error=f"Failed to update property: {str(e)}")


class CanvasMovePrimitive(BasePrimitive):
    """
    Primitive for moving a canvas thing or domain.
    """
    
    @property
    def name(self) -> str:
        return "CANVAS_MOVE"
    
    @property
    def description(self) -> str:
        return "Programmatically moves a node to a different position or domain."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "ID of the item to move"
                },
                "target_domain_id": {
                    "type": "string",
                    "description": "Optional ID of the domain to move to"
                },
                "x": {
                    "type": "number",
                    "description": "Optional absolute X coordinate"
                },
                "y": {
                    "type": "number",
                    "description": "Optional absolute Y coordinate"
                }
            },
            "required": ["id"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        db: Session = state.get("db")
        if not db:
            return PrimitiveResult(success=False, error="Database session not found in state.")
        
        target_id = params.get("id")
        if target_id and target_id.startswith("{{"):
            target_id = self.resolve_variables(target_id, state)
            
        try:
            item = db.query(CanvasThing).filter(CanvasThing.id == target_id).first()
            if not item:
                item = db.query(Domain).filter(Domain.id == target_id).first()
                
            if not item:
                return PrimitiveResult(success=False, error=f"Target ID '{target_id}' not found.")
            
            # Update Position
            if "x" in params:
                item.position_x = float(params["x"])
            if "y" in params:
                item.position_y = float(params["y"])
                
            # Update Domain
            if "target_domain_id" in params:
                target_domain_id = params["target_domain_id"]
                if target_domain_id and target_domain_id.startswith("{{"):
                    target_domain_id = self.resolve_variables(target_domain_id, state)
                
                if isinstance(item, CanvasThing):
                    item.domain_id = target_domain_id
                elif isinstance(item, Domain):
                    item.parent_id = target_domain_id
            
            db.commit()
            return PrimitiveResult(success=True, output={"id": target_id, "status": "moved"})
            
        except Exception as e:
            db.rollback()
            return PrimitiveResult(success=False, error=f"Failed to move item: {str(e)}")


class CanvasLinkPrimitive(BasePrimitive):
    """
    Primitive for creating a link between two things.
    """
    
    @property
    def name(self) -> str:
        return "CANVAS_LINK"
    
    @property
    def description(self) -> str:
        return "Creates a semantic link between two things on the canvas."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "source_id": {
                    "type": "string",
                    "description": "ID of the source node"
                },
                "target_id": {
                    "type": "string",
                    "description": "ID of the target node"
                },
                "type": {
                    "type": "string",
                    "description": "Type of the link (e.g., 'related', 'references')",
                    "default": "related"
                },
                "label": {
                    "type": "string",
                    "description": "Optional label for the link"
                }
            },
            "required": ["source_id", "target_id"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        db: Session = state.get("db")
        if not db:
            return PrimitiveResult(success=False, error="Database session not found in state.")
        
        source_id = params.get("source_id")
        target_id = params.get("target_id")
        
        if source_id.startswith("{{"):
            source_id = self.resolve_variables(source_id, state)
        if target_id.startswith("{{"):
            target_id = self.resolve_variables(target_id, state)
            
        try:
            # Verify nodes exist
            source = db.query(CanvasThing).filter(CanvasThing.id == source_id).first()
            target = db.query(CanvasThing).filter(CanvasThing.id == target_id).first()
            
            if not source or not target:
                return PrimitiveResult(success=False, error="Source or Target node not found.")
            
            # Create link
            new_link = CanvasLink(
                canvas_id=source.canvas_id,
                source_id=source_id,
                target_id=target_id,
                type=params.get("type", "related"),
                label=params.get("label")
            )
            
            db.add(new_link)
            db.commit()
            
            return PrimitiveResult(success=True, output={"link_id": new_link.id, "status": "created"})
            
        except Exception as e:
            db.rollback()
            return PrimitiveResult(success=False, error=f"Failed to create link: {str(e)}")


class CanvasMoveToZonePrimitive(BasePrimitive):
    """
    Primitive for moving a thing to a specific Drop Zone within a domain.
    """
    
    @property
    def name(self) -> str:
        return "CANVAS_MOVE_TO_ZONE"
    
    @property
    def description(self) -> str:
        return "Moves a node to a specific named Drop Zone within a domain."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "ID of the thing to move"
                },
                "domain_id": {
                    "type": "string",
                    "description": "ID of the target domain"
                },
                "zone_id": {
                    "type": "string",
                    "description": "ID of the drop zone within the domain"
                }
            },
            "required": ["id", "domain_id", "zone_id"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        db: Session = state.get("db")
        if not db:
            return PrimitiveResult(success=False, error="Database session not found.")
        
        thing_id = params.get("id")
        domain_id = params.get("domain_id")
        zone_id = params.get("zone_id")
        
        # Resolve variables
        if thing_id and thing_id.startswith("{{"): thing_id = self.resolve_variables(thing_id, state)
        if domain_id and domain_id.startswith("{{"): domain_id = self.resolve_variables(domain_id, state)
        if zone_id and zone_id.startswith("{{"): zone_id = self.resolve_variables(zone_id, state)
            
        try:
            thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
            if not thing:
                return PrimitiveResult(success=False, error=f"Thing '{thing_id}' not found.")
                
            domain = db.query(Domain).filter(Domain.id == domain_id).first()
            if not domain:
                return PrimitiveResult(success=False, error=f"Domain '{domain_id}' not found.")
            
            # Find Zone
            drop_zones = domain.drop_zones or []
            target_zone = next((z for z in drop_zones if z.get("id") == zone_id), None)
            
            if not target_zone:
                return PrimitiveResult(success=False, error=f"Zone '{zone_id}' not found in domain '{domain.name}'.")
            
            # Calculate Target Position (Center of Zone)
            zx = target_zone.get("x", 0)
            zy = target_zone.get("y", 0)
            zw = target_zone.get("width", 200)
            zh = target_zone.get("height", 100)
            
            center_x = domain.position_x + zx + (zw / 2)
            center_y = domain.position_y + zy + (zh / 2)
            
            # Update Thing
            thing.position_x = center_x
            thing.position_y = center_y
            thing.domain_id = domain.id
            
            db.commit()
            return PrimitiveResult(success=True, output={
                "id": thing.id, 
                "status": "moved_to_zone",
                "position": {"x": center_x, "y": center_y}
            })
            
        except Exception as e:
            db.rollback()
            return PrimitiveResult(success=False, error=str(e))


class CanvasMoveToCanvasPrimitive(BasePrimitive):
    """
    Primitive for moving a thing to a different canvas.
    """
    
    @property
    def name(self) -> str:
        return "CANVAS_MOVE_TO_CANVAS"
    
    @property
    def description(self) -> str:
        return "Moves a node to a completely different canvas."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "ID of the thing to move"
                },
                "target_canvas_id": {
                    "type": "string",
                    "description": "ID of the destination canvas"
                },
                "position": {
                    "type": "object",
                    "properties": {
                        "x": {"type": "number"},
                        "y": {"type": "number"}
                    },
                    "description": "Optional new position on target canvas"
                }
            },
            "required": ["id", "target_canvas_id"]
        }
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        db: Session = state.get("db")
        if not db:
            return PrimitiveResult(success=False, error="Database session not found.")
            
        thing_id = params.get("id")
        target_canvas_id = params.get("target_canvas_id")
        
        if thing_id and thing_id.startswith("{{"): thing_id = self.resolve_variables(thing_id, state)
        if target_canvas_id and target_canvas_id.startswith("{{"): target_canvas_id = self.resolve_variables(target_canvas_id, state)
        
        try:
            thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
            if not thing:
                return PrimitiveResult(success=False, error=f"Thing '{thing_id}' not found.")
            
            old_canvas_id = thing.canvas_id
            
            # Update Canvas ID
            thing.canvas_id = target_canvas_id
            thing.domain_id = None # clear domain as it belongs to old canvas
            
            # Update Position if provided
            if "position" in params and isinstance(params["position"], dict):
                thing.position_x = float(params["position"].get("x", 0))
                thing.position_y = float(params["position"].get("y", 0))
            else:
                thing.position_x = 100
                thing.position_y = 100
            
            db.commit()
            return PrimitiveResult(success=True, output={
                "id": thing.id, 
                "status": "moved_canvas",
                "old_canvas": old_canvas_id,
                "new_canvas": target_canvas_id
            })
            
        except Exception as e:
            db.rollback()
            return PrimitiveResult(success=False, error=str(e))

