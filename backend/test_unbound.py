class MockInstance:
    def __init__(self):
        self.status = "RUNNING"
        self.current_node_ids = []
        self.state_payload = {}
        
def run_bug():
    instance = MockInstance()
    status_val = instance.status
    
    gui_schema = None
    lane_authorization = {}

    if (
        status_val == "WAITING"
        and instance.current_node_ids
    ):
        waiting_node = instance.current_node_ids[0]
        
    payload = {
        "type": "status",
        "status": status_val,
        "current_node_ids": instance.current_node_ids or [],
        "waiting_node": waiting_node,
        "gui_schema": gui_schema,
    }
    print(payload)

run_bug()
