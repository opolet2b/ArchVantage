# Tool Builder - Functional Specification

**Status**: Draft
**Last Updated**: 2025-12-14

## 1. Overview
The Tool Builder enables users to create standard Tools (for Agents) and GUI Tools (Forms) that interface with external systems via the Model Context Protocol (MCP).

## 2. Key Capabilities
- **MCP Server Management**: Connect to local or remote MCP servers to discover available functions.
- **Tool Creation Wizard**: AI-assisted flow to creating tools from natural language descriptions.
- **GUI Builder**: Drag-and-drop builder for creating user-facing forms (Input Forms) for tools.
- **Dry Run Verification**: Interactive testing session to validate tool inputs and outputs before publishing.

## 3. User Stories
- **As a** Non-technical user
- **I want to** build a "Search Google" tool
- **So that** my agents can browse the web.

## 4. UI/UX
- **Tool List**: searchable library of tools.
- **Editor**: Multi-step wizard (Definition -> Pipeline -> Test).
- **Form Builder**: Grid-based layout editor for creating input forms.
