# **Requirements Specification: MCP Tool Builder**

## **1\. User Interface (UI) & Navigation**

### **1.1 Navigation Menu**

●   	**Placement:** A new menu item labeled **"Tools"** will be added to the left-hand sidebar, located immediately below the "Agent" menu.

●   	**Default View:** Clicking this icon opens the **Tool Library View**.

### **1.2 Tool Library View**

●   	**List Display:** The main area displays a list of existing tools accessible to the current user.

●   	**Categorization:** Tools are grouped by **Category** (e.g., Finance, IT, Customer Support).

●   	**Filtering:** Users can filter the list by selecting specific categories.

●       **Create Action:** A **"+" (Plus)** button is located at the top of the list. Clicking it initiates the creation of a new tool.

### **1.3 Tool Editor Layout (Creation/Modification)**

●       **Master-Detail View:**

○   	**Left Panel:** Displays tool properties including:

■   	**Name**

■   	**Description**

■       **Category** (Selectable from a pre-defined list)

■   	**Rights/Permissions**

○   	**Right/Main Panel:**

■      **Prompt Interface:** A prominent text input area at the top for entering the tool description (as defined in 2.3).

■      **Pipeline Canvas:** The area below displaying the generated steps.

■       The working canvas for building the tool.

●       **Sidebar Resources:** In Edit mode, a specific palette displays available **MCP Servers**.

### **1.4 Category Management (Administrative)**

●   	**Admin Access:** Only users with **Administrator** privileges can create, edit, or delete Categories.

●   	**Usage:** Standard users can only select from the existing list of categories when creating a tool.

---

## **2\. Tool Configuration Workflow**

### **2.1 MCP Integration (Drag & Drop)**

●   	**Selection:** The user can view a list of registered MCP Servers in the GUI.

●   	**Action:** The user can drag an MCP Server from the list and drop it onto the main working canvas.

●   	**Visual Feedback:** The connected MCP Server is represented by an icon in the working area.

●   	**Discovery:** Upon connection, the system automatically queries the MCP Server to discover available functions.

### **2.2 Function Selection**

●   	**Display:** The UI lists all functions discovered from the connected MCP server.

●   	**Filtering:** The user can check/uncheck specific functions. All functions are checked by default.

●   	**Constraint:** Only selected functions will be exposed to the **Tool** definition; unselected functions remain inaccessible to this specific tool instance.

### **2.3 Semantic Definition & Pipeline Generation**

●   	**User Input:** The user provides a natural language description (Prompt) explaining the tool's intended purpose (e.g., *"Take the email from the input, find the user ID in the CRM, and then fetch their last invoice"*).

#### **2.3.1 Pipeline Drafting (LLM Processing)**

·        **Generation:** An LLM analyzes the prompt and generates a **Candidate Pipeline** (JSON).

·        **Logic:** It identifies the necessary function calls and hypothesizes the data mapping between steps (e.g., guessing that step1.output.id maps to step2.input.user\_id).

·        **State:** The tool enters a **"Draft / Unverified"** state. The UI renders the proposed steps but locks the "Save" button until verification is complete.

#### **2.3.2 Interactive Dry-Run (Verification & Schema Discovery)**

To ensure reliable data passing, the system enforces a step-by-step execution cycle during the build process.

* **Step 2.3.2.1: Input Injection**  
  * The system pauses at the first step requiring external input.  
  * **Action:** A modal prompts the user: *"Please provide a valid \[parameter\_name\] for testing."*  
  * **Constraint:** The user must provide real data (e.g., an actual email address) that exists in the target system.  
* **Step 2.3.2.2: Safety Check & Execution**  
  * **Analysis:** The system checks the function's method or metadata for side effects.  
  * **Warning:** If the function is potentially destructive (e.g., DELETE, POST, UPDATE), the UI displays a warning: *"This step will modify real data. Proceed?"*  
  * **Execution:** Upon confirmation, the system executes the single atomic MCP function.  
* **Step 2.3.2.3: Schema Capture & Re-Mapping**  
  * **Capture:** The system captures the actual JSON output from the execution.  
  * **Refinement:** The system compares this actual output against the input requirements of the *next* step in the candidate pipeline.  
  * **Auto-Correction:** If the LLM's initial mapping guess was incorrect (e.g., field name mismatch), the system updates the mapping logic using the confirmed schema.  
* **Iteration:** This cycle repeats for every step in the pipeline until the workflow is complete.

 

**2.4 Finalization**

 

* **Verification:** Once the Dry-Run completes successfully, the tool is marked as "Verified."  
* **Schema Locking:** The input/output structures discovered during the Dry-Run are saved as the strict schema definition for the tool.

---

## **3\. Technical Requirements: Execution Runtime**

The Tool Builder must generate a **Pipeline Executor** that manages the lifecycle of a tool call. Unlike a script, this executor iterates through a static JSON definition, ensuring deterministic behavior and security.

### **3.1 Pipeline Data Structure**

The tool definition must adhere to a strict JSON Schema containing an ordered list of steps.

**Schema Definition:**

JSON

{

  "pipeline": \[

	{

  	"step\_id": "unique\_identifier",

  	"function\_ref": "server\_name.function\_name",

  	"arguments": {

    	"param\_key": "static\_value\_or\_variable"

  	}

	}

  \]

}

 

Variable Syntax:

To chain data, the configuration uses a templating syntax to reference data from three contexts:

1. **Input:** {{ input.argument\_name }} (Arguments passed to the tool at runtime).  
2. **Step Results:** {{ step\_id.result.field\_name }} (Output from previous steps).  
3. **Environment:** {{ env.API\_KEY }} (If applicable).

### **3.2 Execution Logic (The "Engine")**

The runtime wrapper executes the tool using the following logic flow:

1. **Context Initialization:** Create a memory context containing the initial input parameters.  
2. **Sequential Iteration:** Loop through the pipeline array in order.  
3. **Variable Resolution (Pre-flight):**

   ○   	Before calling an MCP function, parse its arguments.

   ○   	Resolve any {{ placeholder }} values against the current memory context.

   ○   	*Constraint:* If a required variable is missing or null, halt execution immediately.

4. **Atomic Execution:**

   ○   	Execute the specific MCP function via JSON-RPC.

   ○   	**Wait** for the return value.

5. **Context Update:**

   ○   	Store the JSON output of the function into the memory context under the key step\_id.result.

6. **Termination:**

   ○   	Once all steps are complete, return the result of the **final step** (or a specific aggregated object) as the tool's output.

### **3.3 Error Handling & Safety**

The runtime must enforce a **"Fail-Fast"** policy.

●   	**Validation Error:** If variable resolution fails (e.g., trying to read a field that doesn't exist in the previous step's output), the tool returns a standard error immediately.

●   	**Function Error:** If an underlying MCP function returns an error (stderr or JSON-RPC error), the pipeline stops. The wrapper returns the exact error message from the failing step to the user.

●   	**Timeout:** A global timeout (default: 30s) applies to the entire pipeline execution to prevent hanging processes.

### **3.4 Input/Output Contract (External Interface)**

1. **Input Schema Generation:** The system must automatically generate the tool's input schema by analyzing the variable requirements of the **first step** (or any step requiring {{ input.x }}).  
2. **Output Standardization:**

   ○   	**Success:** Returns the JSON result of the final step, wrapped in the standard MCP content block (isError: false).

   ○   	**Failure:** Returns a JSON-RPC error object indicating which step failed and why (isError: true).

---

## **4\. Security & Access Control**

### **4.1 Access Levels**

When creating or modifying a tool, the owner must assign permissions to specific **User Groups** or **Individual Users**.

| Role | Permissions |
| :---- | :---- |
| **READ** | Can see the tool in the list and use it within their Agents. Cannot view implementation details or modify settings. |
| **READ/WRITE** | Can use the tool, view implementation details, modify configuration, and update permissions. |

### **4.2 Default State**

●   	New tools are private to the creator by default until permissions are explicitly assigned.

 

