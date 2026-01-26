import os
import shutil
import json
from pathlib import Path

def prepare_pack():
    print("Preparing Docker Starter Pack...")
    
    # Define paths
    ROOT = Path(os.getcwd())
    BACKEND = ROOT / "backend"
    PACK_DIR = ROOT / "docker_pack"
    
    # Clean/Create pack directory
    if PACK_DIR.exists():
        shutil.rmtree(PACK_DIR)
    PACK_DIR.mkdir()
    
    # 1. Copy Database
    print("Copying Database...")
    src_db = BACKEND / "db"
    dst_db = PACK_DIR / "db"
    
    if src_db.exists():
        shutil.copytree(src_db, dst_db, dirs_exist_ok=True)
        # Remove temporary files if any (e.g. wal files if running, though ideally should be stopped)
        # We assume the user stopped the app or we catch a snapshot
    else:
        print("WARNING: No db/ directory found in backend.")
        dst_db.mkdir()
        
    # 2. Copy Data (RAG files, etc)
    print("Copying Data...")
    src_data = BACKEND / "data"
    dst_data = PACK_DIR / "data"
    
    if src_data.exists():
        shutil.copytree(src_data, dst_data, dirs_exist_ok=True)
    else:
        print("WARNING: No data/ directory found in backend.")
        dst_data.mkdir()

    # 3. Sanitize Config
    print("Sanitizing Config...")
    config_path = dst_data / "config.json"
    if config_path.exists():
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
            
            # Recursive sanitization function
            def sanitize(obj):
                if isinstance(obj, dict):
                    for key, value in obj.items():
                        if "api_key" in key.lower() or "secret" in key.lower() or "token" in key.lower():
                            obj[key] = "" # Scrub
                        else:
                            sanitize(value)
                elif isinstance(obj, list):
                    for item in obj:
                        sanitize(item)
            
            sanitize(config)
            
            with open(config_path, 'w') as f:
                json.dump(config, f, indent=4)
            print("Config sanitized.")
        except Exception as e:
            print(f"ERROR sanitizing config: {e}")
    else:
        print("No config.json found to sanitize.")

    print(f"Done! Pack created at {PACK_DIR}")
    print("You can now build the Docker image.")

if __name__ == "__main__":
    prepare_pack()
