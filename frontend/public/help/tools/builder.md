# Tool Builder Guide
---

The Tool Builder allows you to create and configure tools that your agents can use. 
MCP ToolsTools can be simple scripts or connections to external MCP servers. They use functions that are exposed by the MCP server.
If you want to access an API from a MCP tool, you must first create an MCP server and add the API to it.

**MCP Tools are created that way:**

1. Give it a unique name
2. Provide the "Description" of what the tool does. BEWARE: this description is used to generate the system prompt for the tool. So you should explain what the tool receives as input, what it does and what it is suposed to return. In natural language.
3. Provide the "Category" of the tool. This is used to group tools for better organization.
4. Define the "Permissions" of the tool. This is used to control who can use the tool.
5. Drag'n'Drop MCP servers from the sidebar onto the canvas. Of course you must select the MCP servers that expose the functions you want to use.
6. The canvas will show you the available functions and their parameters. Select the functions that make sense for the tool you want to create. This helps the LLM to generate the system prompt for the tool.
7. You can now start to generate the tool. Click simply on "Generate pipeline" and wait for the tool to be generated.
8. The LLM will try to generate the pipeline for the tool, based on your description and the available functions. It also generates the Input and Output schemas for the tool.
9. If you want, check the Execution Pipeline to see how the tool will be executed. You can also modify the pipeline to fit your needs.
10. You can also check the Input and Output schemas to see how the tool will be executed. You can also modify the schemas to fit your needs.
11. Once this is done, you will want to verify the pipeline. During the "Verify Pipeline" process, the LLM will try to execute the pipeline with sample inputs to ensure it works as expected. If will also ask you to map the output of each step to the input of the next step. OR to map the output of the a step directly to the output of the pipeline. It allows for full flexibility in the pipeline. The only things you cannot do is to map the output of a step to the input of the same step or to another step that is NOT the next step.
12. Proceed with the "Verify Pipeline" process. The Tool Builder will save your mappings and the tool will be ready to use (If the verification is successful of course).
13. Once This is done, you can execute the pipeline with sample inputs to test it.
14. Save the tool. It is ready to be used in agents.

## Basic Information
- **Name**: A unique identifier for your tool.
- **Description**: A clear explanation of what the tool does. This is critical for agents to understand when to use it.
- **Category**: Group your tool for better organization.

## Permissions
Control who can access and modify this tool.
- **Users**: Assign specific users.
- **Groups**: Assign Active Directory groups.
- **Levels**: 
  - `READ`: Can use the tool in agents.
  - `READ_WRITE`: Can edit the tool configuration.

## Tool Canvas & Discovery
The canvas allows you to drag and drop **MCP Servers** to discover their available capabilities.
1. Drag a server from the sidebar onto the canvas.
2. Select the specific functions you want to expose.
3. Use checkboxes to enable/disable specific endpoints.

## Execution Pipeline
Define how the tool executes.
- **Generate Pipeline**: Automatically creates a JSON execution flow with mappings based on selected functions.
- **Verify**: Run a dry-run to test the pipeline with sample inputs.

## Schemas
- **Input Schema**: JSON Schema defining what parameters the tool accepts. Auto-generated from your system prompt or selected functions.
- **Output Schema**: JSON Schema defining what the tool returns. Important for chaining tools together.

> [!TIP]
> Use the "Verify Pipeline" button to automatically generate accurate output schemas based on real execution results.
