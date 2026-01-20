# **Specifications: ArchiMate XML to React Flow Converter**

## **1\. Project Overview**

The objective is to develop a web-based tool that accepts an ArchiMate Model Exchange File (XML) and generates an interactive diagram using the React Flow library. The tool must parse the logical model and visual metadata to reconstruct the architecture views accurately. The tool will be a "Drag'n drop" tool available on the right panel of the Semantic Canvas (similar to "MCP Tool", "Image Slides" etc.).

## **2\. Technical Stack**

* **Framework:** React (18+)  
* **Diagramming Engine:** [React Flow](https://reactflow.dev/)  
* **XML Parsing:** fast-xml-parser (Recommended for performance and namespace handling)  
* **State Management:** Zustand (Standard for React Flow integrations)  
* **Styling:** Tailwind CSS (For UI and custom node layouts)

## **3\. Data Source Specification**

The input must conform to **The Open Group ArchiMate Model Exchange File Format**. The parser must extract data from the following XML namespaces:

| Section | XML Path (Relative) | Purpose |
| :---- | :---- | :---- |
| **Elements** | model \> elements \> element | Core definitions: IDs, Types, and Names. |
| **Relationships** | model \> relationships \> relationship | Logical connections between elements. |
| **Views** | model \> views \> diagrams \> view | Visual metadata: Node positions, sizes, and edge routing. |

## **4\. Transformation Logic (Mapping)**

### **4.1. Node Transformation**

Each visual object within a \<view\> must be converted into a React Flow Node, i.e. a Thing.

* **ID Mapping:** Use the identifier attribute from the XML as the id in React Flow.  
* **Type Mapping:** Map xsi:type (e.g., archimate:BusinessActor) to a custom React Flow node type.  
* **Positioning:** \* x: Extract from \<bounds x="..." /\>.  
  * y: Extract from \<bounds y="..." /\>.  
* **Dimensions:** Map w and h from \<bounds\> to the CSS width and height of the node.  
* **Label:** Match the elementRef ID back to the core elements list to retrieve the name attribute.

### **4.2. Edge (Relationship) Transformation**

Each connection within a \<view\> must be converted into a React Flow Edge.

* **Source/Target:** Map the source and target attributes (IDs).  
* **Relationship Semantics:** Identify the relationshipRef to determine the line style:  
  * **Composition:** Solid line with a filled diamond at the source.  
  * **Aggregation:** Solid line with an empty diamond at the source.  
  * **Assignment:** Solid line with a filled circle at the source.  
  * **Realization:** Dashed line with an open arrow at the target.  
  * **Triggering:** Solid line with a filled arrow at the target.

## **5\. Visual Requirements (UI/UX)**

### **5.1. Layer-Based Color Coding**

The tool must apply the standard ArchiMate color palette based on the element type:

* **Business Layer:** Yellow (\#ffffb5)  
* **Application Layer:** Blue (\#b5ffff)  
* **Technology Layer:** Green (\#c9e7b7)  
* **Motivation/Strategy:** Purple/Pink (\#ccccff / \#fbb9d5)

### **5.2. Custom Node Components**

Nodes should not be simple boxes. They require:

1. **Iconography:** An SVG icon in the top-right corner representing the ArchiMate symbol.  
2. **Typography:** Centered text with overflow handling.  
3. **Grouping:** Support for "Folders" or nested elements (ArchiMate nesting implies a Composition/Aggregation relationship).

## **6\. Functional Features**

1. **File Upload:** Drag-and-drop zone for .xml or .archimate files.  
2. **View Selector:** If an XML contains multiple diagrams, provide a dropdown to switch between them.  
3. **Zoom & Pan:** Native React Flow controls.  
4. **Auto-Layout (Optional):** Integration with dagre or elkjs to organize nodes if visual coordinates are missing.  
5. **Export:** Ability to export the current view as an Image (PNG/SVG).

## **7\. Edge Cases & Constraints**

* **Namespaces:** The parser must handle xmlns:xsi and xmlns:archimate correctly to avoid data loss.  
* **Coordinate Systems:** ArchiMate XML coordinates may be relative to a parent container; the transformer must calculate absolute coordinates for React Flow if nested.  
* **Bendpoints:** ArchiMate edges often have intermediate points (bendpoint). These must be mapped to React Flow's path or points properties.