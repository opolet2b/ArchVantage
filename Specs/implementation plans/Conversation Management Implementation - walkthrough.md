# Verification Walkthrough

## Configuration Feature

### Backend
- [x] Verify `GET /api/v1/config/models` returns Ollama models.
- [x] Verify `GET /api/v1/config/presets` returns saved presets.
- [x] Verify `POST /api/v1/config/presets` saves a new preset.
- [x] Verify `GET /api/v1/config/active` returns the active preset.
- [x] Verify `POST /api/v1/config/active` sets the active preset.

### Frontend
- [x] Navigate to `/settings`.
- [x] Create a new configuration (e.g., "My Ollama").
- [x] Save the configuration.
- [x] Reload the page and verify the configuration loads.
- [x] Click "Set as Active" and verify it persists.

## Conversation Management

### Core Flow
- [x] **Create Chat**: Click "+" in sidebar. Verify new conversation starts.
- [x] **Send Message**: Type a message and send. Verify AI responds.
- [x] **List Update**: Verify conversation appears in the sidebar list.
- [x] **Switching**: Create another chat, switch back and forth. Verify history loads.

### Context Menu (Manual Verification Required)
- [ ] **Rename**: Right-click (or menu icon) -> Rename. Change title. Verify update.
- [ ] **Delete**: Right-click -> Delete. Confirm. Verify removal.
- [ ] **Export**: Right-click -> Export. Verify text file download.

## Launch
1. Start Backend: `cd backend && venv\Scripts\activate && uvicorn main:app --reload`
2. Start Frontend: `cd frontend && npm run dev`
3. Open `http://localhost:3000`
