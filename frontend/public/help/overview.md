# Welcome to the Help Center

This guide will help you navigate and master the Agent Builder platform.

## Key Features

### 🔧 **Tools & Integrations**
Connect your agents to the real world. Tools are "dumb" components that perform a specific task. tools are deterministic, they do not include any AI logic. However, AI is used to build them.

ChatBotn provides two categories of tools:
- **MCP Tools**: Use the Model Context Protocol to connect to databases, APIs, and file systems. With MCP tools, you can chain calls to multiple services and map the results to the next step. For example, you can call a location API, then a weather API to get the weather for that location, then a database to get the weather history for that location, then a file system to save the weather history for that location.  
- **GUI Tools**: Create interactive forms to collect user input. For example, you can create a form to collect a user's name and email address, then use that information to send an email to the user.



### 🤖 Agent Builder
Visually design intelligent agents. Agents can use LLMs, Tools, call APIs, access databases and file systems and combine them to create complex workflows with decision making and loops. 
- **Canvas Interface**: Drag and drop nodes (Tools, LLM, Logic, etc.) to create workflows.
- **AI-Assisted Design**: Describe what you want, and let the Architect build it.

### ⚡ Workflows
Orchestrate complex Business logic with agents (That can be real persons or AI agents).
- **Logic Nodes**: Use Conditions, Loops, and Decision nodes.
- **Data Mapping**: Transform data between steps using JSON paths.

### ⚙️ Settings
Configure your environment.
- **Local Models**: Run agents privately using Ollama.
- **Remote APIs**: Connect to powerful cloud models like GPT-4.
