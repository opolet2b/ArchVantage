  # **Requirements Specification: MCP Tool Builder**

  ## **1\. User Interface (UI) & Navigation**

  ### **1.1 Navigation Menu**

  * **Placement:** A new menu item labeled **"Tools"** will be added to the left-hand sidebar, located immediately below the "Agent" menu.  
  * **Default View:** Clicking this icon opens the **Tool Library View**.

  ### **1.2 Tool Library View**

  * **List Display:** The main area displays a list of existing tools accessible to the current user.  
  * **Categorization:** Tools are grouped by **Category** (e.g., Finance, IT, Customer Support).  
  * **Filtering:** Users can filter the list by selecting specific categories.  
  * **Create Action:** A **"+" (Plus)** button is located at the top of the list. Clicking it initiates the creation of a new tool.

  ### **1.3 Tool Editor Layout (Creation/Modification)**

  * **Master-Detail View:**  
    * **Left Panel:** Displays tool properties including:  
      * **Name**  
      * **Description**  
      * **Category** (Selectable from a pre-defined list)  
      * **Rights/Permissions**  
    * **Right/Main Panel:** The working canvas for building the tool.  
  * **Sidebar Resources:** In Edit mode, a specific palette displays available **MCP Servers**.

  ### **1.4 Category Management (Administrative)**

  * **Admin Access:** Only users with **Administrator** privileges can create, edit, or delete Categories.  
  * **Usage:** Standard users can only select from the existing list of categories when creating a tool.

  ## **2\. Tool Configuration Workflow**

  ### **2.1 MCP Integration (Drag & Drop)**

  * **Selection:** The user can view a list of registered MCP Servers in the GUI.  
  * **Action:** The user can drag an MCP Server from the list and drop it onto the main working canvas.  
  * **Visual Feedback:** The connected MCP Server is represented by an icon in the working area.  
  * **Discovery:** Upon connection, the system automatically queries the MCP Server to discover available functions.

  ### **2.2 Function Selection**

  * **Display:** The UI lists all functions discovered from the connected MCP server.  
  * **Filtering:** The user can check/uncheck specific functions.  
  * **Constraint:** Only selected functions will be exposed to the **Tool** definition; unselected functions remain inaccessible to this specific tool instance.

  ### **2.3 Semantic Definition**

  * **User Input:** The user provides a natural language description (Prompt) explaining the tool's intended purpose (e.g., *"This tool calculates VAT for European countries"*).  
  * **System Generation:** Upon validation, the system uses an LLM to generate a **System Prompt** for the tool. This prompt translates the user's intent into specific instructions, defining when and how the tool should utilize the selected functions.

  ## **3\. Technical Requirements: Execution Runtime**

  The Tool Builder must generate a **Runtime Wrapper** that manages the lifecycle of a tool call. This wrapper enforces the strict JSON-RPC 2.0 protocol and error handling logic defined below.

  ### **3.1 Input Contract & Validation**

  The runtime wrapper must:

  1. **Define Parameters:** Automatically generate a JSON Schema for the input parameters based on the selected MCP functions.  
  2. **Receive Request:** Accept requests in the standard JSON-RPC format:  
    {  
      "jsonrpc": "2.0",  
      "id": 1,  
      "method": "tools/call",  
      "params": {  
        "name": "function\_name",  
        "arguments": {  
          "arg1": "value",  
          "arg2": "value"  
        }  
      }  
    }

  3. **Validate:** Validate incoming arguments against a **Pydantic model** strictly derived from the schema. Invalid types must trigger an immediate error response without execution.

  ### **3.2 Execution & Error Handling**

  The runtime wrapper must:

  1. **Encapsulate:** specific execution logic within a try/catch block.  
  2. **Execute:** Call the underlying MCP function.  
  3. **Catch Exceptions:** Intercept standard output (stdout), standard error (stderr), and Python exceptions.

  ### **3.3 Output Standardization**

  The runtime wrapper must return a standardized JSON-RPC response regardless of success or failure.

  * Scenario A: Success  
    Returns the function output wrapped in a text content block with isError: false.  
    {  
      "jsonrpc": "2.0",  
      "id": 1,  
      "result": {  
        "content": \[  
          {  
            "type": "text",  
            "text": "The result of the operation."  
          }  
        \],  
        "isError": false  
      }  
    }

  * Scenario B: Failure  
    Returns the exception message or validation error wrapped in a text content block with isError: true.  
    {  
      "jsonrpc": "2.0",  
      "id": 1,  
      "result": {  
        "content": \[  
          {  
            "type": "text",  
            "text": "ValueError: Invalid argument provided."  
          }  
        \],  
        "isError": true  
      }  
    }

  ## **4\. Security & Access Control**

  ### **4.1 Access Levels**

  When creating or modifying a tool, the owner must assign permissions to specific **User Groups** or **Individual Users**.

  | Role | Permissions |
  | :---- | :---- |
  | **READ** | Can see the tool in the list and use it within their Agents. Cannot view implementation details or modify settings. |
  | **READ/WRITE** | Can use the tool, view implementation details, modify configuration, and update permissions. |

  ### **4.2 Default State**

  * New tools are private to the creator by default until permissions are explicitly assigned.