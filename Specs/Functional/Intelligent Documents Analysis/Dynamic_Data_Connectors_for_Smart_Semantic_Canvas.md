# **Specifications: Dynamic Data Connectors for Smart Semantic Canvas**

## **1\. Executive Summary**

This document defines the integration of dynamic data sources—specifically **Relational Databases** and **MCP (Model Context Protocol) Servers**—into the existing drag-and-drop canvas application. These connectors will be treated as first-class objects, capable of being vectorized, searched, and semantically linked to static documents (PDFs, Images, Tables).

## **2\. System Architecture & Protocols**

### **2.1. Connectivity Layer**

* **Database Connectors:** Direct integration via backend drivers (PostgreSQL, MySQL, MongoDB).  
* **MCP Integration:** Support for the **Model Context Protocol** (v1.0 or higher) using stdio (local) or SSE (remote) transports.  
* **Vectorization Pipeline:** Asynchronous extraction of data from dynamic sources, converted into embeddings and stored in the vector database with metadata linking back to the source node.

### **2.2. The Introspection Engine**

The system MUST implement an introspection layer that translates technical definitions into UI metadata:

* **MCP:** Calls tools/list to retrieve inputSchema (JSON Schema).  
* **DB:** Queries information\_schema or DESCRIBE to identify column types and constraints.

## **3\. Admin Interface (Configuration)**

The Admin Interface is the "Control Plane" where technical complexity is abstracted.

### **3.1. Database Setup**

* **Connection Wizard:** Fields for Host, Port, Database, User, and Password (stored in encrypted vault).  
* **Visibility Control:** A tree-view to toggle visibility for specific schemas/tables.  
* **Query Templates:** Ability for admins to write "Parameterized SQL Views" (e.g., SELECT \* FROM sales WHERE region \= {{region}}).

### **3.2. MCP Server Configuration**

* **Registry:** Add MCP servers via URL (SSE) or command line path (stdio).  
* **Tool Curation:** Admin sees a list of all tools/resources exposed by the server.  
* **Form Preview:** A "Live Preview" panel showing exactly how the parameter form will look to the end-user, based on the inputSchema.

## **4\. End-User Canvas Interface**

### **4.1. Connector Entry Points**

The right-hand panel provides two primary icons for initiating dynamic connections:

* **Database Icon:** For accessing structured relational data.  
* **MCP Server Icon:** For accessing external tools and API functions.

### **4.2. Drag-and-Drop & Selection Workflow**

#### **4.2.1. Database Drop Workflow**

1. **Drop:** User drags the DB icon onto the canvas.  
2. **Database Selection:** A list of available DB configurations (pre-configured by the Admin) is presented.  
3. **Table Selection:** Upon selecting a database, the system fetches and displays a list of tables the user has rights to access.  
4. **Instantiation:** The selected table is created as a "Thing" on the canvas.

#### **4.2.2. MCP Server Drop Workflow**

1. **Drop:** User drags the MCP Server icon onto the canvas.  
2. **Server Selection:** A list of available MCP Server configurations (pre-configured by the Admin) is presented.  
3. **Function Selection:** Upon selecting a server, the system lists the available functions/tools exposed by that server based on user permissions.  
4. **Instantiation:** The selected function is created as a "Thing" on the canvas.

### **4.3. Function Execution & Input Logic**

Once an MCP Function is instantiated as a canvas "Thing," its input is handled via two scenarios:

* **Scenario A (Connected):** If the function "Thing" is linked to another "Thing" (e.g., a Document or Table), it attempts to automatically ingest its input from the connected source.  
* **Scenario B (Unconnected):** If no connection exists, clicking the "Refresh" button on the "Thing" triggers a UI modal. This modal uses the **Automatic UI Mapping** (described below) to allow the user to enter the required input parameters manually.

### **4.4. Automatic UI Mapping (for Manual Entry)**

When manual input is required:

* string $\\rightarrow$ Text Input (with validation for email, uri, or date).  
* boolean $\\rightarrow$ Toggle/Switch.  
* number $\\rightarrow$ Numeric Slider or Input.  
* enum $\\rightarrow$ Dropdown menu.  
* description $\\rightarrow$ Contextual tooltip.

## **5\. Data Handling**

### **5.1. Dynamic Vectorization**

* **Trigger:** Upon data fetch, text-based results are automatically chunked and vectorized.  
* **Contextual Search:** Users can query the canvas, and the system will highlight the specific "Database Record" node or "MCP Result" node alongside static PDFs.

## **6\. Technical Requirements & Security**

* **Secret Management:** End-user parameters are never stored in plaintext.  
* **Rate Limiting:** Backend must handle throttling for MCP/DB calls to prevent UI lag.  
* **Schema Evolution:** If a tool's schema changes on the MCP server, the canvas node enters a "Stale" state, requiring the user to re-verify parameters.