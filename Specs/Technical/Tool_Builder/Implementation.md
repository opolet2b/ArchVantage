# Tool Builder - Technical Specification

**Related Functional Spec**: [Overview.md](./Overview.md)
**Status**: Draft

## 1. Architecture

### 1.1 Backend (`routers/tools.py`)
- **Discovery**: Queries MCP Servers via JSON-RPC to fetch tool schemas.
- **Pipelines**: Tools can be composed of multiple steps (Pipeline) or a single function call.
- **LLM Assistance**: Endpoints `/generate-pipeline` and `/generate-input-schema` use the LLM to map user intent to technical schemas.

### 1.2 Dry Run Engine (`services/dry_run.py`)
A stateful service that manages verification sessions.
- **Session Management**: Temporary storage of execution steps.
- **Schema Capture**: Observes actual IO during execution to generate precise JSON schemas.

### 1.3 GUI Builder (`frontend`)
- **Grid Layout**: CSS Grid based rendering.
- **Schema Generation**: Converts the visual form layout into a JSON Schema for the `gui_input_required` agent state.

## 2. Data Model
- **Tool**: Stores `input_schema`, `sys_prompt`, `pipeline_definition`.
- **MCPServer**: Stores connection details (`command`, `args`, `env`).
