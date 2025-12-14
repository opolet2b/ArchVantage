# Conversation Management Implementation Plan

The goal is to implement a full conversation history system where users can create new chats, switch between them, and manage them (rename, delete, favorite, export). Titles should be auto-generated.

## User Review Required
> [!IMPORTANT]
> **Storage**: I will use a `data/conversations.json` (or individual files in a directory) to store conversation history for simplicity, similar to how configuration is handled.
> **Auto-titling**: This will require an LLM call. I will use the "default" (active) model for this to avoid extra configuration.

## Proposed Changes

### Backend
#### [NEW] [app/services/conversation_service.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/services/conversation_service.py)
- Manage CRUD operations for conversations.
- `create_conversation()`
- `get_conversations()`
- `get_conversation(id)`
- `update_conversation(id, updates)`
- `delete_conversation(id)`
- `add_message(id, message)`
- `generate_title(id)`: Uses `LLMService` to summarize the first few messages into a title.

#### [NEW] [app/routers/conversation.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/app/routers/conversation.py)
- Endpoints for the service methods.

#### [MODIFY] [main.py](file:///c:/Users/opole/Downloads/ChatBotn/backend/main.py)
- Include `conversation` router.

### Frontend
#### [NEW] [src/components/sidebar/conversation-list.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/sidebar/conversation-list.tsx)
- Component to display the list of conversations.
- Handles selection (switching).
- Implements Context Menu (Rename, Delete, Favorite, Export).

#### [MODIFY] [src/components/app-sidebar.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/app-sidebar.tsx)
- Integrate `ConversationList`.
- Update the "Chat" button (or "New Chat" button) logic.

#### [MODIFY] [src/components/chat-interface.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/components/chat-interface.tsx)
- Manage `conversationId` state.
- On send:
    - If no `conversationId`, create new conversation first.
    - Save messages to backend.
    - Trigger auto-title if it's the first exchange.
- Handle "Switch Conversation" event (likely via a global store or URL param). *Decision: Use URL params `/chat/[id]` or global state?*
    - *Simpler approach for now*: Lift state up or use a context, but since `AppSidebar` and `ChatInterface` are siblings in `layout`, we might need a Context or just use URL routing `/c/[id]`.
    - **Refined Plan**: Let's use a `ConversationContext` or simply URL routing if possible. Given Next.js App Router, `/chat/[id]` is idiomatic.
    - However, the current root `/` is the chat.
    - **Decision**: I will create a `ConversationContext` to manage the active conversation ID and list refresh trigger. This avoids complex routing refactors for now.

#### [NEW] [src/lib/conversation-context.tsx](file:///c:/Users/opole/Downloads/ChatBotn/frontend/src/lib/conversation-context.tsx)
- Context provider for `activeConversationId`, `refreshConversations`, etc.

## Verification Plan
1. **New Chat**: Click button -> Chat clears -> Send message -> Conversation appears in list with Auto-Title.
2. **Switching**: Click another item -> Chat loads that history.
3. **Context Menu**:
    - **Rename**: Change title -> updates list.
    - **Delete**: Confirm -> disappears from list -> Chat clears if it was active.
    - **Export**: Downloads text file.
