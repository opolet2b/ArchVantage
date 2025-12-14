# Implementation Plan - Generic MCP Server

## Goal
Create a fully compliant MCP server that serves micro-services defined via configuration. The server will dynamically register tools based on a configuration file and ensure the output follows a strict JSON format.

## User Review Required
- **Configuration Format**: I am proposing a `config.json` file to define services.
- **Execution Logic**: Currently, I will implement a mock/placeholder execution that returns the example response. Since the user said "I will later on specify wich micro-services", I will make the execution logic extensible (e.g., ready to make HTTP calls or just return static data defined in config).

## Proposed Changes

### MCPServer Workspace

#### [NEW] [package.json](file:///c:/Users/opole/Downloads/MCPServer/package.json)
- Node.js project configuration.
- Dependencies: `@modelcontextprotocol/sdk`, `zod`, `typescript`, `@types/node`.

#### [NEW] [tsconfig.json](file:///c:/Users/opole/Downloads/MCPServer/tsconfig.json)
- TypeScript configuration.

#### [NEW] [config.json](file:///c:/Users/opole/Downloads/MCPServer/config.json)
- The "easy way to configure" the services.
- Structure:
  ```json
  {
    "services": [
      {
        "name": "stripe_create_refund",
        "description": "Create a refund...",
        "inputSchema": { ... },
        "mockOutput": { "refund_id": "re_123456", "status": "succeeded" }
      }
    ]
  }
  ```
- I added `mockOutput` to allow generating the example response the user asked for.

#### [NEW] [src/types.ts](file:///c:/Users/opole/Downloads/MCPServer/src/types.ts)
- Type definitions for the configuration and service structure.

#### [NEW] [src/index.ts](file:///c:/Users/opole/Downloads/MCPServer/src/index.ts)
- Main entry point.
- Initialize `McpServer`.
- Load `config.json`.
- Loop through services and `server.tool(...)`.
- Implement the handler to return the `content` array with JSON string as requested.

#### [MODIFY] [src/types.ts](file:///c:/Users/opole/Downloads/MCPServer/src/types.ts)
- Add `url`, `method`, `headers` to `ServiceConfig`.

#### [MODIFY] [src/index.ts](file:///c:/Users/opole/Downloads/MCPServer/src/index.ts)
- Implement generic HTTP fetching logic.
- Replace placeholders in `url` (e.g., `{name}`) with arguments.
- Handle query parameters.
- Return actual API response instead of mock output.

#### [MODIFY] [config.json](file:///c:/Users/opole/Downloads/MCPServer/config.json)
- Add configurations for:
    - RestCountries
    - Zippopotam
    - Picsum
    - Nager.Date
    - OpenFoodFacts
    - BigDataCloud
    - NASA
    - DataUSA
    - Weather.gov

## Verification Plan

### Automated Tests
- I will run `verify.js` (updated or new script) to call these new tools.
- Since these are real network calls, I will verify they return non-error responses and expected data structures.

