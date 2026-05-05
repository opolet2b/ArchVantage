import os
from pathlib import Path

STORAGE_ROOT = Path("backend/data_storage")
file_path_db = r"2026\05\04\f4ea2588-e13c-43d3-88ab-1961a2872493_CustomerSentiment.xlsx"
full_path = STORAGE_ROOT / file_path_db

print(f"STORAGE_ROOT: {STORAGE_ROOT}")
print(f"file_path_db: {file_path_db}")
print(f"full_path: {full_path}")
print(f"Exists: {full_path.exists()}")
print(f"Is Absolute: {full_path.is_absolute()}")
print(f"CWD: {os.getcwd()}")
