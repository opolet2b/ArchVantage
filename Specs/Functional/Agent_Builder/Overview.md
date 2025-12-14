# Agent Builder - Functional Specification

**Status**: Draft
**Last Updated**: 2025-12-14

## 1. Overview
The Agent Builder allows users to visually compose intelligent agents by connecting various "nodes" into a workflow graph. This "No-Code" interface democratizes agent creation.

## 2. User Stories
- **As a** Developer
- **I want to** visually link a "Start" node to a "Tool Call" and then to an "LLM Decider".
- **So that** I can create complex logic without writing Python code.

## 3. Requirements

### 3.1 Validating Graphs
- **FR-01**: A valid graph must have exactly one "Start" node.
- **FR-02**: All nodes must be connected.
- **FR-03**: Loops are permitted (e.g., for retries).

### 3.2 Node Types
- **Start / End**: Define entry and exit points.
- **LLM**: Calls a Language Model.
- **Tool Call**: Executes a registered MCP Tool.
- **Condition**: Branches logic based on variable values.

## 4. User Interface
- **Canvas**: Infinite-canvas based drag-and-drop interface (React Flow).
- **Sidebar**: Palette of available nodes.
- **Properties Panel**: Configures the selected node (e.g., setting the System Prompt for an LLM node).

## 5. Execution
- Agents are executed via the Chat interface.
- Execution steps are visible in the "Debug/Trace" view.
