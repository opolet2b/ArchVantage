import os
import httpx
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from app.core.config import settings

class ArcadeDBClient:
    @property
    def host(self) -> str:
        return os.getenv("ARCADEDB_HOST", settings.ARCADEDB_HOST)

    @property
    def user(self) -> str:
        return os.getenv("ARCADEDB_USER", settings.ARCADEDB_USER)

    @property
    def password(self) -> str:
        return os.getenv("ARCADEDB_PASSWORD", settings.ARCADEDB_PASSWORD)

    @property
    def db_name(self) -> str:
        return os.getenv("ARCADEDB_DATABASE", settings.ARCADEDB_DATABASE)

    @property
    def auth(self):
        return (self.user, self.password)

    def _get_url(self, endpoint: str, include_db: bool = True) -> str:
        # endpoint usually starts with /
        base = self.host.rstrip('/')
        url = f"{base}/api/v1/{endpoint}"
        if include_db:
            url = f"{url}/{self.db_name}"
        return url

    def create_database(self, type: str = "main") -> bool:
        """
        Creates the database if it doesn't exist.
        """
        url = self._get_url("create", include_db=False)
        payload = {
            "command": f"create database {self.db_name} {type}"
        }
        try:
            with httpx.Client(auth=self.auth) as client:
                # ArcadeDB 'create' can be hit via POST command or specific create endpoint
                # The create database command is usually sent to the server directly
                # However, for simplicity, we use the standard 'create' server command if available
                res = client.post(f"{self.host.rstrip('/')}/api/v1/server", json={"command": f"create database {self.db_name}"})
                if res.status_code in (200, 403, 409): # 409 Conflict if already exists
                    return True
                return False
        except Exception as e:
            print(f"Database creation check/call failed: {e}")
            return False

    def command(self, query: str, language: str = "sql", params: Optional[Dict[str, Any]] = None, silent: bool = False) -> Dict[str, Any]:
        """
        Execute a command or query.
        language can be 'sql' or 'gremlin'
        """
        url = self._get_url("command")
        payload = {
            "language": language,
            "command": query
        }
        if params:
            payload["params"] = params
            
        try:
            with httpx.Client(auth=self.auth) as client:
                response = client.post(url, json=payload, timeout=10.0)
                if response.status_code >= 400 and not silent:
                    print(f"ArcadeDB Error {response.status_code}: {response.text}")
                response.raise_for_status()
                return response.json()
        except Exception as e:
            if not silent:
                print(f"ArcadeDB Command Error: {e}")
            raise e

    def query(self, query: str, language: str = "sql", params: Optional[Dict[str, Any]] = None, silent: bool = False) -> Dict[str, Any]:
         """
         Execute an idempotent query.
         """
         url = self._get_url("query")
         payload = {
             "language": language,
             "command": query
         }
         if params:
             payload["params"] = params
 
         try:
             with httpx.Client(auth=self.auth) as client:
                 response = client.post(url, json=payload, timeout=10.0)
                 if response.status_code >= 400 and not silent:
                    print(f"ArcadeDB Error {response.status_code}: {response.text}")
                 response.raise_for_status()
                 return response.json()
         except Exception as e:
             if not silent:
                print(f"ArcadeDB Query Error: {e}")
             raise e

    def check_connection(self) -> bool:
        """
        Checks if the database exists and credentials are correct.
        """
        try:
            self.query("SELECT 1")
            return True
        except Exception:
            return False

arcadedb = ArcadeDBClient()
