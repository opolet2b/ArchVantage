# Volume 9: Admin, Security & Maintenance

## 1. User Management & RBAC
SemanticCanvas uses Role-Based Access Control to secure your data.
- **Roles**: Admin, Editor, Viewer.
- **Permissions**: Control who can create canvases, edit agents, or invite others.
- **Single Sign-On (SSO)**: Integration points for enterprise authentication providers.

## 2. Data Security
- **Local vs Cloud**: Choose where your data is stored.
- **Vector Isolation**: Each canvas can have its own vector namespace for strict data separation.
- **Redaction**: Built-in filters to prevent sensitive PII from being sent to external LLMs.

## 3. System Maintenance
Keep the "Intelligence Engine" running smoothly.
- **Database Vacuums**: Regular maintenance tasks to compact SQLite and ArcadeDB files.
- **Disk Monitoring**: Automatic alerts when vector stores or graph databases exceed size thresholds.
- **Recovery**: Tools to clear corrupted indices or restore from snapshots.

## 4. LLM Configuration
- **Model Presets**: Pre-configure connections to OpenAI, Anthropic, or local Ollama endpoints.
- **JSON Mode**: Optimize responses for structured data extraction.
- **Fallback Logic**: Automatically switch to a secondary model if the primary provider is down.

## 5. Logs & Debugging
- **Automations Log**: `backend/automations.log` tracks every spatial trigger.
- **System Logs**: Detailed traces for LLM calls, RAG processing, and API errors.
