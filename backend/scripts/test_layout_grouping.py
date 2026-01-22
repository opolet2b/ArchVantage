
import sys
import os
import networkx as nx
import matplotlib.pyplot as plt
from typing import Dict, List, Any
import numpy as np

# Mock classes to simulate the database and models
class MockCanvasThing:
    def __init__(self, id, canvas_id, position_x, position_y, width, height):
        self.id = id
        self.canvas_id = canvas_id
        self.position_x = position_x
        self.position_y = position_y
        self.width = width
        self.height = height

class MockCanvasLink:
    def __init__(self, id, canvas_id, source_id, target_id):
        self.id = id
        self.canvas_id = canvas_id
        self.source_id = source_id
        self.target_id = target_id

class MockSession:
    def __init__(self, things, links):
        self.things = things
        self.links = links
        self.committed = False

    def query(self, model):
        self._query_model = model
        return self

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        # Handle both Mock classes and real classes passed by service
        model_name = getattr(self._query_model, '__name__', str(self._query_model))
        if 'Thing' in model_name:
            return self.things
        elif 'Link' in model_name:
            return self.links
        return []

    def commit(self):
        self.committed = True
        print("[MockSession] Committed changes.")

# Import the service (add parent dir to path)
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.services.layout_service import layout_service

def test_layout_packing():
    print("Generating mock data with 3 distinct clusters...")
    
    things = []
    links = []
    
    # Cluster 1: 5 nodes (0-4)
    for i in range(5):
        things.append(MockCanvasThing(f"c1_{i}", "canvas1", 0, 0, 200, 100))
    for i in range(4):
        links.append(MockCanvasLink(f"l1_{i}", "canvas1", f"c1_{i}", f"c1_{i+1}"))
    links.append(MockCanvasLink("l1_close", "canvas1", "c1_0", "c1_4")) # Cycle

    # Cluster 2: 3 nodes (0-2)
    for i in range(3):
        things.append(MockCanvasThing(f"c2_{i}", "canvas1", 0, 0, 200, 100))
    links.append(MockCanvasLink("l2_0", "canvas1", "c2_0", "c2_1"))
    links.append(MockCanvasLink("l2_1", "canvas1", "c2_1", "c2_2"))

    # Cluster 3: 10 nodes (star)
    things.append(MockCanvasThing("c3_center", "canvas1", 0, 0, 300, 200))
    for i in range(9):
        things.append(MockCanvasThing(f"c3_leaf_{i}", "canvas1", 0, 0, 150, 100))
        links.append(MockCanvasLink(f"l3_{i}", "canvas1", "c3_center", f"c3_leaf_{i}"))

    db = MockSession(things, links)
    
    print("Running arrange_things...")
    layout_service.arrange_things(db, "canvas1")
    
    print("Plotting result...")
    
    plt.figure(figsize=(10, 10))
    
    # Plot nodes
    for t in things:
        plt.gca().add_patch(plt.Rectangle(
            (t.position_x - t.width/2, t.position_y - t.height/2), 
            t.width, t.height, 
            fill=True, color='lightblue', alpha=0.5, zorder=1
        ))
        plt.text(t.position_x, t.position_y, t.id, ha='center', va='center', fontsize=8, zorder=2)
    
    # Plot links
    thing_map = {t.id: t for t in things}
    for l in links:
        s = thing_map[l.source_id]
        t = thing_map[l.target_id]
        plt.plot([s.position_x, t.position_x], [s.position_y, t.position_y], 'k-', alpha=0.3, zorder=0)

    # Set limits
    xs = [t.position_x for t in things]
    ys = [t.position_y for t in things]
    plt.xlim(min(xs) - 500, max(xs) + 500)
    plt.ylim(min(ys) - 500, max(ys) + 500)
    plt.gca().set_aspect('equal', adjustable='box')
    plt.title("Layout Test Result: 3 Clusters")
    
    output_file = 'layout_test_result.png'
    plt.savefig(output_file)
    print(f"Saved layout visualization to {output_file}")
    print(f"Cluster 1 center: {np.mean([t.position_x for t in things if 'c1' in t.id])}, {np.mean([t.position_y for t in things if 'c1' in t.id])}")
    print(f"Cluster 2 center: {np.mean([t.position_x for t in things if 'c2' in t.id])}, {np.mean([t.position_y for t in things if 'c2' in t.id])}")
    print(f"Cluster 3 center: {np.mean([t.position_x for t in things if 'c3' in t.id])}, {np.mean([t.position_y for t in things if 'c3' in t.id])}")

if __name__ == "__main__":
    test_layout_packing()
