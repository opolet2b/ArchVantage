
import networkx as nx
import numpy as np
from sqlalchemy.orm import Session
from typing import List, Dict, Optional, Tuple
from app.models.canvas_models import CanvasThing, CanvasLink

class LayoutService:
    def __init__(self):
        pass

    def arrange_things(self, db: Session, canvas_id: str, thing_ids: List[str] = None):
        """
        Arrange the specified things (or all things in canvas if thing_ids is None)
        using a force-directed layout with overlap removal.
        Incorporates Connected Component analysis to group related things together.
        """
        # 1. Fetch Data
        query = db.query(CanvasThing).filter(CanvasThing.canvas_id == canvas_id)
        if thing_ids:
            query = query.filter(CanvasThing.id.in_(thing_ids))
        
        things = query.all()
        if not things:
            print("[LayoutService] No things to arrange.")
            return

        # Map things by ID for easy access
        things_map = {t.id: t for t in things}

        # Fetch relevant links
        # We only care about links where BOTH source and target are in our set of things
        target_ids = {t.id for t in things}
        
        links_query = db.query(CanvasLink).filter(
            CanvasLink.canvas_id == canvas_id,
            CanvasLink.source_id.in_(target_ids),
            CanvasLink.target_id.in_(target_ids)
        )
        links = links_query.all()

        print(f"[LayoutService] Arranging {len(things)} things and {len(links)} links.")

        # 2. Build NetworkX Graph
        G = nx.Graph()
        
        # Add nodes with their dimensions
        for t in things:
            # Default size if missing
            w = t.width if t.width else 300  # Default to 300 for clearer spacing
            h = t.height if t.height else 200
            G.add_node(t.id, width=w, height=h, obj=t)

        # Add edges
        for l in links:
            # High weight helps keep connected nodes close
            G.add_edge(l.source_id, l.target_id, weight=1.0)

        # 3. Handle Connected Components
        # This prevents the "hairball" effect where independent groups form a giant ring.
        components = list(nx.connected_components(G))
        print(f"[LayoutService] Found {len(components)} connected components.")

        # We will layout each component individually, then pack them.
        final_pos = {}
        
        # Packing state
        # We'll place components in a grid/spiral trying to keep aspect ratio square-ish
        # For simplicity: Sort by size, place in rows.
        
        # Sort components by node count (descending)
        components.sort(key=len, reverse=True)

        current_x_offset = 0
        current_y_offset = 0
        row_height = 0
        
        # Max row width heuristic. For N items, we want roughly sqrt(N) * width.
        # Let's say average item is 300px wide.
        total_items = len(things)
        approx_diagram_width = max(1000, 400 * int(np.sqrt(total_items)))
        max_row_width = approx_diagram_width
        
        padding_between_groups = 100

        for comp_nodes in components:
            subgraph = G.subgraph(comp_nodes)
            num_nodes = len(comp_nodes)
            
            # Determine scale/k based on component size
            # avg_width for this component
            comp_widths = [G.nodes[n]['width'] for n in comp_nodes]
            avg_width = np.mean(comp_widths) if comp_widths else 300
            
            # Layout Algorithm Selection
            # Kamada-Kawai describes structure better but is O(N^2)
            # Spring is O(N). For small components (common), both are fast.
            # Use KK for decent size components, Spring for huge ones if speed is concern.
            # Given user request for "grouping", KK is preferred.
            
            try:
                # Scale needs to be large enough to avoid overlap
                # KK scale is the bounding box side length roughly.
                # Heuristic: 250px per node linear density?
                scale_val = avg_width * np.sqrt(num_nodes) * 1.5
                if num_nodes < 2:
                    sub_pos = nx.spring_layout(subgraph, k=300, iterations=10, scale=300)
                else:
                    # Check if scipy is available for KK (it should be)
                    # If not, fallback to spring
                    try:
                        import scipy
                        sub_pos = nx.kamada_kawai_layout(subgraph, scale=scale_val)
                    except ImportError:
                        print("[LayoutService] Scipy not found, using spring layout")
                        k_val = avg_width * 1.5
                        sub_pos = nx.spring_layout(subgraph, k=k_val, iterations=50, scale=avg_width * np.sqrt(num_nodes))
                    
            except Exception as e:
                print(f"[LayoutService] Kamada-Kawai failed ({e}), falling back to spring.")
                k_val = avg_width * 1.5
                sub_pos = nx.spring_layout(subgraph, k=k_val, iterations=50, scale=avg_width * np.sqrt(num_nodes))

            # Shift sub_pos to current packing location
            if not sub_pos:
                continue

            # 1. Normalize sub_pos to be positive-ish relative to its own center
            sub_xs = [p[0] for p in sub_pos.values()]
            sub_ys = [p[1] for p in sub_pos.values()]
            min_x, max_x = min(sub_xs), max(sub_xs)
            min_y, max_y = min(sub_ys), max(sub_ys)
            
            comp_width = max_x - min_x
            comp_height = max_y - min_y
            
            # Move to (0,0) then to offset
            for nid, (x, y) in sub_pos.items():
                final_pos[nid] = np.array([
                    x - min_x + current_x_offset,
                    y - min_y + current_y_offset
                ])
            
            # Update packing offsets
            current_x_offset += comp_width + padding_between_groups
            row_height = max(row_height, comp_height)
            
            # Wrap to next row if too wide
            if current_x_offset > max_row_width:
                current_x_offset = 0
                current_y_offset += row_height + padding_between_groups
                row_height = 0

        # 4. Remove Overlaps (Global Pass)
        # Even with good layout, nodes might slightly overlap.
        # Run overlap removal on the FINAL combined layout.
        print("[LayoutService] Removing overlaps...")
        # Reduce iterations for global pass to avoid excessive wait if graph is huge
        final_pos = self._remove_overlaps(G, final_pos, iterations=50)

        # 5. Update Database
        # Center the whole diagram around current view or 0,0?
        # Let's Center around 0,0 for consistency.
        all_xs = [p[0] for p in final_pos.values()]
        all_ys = [p[1] for p in final_pos.values()]
        if all_xs:
            center_x = (min(all_xs) + max(all_xs)) / 2
            center_y = (min(all_ys) + max(all_ys)) / 2
            
            # Reposition everything relative to center
            # Also try to maintain the original centroid of the *input things* to avoid "teleporting"
            
            # Calculate old centroid
            old_xs = [t.position_x for t in things]
            old_ys = [t.position_y for t in things]
            old_center_x = np.mean(old_xs) if old_xs else 0
            old_center_y = np.mean(old_ys) if old_ys else 0
            
            # Shift vector
            dx = old_center_x - center_x
            dy = old_center_y - center_y
            
            for t in things:
                if t.id in final_pos:
                    new_pos = final_pos[t.id]
                    t.position_x = float(new_pos[0] + dx)
                    t.position_y = float(new_pos[1] + dy)
            
            db.commit()
            print("[LayoutService] Layout updated successfully.")
        else:
            print("[LayoutService] Layout resulted in empty positions.")


    def _remove_overlaps(self, G, pos: Dict[str, np.ndarray], iterations=50) -> Dict[str, np.ndarray]:
        """
        Iterative overlap removal.
        Treats nodes as rectangles. Pushes overlapping rectangles apart.
        """
        # Convert pos to mutable dict of [x, y]
        current_pos = {k: np.array(v) for k, v in pos.items()}
        nodes = list(G.nodes(data=True)) # List of (id, data)

        for it in range(iterations):
            max_move = 0
            moved = False
            
            # Simple pairwise check
            for i in range(len(nodes)):
                id_a, data_a = nodes[i]
                if id_a not in current_pos: continue
                pos_a = current_pos[id_a]
                w_a = data_a.get('width', 200) + 20 # Add padding
                h_a = data_a.get('height', 100) + 20
                
                l_a = pos_a[0] - (w_a / 2)
                r_a = pos_a[0] + (w_a / 2)
                t_a = pos_a[1] - (h_a / 2)
                b_a = pos_a[1] + (h_a / 2)

                for j in range(i + 1, len(nodes)):
                    id_b, data_b = nodes[j]
                    if id_b not in current_pos: continue
                    pos_b = current_pos[id_b]
                    w_b = data_b.get('width', 200) + 20
                    h_b = data_b.get('height', 100) + 20

                    l_b = pos_b[0] - (w_b / 2)
                    r_b = pos_b[0] + (w_b / 2)
                    t_b = pos_b[1] - (h_b / 2)
                    b_b = pos_b[1] + (h_b / 2)

                    # Check intersection
                    if not (l_a >= r_b or r_a <= l_b or t_a >= b_b or b_a <= t_b):
                        # Overlap detected
                        ox = min(r_a, r_b) - max(l_a, l_b)
                        oy = min(b_a, b_b) - max(t_a, t_b)

                        dx = pos_a[0] - pos_b[0]
                        dy = pos_a[1] - pos_b[1]
                        
                        if dx == 0: dx = 0.01
                        if dy == 0: dy = 0.01

                        # Push along minimal overlap axis
                        if ox < oy:
                            shift = ox / 2.0
                            sign_x = 1 if dx > 0 else -1
                            current_pos[id_a][0] += shift * sign_x
                            current_pos[id_b][0] -= shift * sign_x
                        else:
                            shift = oy / 2.0
                            sign_y = 1 if dy > 0 else -1
                            current_pos[id_a][1] += shift * sign_y
                            current_pos[id_b][1] -= shift * sign_y
                        
                        moved = True
                        max_move = max(max_move, shift)
            
            if not moved:
                break
        
        return current_pos

layout_service = LayoutService()
