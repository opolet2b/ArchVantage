import logging
import json
from collections import deque
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

class LogEntry(BaseModel):
    timestamp: str
    level: str
    module: str
    message: str
    metadata: Optional[Dict[str, Any]] = None

class DebugService:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DebugService, cls).__new__(cls)
            cls._instance.logs = deque(maxlen=1000)
            cls._instance.enabled_modules = set() # All enabled by default if empty? Or specific?
            # Let's assume generic logging for now.
        return cls._instance

    def log(self, level: str, module: str, message: str, metadata: Dict[str, Any] = None):
        """
        Log a debug message.
        """
        entry = LogEntry(
            timestamp=datetime.utcnow().isoformat(),
            level=level.upper(),
            module=module,
            message=message,
            metadata=metadata
        )
        self.logs.append(entry)
        
        # Also print to stdout for standard container logging
        meta_str = f" | {json.dumps(metadata)}" if metadata else ""
        print(f"[{entry.level}] [{module}] {message}{meta_str}")

    def get_logs(self, limit: int = 100, module: Optional[str] = None, level: Optional[str] = None) -> List[LogEntry]:
        """
        Retrieve logs with optional filtering.
        """
        # Convert deque to list and reverse to get newest first
        all_logs = list(self.logs)
        all_logs.reverse()
        
        filtered = []
        for entry in all_logs:
            if module and module.lower() not in entry.module.lower():
                continue
            if level and level.upper() != entry.level:
                continue
            filtered.append(entry)
            if len(filtered) >= limit:
                break
                
        return filtered

    def clear(self):
        self.logs.clear()

debug_service = DebugService()
