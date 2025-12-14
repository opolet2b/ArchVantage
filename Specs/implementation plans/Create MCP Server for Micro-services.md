# Task: Create MCP Server for Micro-services

- [x] Initialize Node.js project in `MCPServer` <!-- id: 0 -->
- [x] Create `implementation_plan.md` <!-- id: 1 -->
- [x] Install dependencies (`@modelcontextprotocol/sdk`, `zod`, etc.) <!-- id: 2 -->
- [x] Create configuration structure (`config.json` and `src/types.ts`) <!-- id: 3 -->
- [x] Implement MCP Server logic in `src/index.ts` <!-- id: 4 -->
    - [x] Load configuration <!-- id: 5 -->
    - [x] Register tools dynamically based on config <!-- id: 6 -->
    - [x] Implement tool execution handler (returning the required JSON format) <!-- id: 7 -->
- [x] Verify implementation with the example `stripe_create_refund` service <!-- id: 8 -->
- [x] Create documentation (`README.md`) <!-- id: 9 -->

## New Tasks: Add Real Microservices
- [x] Research APIs and define schemas <!-- id: 10 -->
- [x] Update `implementation_plan.md` for generic HTTP support <!-- id: 11 -->
- [x] Update `src/types.ts` to support `url` and `method` <!-- id: 12 -->
- [x] Update `src/index.ts` to implement generic HTTP fetching <!-- id: 13 -->
- [x] Update `config.json` with new services <!-- id: 14 -->
- [x] Verify new services <!-- id: 15 -->
