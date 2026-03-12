import logging
import json
from collections import deque
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

class LogEntry(BaseModel):
    timestamp: str
    level: str
    feature: str
    module: str
    message: str
    metadata: Optional[Dict[str, Any]] = None

class DebugService:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DebugService, cls).__new__(cls)
            # Logs are now stored per feature for better isolation and management
            cls._instance.max_logs_per_feature = 500
            # Pre-seed with main application features as requested by the user
            cls._instance.default_features = [
                "Authentication", 
                "Canvas", 
                "Smart Analysis", 
                "Smart Templates", 
                "Scenario", 
                "Agents and Tools", 
                "Knowledge Base", 
                "Settings", 
                "System"
            ]
            cls._instance.feature_logs: Dict[str, deque] = {
                f: deque(maxlen=cls._instance.max_logs_per_feature) for f in cls._instance.default_features
            }
        return cls._instance

    def _get_feature_deque(self, feature: str) -> deque:
        if feature not in self.feature_logs:
            self.feature_logs[feature] = deque(maxlen=self.max_logs_per_feature)
        return self.feature_logs[feature]

    def log(self, level: str, feature: str, module: str, message: str, metadata: Dict[str, Any] = None):
        """
        Log a debug message associated with a specific feature.
        """
        entry = LogEntry(
            timestamp=datetime.utcnow().isoformat(),
            level=level.upper(),
            feature=feature,
            module=module,
            message=message,
            metadata=metadata
        )
        self._get_feature_deque(feature).append(entry)
        
        # Also print to stdout for standard container logging
        meta_str = f" | {json.dumps(metadata)}" if metadata else ""
        print(f"[{entry.level}] [{feature}] [{module}] {message}{meta_str}")

    def get_features(self) -> List[str]:
        """
        Get list of all features that have logs.
        """
        features = set(self.feature_logs.keys())
        # Ensure default features are always included in the list
        if hasattr(self, 'default_features'):
            features.update(self.default_features)
        else:
            # Fallback if somehow default_features wasn't set during init
            features.update(["Authentication", "Canvas", "Knowledge Base", "System"])
        return sorted(list(features))

    def get_logs(self, limit: int = 100, feature: Optional[str] = None, level: Optional[str] = None, keyword: Optional[str] = None) -> List[LogEntry]:
        """
        Retrieve logs with optional filtering.
        """
        all_selected_logs = []
        
        if feature:
            if feature in self.feature_logs:
                all_selected_logs = list(self.feature_logs[feature])
        else:
            # Aggregate all logs if no feature specified (fallback)
            for logs in self.feature_logs.values():
                all_selected_logs.extend(list(logs))
        
        # Sort by timestamp (chronological) - newest first
        all_selected_logs.sort(key=lambda x: x.timestamp, reverse=True)
        
        filtered = []
        for entry in all_selected_logs:
            if level and level.upper() != entry.level:
                continue
            if keyword and keyword.lower() not in entry.message.lower() and keyword.lower() not in entry.module.lower():
                continue
            filtered.append(entry)
            if len(filtered) >= limit:
                break
                
        return filtered

    def download_logs(self, feature: str) -> str:
        """
        Generate a text-based log file for a specific feature.
        """
        logs = self.get_logs(limit=self.max_logs_per_feature, feature=feature)
        lines = [f"{e.timestamp} [{e.level}] [{e.module}] {e.message}" for e in reversed(logs)]
        return "\n".join(lines)

    def clear(self, feature: Optional[str] = None):
        """
        Clear logs for a feature or all logs.
        """
        if feature:
            if feature in self.feature_logs:
                self.feature_logs[feature].clear()
        else:
            self.feature_logs.clear()

debug_service = DebugService()
