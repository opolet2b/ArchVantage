# Task: Implement MCP Server Management in Settings

## Phase 1: Backend Models & Schemas
- [x] Add auth fields to MCPServer model <!-- id: 0 -->
- [x] Create MCPServerPermission model <!-- id: 1 -->
- [x] Add AuthType enum to schemas <!-- id: 2 -->
- [x] Create MCPServerPermission schemas <!-- id: 3 -->
- [x] Update MCPServer schemas with auth fields <!-- id: 4 -->

## Phase 2: Backend Services
- [x] Update create_mcp_server to handle auth and permissions <!-- id: 5 -->
- [x] Update update_mcp_server to handle permissions <!-- id: 6 -->
- [x] Add get_mcp_servers_for_user function <!-- id: 7 -->
- [x] Add admin-only checks <!-- id: 8 -->

## Phase 3: Backend Routes
- [x] Update GET /mcp-servers with filtering <!-- id: 9 -->
- [x] Add admin checks to POST/PUT/DELETE <!-- id: 10 -->

## Phase 4: Frontend Settings Tab
- [x] Create mcp-servers-tab.tsx component <!-- id: 11 -->
- [x] Add server list view <!-- id: 12 -->
- [x] Create add/edit dialog <!-- id: 13 -->
- [x] Implement auth type selector <!-- id: 14 -->
- [x] Add user/group permission assignment <!-- id: 15 -->
- [x] Add to Settings page <!-- id: 16 -->

## Phase 5: Tool Builder Integration
- [x] Update mcp-server-list.tsx to filter by user <!-- id: 17 -->
- [x] Test permission filtering <!-- id: 18 -->

## Phase 6: Testing
- [ ] Test admin can CRUD servers <!-- id: 19 -->
- [ ] Test non-admin cannot access <!-- id: 20 -->
- [ ] Test Tool Builder filtering <!-- id: 21 -->
