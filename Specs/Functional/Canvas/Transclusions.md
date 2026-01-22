# **Functional Specifications: Linked Reporting & Transclusion**

## **1\. Overview**

This extension introduces "Transclusion" (dynamic embedding) to the Intelligent Semantic Workbench. It allows users to utilize enhanced **Text nodes (Markdown nodes)** to sync with other canvas entities (Document, Data, or Agent nodes), effectively turning any Text node into a dynamic report.

## **2\. Dynamic Content Linking (Transclusion)**

### **2.1. Embedding Syntax**

* The system uses a double-brace syntax for node references: {{node:NODE\_ID}}.  
* **Resolution Engine**: When a Text node is rendered, the parser identifies these tags and injects the referenced content and title of the source NODE\_ID into the view.  
* **Recursive Check**: To prevent infinite loops, the engine must block a node from referencing itself or creating circular reference chains.

### **2.2. User Interaction (Precise Drag-and-Drop)**

* **Direct Node Dragging**: Users can drag any source node (Document, Data, or Agent) directly over an open Text node editor. In this specific transclusion context, the source node remains in its original spatial position on the canvas; the drag action functions as a reference "extraction" rather than a standard move operation.  
* **Targeted Insertion**: When a node is dragged over the Text node's editor area, a visual "Drop Indicator" (horizontal line) follows the user's cursor within the markdown text.  
* **Placement**: Releasing the node inserts the {{node:ID}} tag exactly at the cursor's location. This allows transclusions to be integrated into specific paragraphs or sections of the existing Markdown content.  
* **Straightforward Removal**: Within the editor, deleting the {{node:ID}} text string removes the link. Visually, transcluded blocks feature an "Unlink" icon button in their header.

## **3\. Synchronization & Refresh Logic**

### **3.1. Controlled Synchronization**

To optimize performance and maintain narrative control, transcluded content does not update automatically on every render.

* **Individual Block Refresh**: Each transcluded block rendered within the host node features a dedicated **Refresh Icon**. Clicking this icon fetches the latest version of the specific source node's content.  
* **Node Locking (Padlock)**: Every node includes a **"Padlock" icon**. When the padlock is closed, the node is in a "Frozen" state.  
  * If a **source node** is locked, its transcluded representation in other reports will not update even if a refresh is triggered.  
  * If a **host node** is locked, none of its transcluded blocks will respond to bulk refresh commands, preserving the report's current state.

### **3.2. Bulk Refresh**

* **Refresh Nodes Button**: The header of a Text node containing transclusions includes a **"Refresh Nodes" button**. This is distinct from the standard node content refresh. Clicking "Refresh Nodes" attempts to re-fetch data for all transcluded blocks within the node, excluding those that are currently "locked."

## **4\. Interactive Table of Figures (ToF)**

### **4.1. Asset Cataloging**

* Enhanced Text nodes feature a sidebar or "Table of Figures" header that lists all external references found within the content.  
* Each entry shows: \[Icon\] Node Title (Node Type).

### **4.2. Semantic Navigation (The "Fly-To" Effect)**

* **Action**: Clicking a reference in the ToF or the embedded block triggers a viewport transition.  
* **Visual Effect**:  
  1. The canvas performs a smooth "Ease-in-out" pan and zoom to center the source node.  
  2. A temporary highlight (glow effect) is applied to the target node's border.  
  3. The viewport zoom level is adjusted to 1.2x to ensure the source is clearly legible.

## **5\. Non-Visual (Programmatic) Insertion**

### **5.1. Developer Console / CLI**

* A "Command Palette" or "CLI" allows for code-based node placement.  
* **Command Syntax**: insert \[type\] "\[title\]" "\[content\]" x,y

## **6\. Technical Requirements**

* **State Management**: The nodes array remains the source of truth. The system must track a isLocked boolean for each node and a lastSyncedContent cache for transcluded blocks to prevent redundant network calls.  
* **UI/UX**: Transcluded content must be visually distinct (e.g., subtle background tint or left-border accent) to indicate it is "read-only" within the context of the host node.