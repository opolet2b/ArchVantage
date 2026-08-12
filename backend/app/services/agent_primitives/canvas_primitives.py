"""
Canvas Primitives

Primitives for manipulating the ArchVantage from agent workflows.
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
        if target_id and isinstance(target_id, str) and target_id.startswith("{{"):
            target_id = self.resolve_variables(target_id, state)
            
        # Ensure we have an ID (handle loop items)
        target_id = self._ensure_id(target_id)
            
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
        if target_id and isinstance(target_id, str) and target_id.startswith("{{"):
            target_id = self.resolve_variables(target_id, state)
            
        # Ensure we have an ID (handle loop items)
        target_id = self._ensure_id(target_id)
            
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
                if target_domain_id and isinstance(target_domain_id, str) and target_domain_id.startswith("{{"):
                    target_domain_id = self.resolve_variables(target_domain_id, state)
                
                # Ensure we have an ID
                target_domain_id = self._ensure_id(target_domain_id)
                
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
        
        if isinstance(source_id, str) and source_id.startswith("{{"):
            source_id = self.resolve_variables(source_id, state)
        if isinstance(target_id, str) and target_id.startswith("{{"):
            target_id = self.resolve_variables(target_id, state)
            
        # Ensure we have IDs (handle loop variables/objects)
        source_id = self._ensure_id(source_id)
        target_id = self._ensure_id(target_id)
            
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
        if thing_id and isinstance(thing_id, str) and thing_id.startswith("{{"): thing_id = self.resolve_variables(thing_id, state)
        if domain_id and isinstance(domain_id, str) and domain_id.startswith("{{"): domain_id = self.resolve_variables(domain_id, state)
        if zone_id and isinstance(zone_id, str) and zone_id.startswith("{{"): zone_id = self.resolve_variables(zone_id, state)
            
        # Ensure we have IDs (handle loop variables/objects)
        thing_id = self._ensure_id(thing_id)
        domain_id = self._ensure_id(domain_id)
        zone_id = self._ensure_id(zone_id)
            
        try:
            thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
            if not thing:
                return PrimitiveResult(success=False, error=f"Thing '{thing_id}' not found.")
                
            domain = db.query(Domain).filter(Domain.id == domain_id).first()
            
            if not domain:
                # Fallback: Check if 'domain_id' is actually a Definition ID (stored in 'type')
                # We need to find the instance on the CURRENT canvas.
                canvas_id = state.get("canvas_id") or state.get("variables", {}).get("canvas_id")
                
                # DEBUG: List all domains on this canvas to see what we have
                if canvas_id:
                     print(f"[MoveToZone DEBUG] Canvas ID from state: {canvas_id}")
                     all_domains = db.query(Domain).filter(Domain.canvas_id == canvas_id).all()
                     print(f"[MoveToZone DEBUG] Found {len(all_domains)} domains on canvas:")
                     for d in all_domains:
                         print(f"  - ID: {d.id}, Name: {d.name}, Type: {d.type}")

                if canvas_id:
                     print(f"[MoveToZone] Domain '{domain_id}' not found by ID. Searching by type on canvas '{canvas_id}'...")
                     domain = db.query(Domain).filter(
                         Domain.canvas_id == canvas_id,
                         Domain.type == domain_id
                     ).first()
            
            if not domain:
                return PrimitiveResult(success=False, error=f"Domain '{domain_id}' not found (checked ID and Type).")
            
            # Find Zone
            drop_zones = domain.drop_zones or []
            if isinstance(drop_zones, str):
                import json
                try:
                    drop_zones = json.loads(drop_zones)
                except Exception:
                    drop_zones = []

            # If no drop zones on the domain record, look up definitions in Canvas/Scenario config
            if not drop_zones:
                from app.models.canvas_models import Canvas
                canvas = db.query(Canvas).filter(Canvas.id == domain.canvas_id).first()
                if canvas and canvas.owner_config:
                    domain_definitions = []
                    scenario_id = canvas.owner_config.get("scenario_id")
                    if scenario_id:
                        from app.models.scenario_models import Scenario
                        scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
                        if scenario and scenario.configuration:
                            domain_definitions = scenario.configuration.get("domain_definitions", [])

                    # Fallback to local canvas config definitions
                    if not domain_definitions:
                        domain_definitions = canvas.owner_config.get("domain_definitions", [])

                    # Find matching definition by type/id or name
                    definition = None
                    for defn in domain_definitions:
                        if (domain.type and defn.get("id") == domain.type) or defn.get("name") == domain.name:
                            definition = defn
                            break

                    if definition:
                        drop_zones = definition.get("drop_zones") or []

            # Try to match zone by ID, Label, or Name (case-insensitive)
            target_zone = None
            if drop_zones:
                for z in drop_zones:
                    if not isinstance(z, dict):
                        continue
                    z_id = str(z.get("id", ""))
                    z_label = str(z.get("label", ""))
                    z_name = str(z.get("name", ""))

                    if (z_id == str(zone_id) or
                        z_label.lower() == str(zone_id).lower() or
                        z_name.lower() == str(zone_id).lower()):
                        target_zone = z
                        break

            if not target_zone:
                # Fallback: if no matching zone but domain exists, place in center of the domain
                center_x = domain.position_x + (domain.width or 300) / 2
                center_y = domain.position_y + (domain.height or 200) / 2
                print(f"[MoveToZone] Zone '{zone_id}' not found in domain '{domain.name}'. "
                      f"Falling back to domain center: ({center_x:.1f}, {center_y:.1f})")
            else:
                # Calculate Target Position (Center of Zone)
                # Frontend uses explicit coordinates or Grid Layout if missing.
                # Mirror Frontend Grid Logic: 2 columns, specific padding
                zx = target_zone.get("x", 0)
                zy = target_zone.get("y", 0)
                zw = target_zone.get("width", 0)
                zh = target_zone.get("height", 0)

                # If no explicit geometry, calculate Grid Position
                if zx == 0 and zy == 0:
                    d_w = getattr(domain, 'width', 300) or 300
                    d_h = getattr(domain, 'height', 400) or 400

                    # Layout Constants (matching domain-node.tsx)
                    padding_top = 32
                    padding_bottom = 8
                    padding_x = 8
                    gap = 8

                    # Grid Setup
                    num_zones = len(drop_zones)
                    cols = 2 if num_zones > 1 else 1
                    import math
                    rows = math.ceil(num_zones / cols)

                    # Find Zone Index
                    zone_idx = 0
                    for i, z in enumerate(drop_zones):
                        if z.get("id") == target_zone.get("id"):
                            zone_idx = i
                            break

                    # Grid Position (Row/Col)
                    row_idx = zone_idx // cols
                    col_idx = zone_idx % cols

                    # Available Space
                    avail_w = d_w - (2 * padding_x)
                    avail_h = d_h - (padding_top + padding_bottom)

                    # Cell Dimensions
                    total_gap_w = (cols - 1) * gap
                    total_gap_h = (rows - 1) * gap

                    cell_w = max(1, (avail_w - total_gap_w) / cols)
                    cell_h = max(1, (avail_h - total_gap_h) / rows)

                    # Center Relative to Domain (0,0)
                    rel_center_x = padding_x + (col_idx * (cell_w + gap)) + (cell_w / 2)
                    rel_center_y = padding_top + (row_idx * (cell_h + gap)) + (cell_h / 2)

                    # Absolute Position
                    center_x = domain.position_x + rel_center_x
                    center_y = domain.position_y + rel_center_y

                    print(f"[MoveToZone] Calculated Grid Target: idx={zone_idx} ({row_idx},{col_idx}) -> ({center_x:.1f}, {center_y:.1f})")

                else:
                    # Use Explicit Geometry
                    zw = zw or 200
                    zh = zh or 100
                    center_x = domain.position_x + zx + (zw / 2)
                    center_y = domain.position_y + zy + (zh / 2)
                print(f"[MoveToZone] Using Explicit Geometry: ({center_x}, {center_y})")

            # Logs for debug
            print(f"[MoveToZone] Domain Pos: ({domain.position_x}, {domain.position_y})")
            
            # Update Thing
            thing.position_x = center_x
            thing.position_y = center_y
            thing.domain_id = domain.id
            
            db.commit()
            return PrimitiveResult(
                success=True, 
                output={
                    "id": thing.id, 
                    "thing_id": thing.id,
                    "status": "moved_to_zone",
                    "position": {"x": center_x, "y": center_y},
                    "realization_required": True,
                    "action": "move"
                }
            )
            
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


class CanvasBatchLinkPrimitive(BasePrimitive):
    """
    Primitive for creating links from one source to many targets.
    Useful for linking a newly created/handled thing to all members of a domain.
    """
    
    @property
    def name(self) -> str:
        return "CANVAS_BATCH_LINK"
    
    @property
    def description(self) -> str:
        return "Creates semantic links from a source node to multiple target nodes."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "source_id": {
                    "type": "string",
                    "description": "ID of the source node"
                },
                "target_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of target node IDs"
                },
                "type": {
                    "type": "string",
                    "description": "Type of the link (e.g., 'related', 'references')",
                    "default": "related"
                },
                "label": {
                    "type": "string",
                    "description": "Optional label for the links"
                },
                "description": {
                    "type": "string",
                    "description": "Optional description for the links"
                }
            },
            "required": ["source_id", "target_ids"]
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
        target_ids = params.get("target_ids", [])
        
        if not target_ids:
            return PrimitiveResult(success=True, output={"links_created": 0, "status": "no_targets"})

        # Resolve IDs if they are templates
        if source_id and isinstance(source_id, str) and source_id.startswith("{{"):
            source_id = self.resolve_variables(source_id, state)
            
        # Resolve target_ids if it's a template string
        if isinstance(target_ids, str) and target_ids.strip().startswith("{{"):
             target_ids = self.resolve_variables(target_ids, state)

        # Ensure source_id is a string ID
        source_id = self._ensure_id(source_id)

        # Robust Parsing: If target_ids is a string (e.g. "['id1', 'id2']"), parse it
        if isinstance(target_ids, str):
            target_ids = target_ids.strip()
            if target_ids.startswith("[") and target_ids.endswith("]"):
                try:
                    import json
                    target_ids = json.loads(target_ids.replace("'", '"'))
                except Exception:
                    # Fallback for more complex stringified lists
                    try:
                        import ast
                        target_ids = ast.literal_eval(target_ids)
                    except Exception as e:
                        print(f"[CanvasBatchLink] Failed to parse target_ids string: {e}")
            else:
                # Treat as single ID if it's just one string
                target_ids = [target_ids]

        if not isinstance(target_ids, list):
            print(f"[CanvasBatchLink] WARNING: target_ids is not a list after resolution/parsing: {type(target_ids)}")
            target_ids = [target_ids] if target_ids else []

        # Ensure all target_ids are string IDs (handle loop objects in the list)
        target_ids = [self._ensure_id(tid) for tid in target_ids if tid]
        target_ids = [tid for tid in target_ids if tid] # Filter out failures

        try:
            # Verify source exists
            source = db.query(CanvasThing).filter(CanvasThing.id == source_id).first()
            if not source:
                return PrimitiveResult(success=False, error=f"Source node '{source_id}' not found.")
            
            created_count = 0
            link_ids = []
            
            for t_id in target_ids:
                if not t_id or t_id == source_id:
                    continue
                
                # Verify target exists on the SAME canvas
                target = db.query(CanvasThing).filter(
                    CanvasThing.id == t_id,
                    CanvasThing.canvas_id == source.canvas_id
                ).first()
                
                if not target:
                    print(f"[CanvasBatchLink] WARNING: Target '{t_id}' not found or on different canvas. Skipping.")
                    continue
                
                # Check for existing link to avoid duplicates
                existing = db.query(CanvasLink).filter(
                    CanvasLink.source_id == source_id,
                    CanvasLink.target_id == t_id,
                    CanvasLink.type == params.get("type", "related")
                ).first()
                
                if existing:
                    continue
                
                # Create link
                new_link = CanvasLink(
                    canvas_id=source.canvas_id,
                    source_id=source_id,
                    target_id=t_id,
                    type=params.get("type", "related"),
                    label=params.get("label"),
                    description=params.get("description")
                )
                db.add(new_link)
                created_count += 1
            
            db.commit()
            
            return PrimitiveResult(success=True, output={
                "links_created": created_count, 
                "status": "success"
            })
            
        except Exception as e:
            db.rollback()
            return PrimitiveResult(success=False, error=f"Failed to create batch links: {str(e)}")

