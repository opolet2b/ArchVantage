# ChromaDB Path Rule

Always use `settings.CHROMA_DB_DIR` from `app.core.config` when referencing the ChromaDB persistent directory.

- **Storage Location**: The canonical location for the ChromaDB database is always within the `backend/chroma_db` directory.
- **No Hardcoding**: Never hardcode strings like `"./chroma_db"` or `"backend/chroma_db"` in service logic.
- **Absolute Pathing**: Use `CHROMA_DB_DIR` which is calculated relative to the backend base directory to ensure scripts run correctly from any location.
- **Cleanup**: Any `chroma_db` directory created at the project root is accidental and should be removed.
