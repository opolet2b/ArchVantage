import inspect
import sys
import os

# Ensure app can be imported
sys.path.append(os.getcwd())

from app.services.agent_runtime import AgentRuntime

print(f"File: {inspect.getfile(AgentRuntime)}")
print("--- SOURCE START ---")
source_lines = inspect.getsource(AgentRuntime.execute).split('\n')
print('\n'.join(source_lines[:15]))
print("--- SOURCE END ---")
