# **Requirements Specification: GUI Tool Builder & Runtime Extension**

**Status:** Draft Extension

**Parent Document:** Tools-Specs.md

**Purpose:** Defines the functional and technical requirements for "GUI Tools"—components that allow Agents to render interactive forms on the client side to retrieve structured information from users.

## **1\. User Interface (UI) Extensions**

### **1.1 Tool Library View (Enhanced)**

* **Type Differentiation:** The Tool Library list must visual distinguish between tool types using icons or badges:  
  * **Backend Tool:** (Existing) Connects to MCP Servers.  
  * **GUI Tool:** (New) Renders a frontend form.  
* **Creation Wizard:** Clicking the **"+" (Plus)** button now triggers a modal dialog:  
  * **Option A: Connect MCP Server** (Proceeds to existing MCP flow).  
  * **Option B: Create GUI Form** (Opens the Form Builder Canvas).

### **1.2 Tool Editor Layout (GUI Mode)**

When "Create GUI Form" is selected, the **Right/Main Panel** transforms into the **Form Builder Canvas**.

* **Widget Palette (Sidebar):** Replaces the "MCP Server" list. It contains draggable UI components:  
  * **Input Fields:** Text (Single line), Text Area (Multi-line), Number, Email, Password.  
  * **Selection:** Dropdown, Checkbox Group, Radio Button Group, Toggle Switch.  
  * **Display/Structure:** Section Header, Divider, Instructional Text.  
  * **Action:** Date Picker, Slider, File Upload (Future Scope).  
* **Canvas Area:** A WYSIWYG drop zone where widgets are arranged vertically.  
* **Properties Panel (Contextual):** Appears when a widget on the canvas is selected (see 2.2).

## **2\. Tool Configuration Workflow**

### **2.1 Widget Composition**

* **Drag & Drop:** Users drag widgets from the Palette to the Canvas.  
* **Reordering:** Widgets on the canvas can be dragged vertically to reorder.  
* **Deletion:** Selected widgets have a "Delete" action.

### **2.2 Widget Properties Configuration**

Selecting a widget opens its properties. Common properties include:

* **Field ID (Mandatory):** The variable name used in the resulting JSON (e.g., user\_email, delivery\_date). Must be unique within the form.  
* **Label:** The human-readable label displayed above the input.  
* **Placeholder:** Hint text displayed inside empty inputs.  
* **Required:** Boolean toggle.  
* **Validation Rules:**  
  * *Text:* Min/Max length, Regex pattern.  
  * *Number:* Min/Max value.  
* **Data Source (for Selectors):**  
  * *Static:* Manual entry of Label/Value pairs.  
  * *Dynamic (Advanced):* Binding to a simple list variable (Out of Scope for MVP).

### **2.3 Semantic Definition (System Prompt)**

* **Intent Definition:** The user defines the tool's purpose (e.g., *"Collect shipping details"*).  
* **Prompt Generation:** The system generates a System Prompt instructing the Agent:"Use this tool when you need to collect \[Field List\] from the user. Do not ask for these fields individually via chat. Call this tool to present the full form."

## **3\. Technical Requirements: Execution Runtime**

The GUI Tool execution differs fundamentally from MCP tools. It utilizes a **Client Interrupt Pattern**.

### **3.1 The "Client Interrupt" Workflow**

1. Agent Invocation:  
   The Agent decides to call the tool.  
   * *Request:* {"method": "tools/call", "params": {"name": "shipping\_form\_tool"}}  
   * *Note:* GUI tools typically accept no parameters from the Agent, or optional pre-fill parameters.  
2. Runtime Interception:  
   The Runtime Wrapper detects the tool type is GUI.  
   * **Action:** It halts the Agent's generation stream.  
   * **State:** The Agent is placed in a WAITING\_FOR\_TOOL state.  
3. UI Payload Generation:  
   The system retrieves the UI Schema (saved during Tool Configuration) and sends a specific message type to the frontend.  
4. Frontend Rendering:  
   The Chat Interface receives the payload, hides the standard text input, and renders the defined form inline.  
5. **User Submission (Resumption):**  
   * The user fills the form and clicks "Submit".  
   * The Frontend validates the data locally based on the schema constraints.  
   * On valid submission, the data is sent back to the Runtime as a **Tool Result**.

### **3.2 Data Contracts**

#### **A. UI Schema (Stored in DB & Sent to Client)**

This JSON structure defines how the form is rendered.

{  
  "tool\_type": "gui",  
  "version": "1.0",  
  "config": {  
    "title": "Shipping Information",  
    "submit\_label": "Confirm Details"  
  },  
  "components": \[  
    {  
      "id": "full\_name",  
      "type": "text\_input",  
      "label": "Full Name",  
      "required": true,  
      "validation": { "min\_length": 2 }  
    },  
    {  
      "id": "priority",  
      "type": "radio\_group",  
      "label": "Shipping Speed",  
      "options": \[  
        { "label": "Standard", "value": "std" },  
        { "label": "Express", "value": "exp" }  
      \],  
      "default": "std"  
    }  
  \]  
}

#### **B. Tool Result (Returned to Agent)**

The standard JSON-RPC response format is maintained, injecting the user's form data as the result.

{  
  "jsonrpc": "2.0",  
  "id": "call\_id\_123",  
  "result": {  
    "content": \[  
      {  
        "type": "text",  
        "text": "{\\"full\_name\\": \\"John Doe\\", \\"priority\\": \\"exp\\"}"  
      }  
    \],  
    "isError": false  
  }  
}

## **4\. Security & Permissions**

### **4.1 Access Control**

* **Usage Rights:** Same as Backend Tools (READ/WRITE permissions).  
* **Data Validation:** The Runtime must perform a secondary validation of the submitted data against the schema upon receipt, ensuring malicious clients cannot bypass frontend validation constraints.