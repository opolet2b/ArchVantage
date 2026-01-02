import os
from typing import Dict, Optional
from pathlib import Path

ENV_PATH = Path(".env")

class EnvManager:
    @staticmethod
    def get_env_value(key: str, default: Optional[str] = None) -> Optional[str]:
        return os.getenv(key, default)

    @staticmethod
    def set_env_value(key: str, value: str):
        """
        Update or add a key-value pair in the .env file.
        This implementation preserves comments and structure roughly,
        but a cleaner approaches is to just append or replace lines.
        """
        if not ENV_PATH.exists():
            ENV_PATH.touch()

        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
        new_lines = []
        found = False
        
        for line in lines:
            if line.strip().startswith(f"{key}="):
                new_lines.append(f"{key}={value}")
                found = True
            else:
                new_lines.append(line)
        
        if not found:
            new_lines.append(f"{key}={value}")
            
        # Ensure ending newline
        content = "\n".join(new_lines)
        if content and not content.endswith("\n"):
            content += "\n"
            
        ENV_PATH.write_text(content, encoding="utf-8")
        
        # Also update current process environment for immediate effect (where applicable)
        os.environ[key] = value

env_manager = EnvManager()
