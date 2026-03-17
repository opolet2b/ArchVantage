# Volume 8: Tools & MCP

## 1. Extending the AI
The "Tools" system allows SemanticCanvas agents to interact with the outside world or trigger internal system functions.

## 2. Tool Types
- **MCP (Model Context Protocol)**: A standardized way to connect to external servers. Use MCP to search the web, query external databases, or control local files.
- **GUI Tools**: Frontend forms that appear on the canvas to collect structured input from the user (e.g., a "Project Setup" form).

## 3. Managing MCP Servers
1.  **Configuration**: Add your MCP server URL and credentials in the Admin panel.
2.  **Activation**: Toggle servers on or off globally.
3.  **Discovery**: Agents automatically "see" available MCP tools and can choose to use them when solving a task.

## 4. Permissions
- **User Level**: Restrict specific tools to certain users or groups.
- **Canvas Level**: Disable "Web Search" tools for high-security canvases.

## 5. Best Practices
- **System Prompts**: Each tool has a generated "System Prompt" that tells the LLM exactly how and when to use it.
- **Heartbeats**: For long-running tools (like web crawling), the system provides status updates to keep the user informed.
