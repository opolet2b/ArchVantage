import os
from typing import List
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "ChatBot Agent Orchestrator"
    API_V1_STR: str = "/api/v1"
    
    # CORS Configuration
    # Parse comma-separated string from env, or use default list
    BACKEND_CORS_ORIGINS: List[str] = [
        origin.strip() 
        for origin in os.getenv(
            "BACKEND_CORS_ORIGINS", 
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
        ).split(",")
        if origin.strip()
    ]

settings = Settings()
