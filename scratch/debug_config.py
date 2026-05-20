import json
import os
import sys

# Add backend to path
sys.path.append(os.getcwd())

from app.services.config_service import config_service

config = config_service.get_config()
print(json.dumps(config, indent=2))
