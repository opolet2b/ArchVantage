# **Functional Specifications: Smart Analysis Framework**

## **1\. Executive Summary**

The Smart Analysis Framework is an orchestration layer designed to transform raw document assets into structured, expert-level analyses. It separates the **Execution** (Workbench), the **Configuration** (Template Studio), and the **Governance** (Admin Interface). This document provides exhaustive specifications for developers and stakeholders to build a consistent, high-precision analysis engine.

## **2\. Workbench: Analysis Execution (End-User View)**

The Workbench is integrated into the existing Canvas environment. It acts as the consumption layer for the templates created in the Studio.

### **2.1 Trigger & Contextual Selection**

* **Action:** The user selects one or more documents on the Canvas and right-clicks to open a contextual menu.  
* **Template Filtering:** The system dynamically filters available templates based on the selection count.  
* **Execution Modal:** If a template requires specific parameters, a non-intrusive modal appears.

### **2.2 Result Visualization**

* **Textual:** High-fidelity Markdown (.md).  
* **Tables:** Structured Markdown or CSV.  
* **Diagrams:** Interactive SVG/PNG rendered from Mermaid code.  
* **Traceability:** Clickable source links with document highlighting based on Evidence Objects.

## **3\. Template Studio: The Configuration Engine (Power User View)**

The Template Studio is a No-Code environment where Power Users build sequential **Analysis Pipelines**.

### **3.1 Pipeline Orchestration**

Analyses are executed as a strict linear sequence of blocks: Data Extractor → Specialized AI Agent → Output Formatter.

### **3.2 Module: Data Extractor (The "Pre-Processor")**

* **Target Entities Help:** The Studio provides "AI Suggestions" based on the document category.  
* **Common Document Sections (Multi-select):**  
  * **A. Generic/Functional Sections:** Introduction/Summary, Analysis of Pros, Analysis of Cons, Conclusions.  
  * **B. Domain-Specific Sections:** (Contextual) Financial Statements, Legal Clauses, Technical Specs, etc.

### **3.3 Module: Specialized AI Agent (The "Reasoning Core")**

* **Persona Selection:** Legal Counsel, Financial Auditor, Cybersecurity Architect, Strategic Consultant, Technical Architect.  
* **Framework Wizard:** Contextual suggestions (STRIDE for Risk, SWOT for Strategy, TOGAF for Architecture) based on the template type defined at start.

### **3.4 Module: Variable Management (No-Code Input)**

* **Variable Panel:** UI-driven management of dynamic inputs.  
* **UI Controls:** Name, Label, Type (Text, Date, Number, List), and Default Value.

### **3.5 Module: Output Formatter (Target Format)**

* **Textual Reports:** Markdown (.md).  
* **Diagrams/Schemas:** Mermaid (SVG/PNG).  
* **Tables/Data:** CSV or Markdown.

## **4\. Admin Interface: Framework Governance (System Admin)**

The Admin Interface allows administrators to manage global settings: Analysis Taxonomy, Knowledge Base Sections, Persona Management, Framework Governance (including AI Specifications), Terminology/Thesauruses, and Logic/UI Metadata.

## **5\. Technical Architecture & Data Objects**

### **5.1 Evidence Objects (JSON Structure)**

Every finding must be returned with an array of evidence\_objects to ensure absolute traceability (source\_id, snippet, page\_number, coordinates).

### **5.2 Map-Reduce Logic**

Automatically invoked for large or multiple document sets. Processing is split into a **Map Phase** (individual asset analysis) and a **Reduce Phase** (global synthesis).

## **6\. Critical Development Guardrails**

1. **Strict Traceability:** Grounding metadata required for every paragraph.  
2. **Expertise Scaling:** Dynamic reasoning depth (Chain of Thought vs. Fast Response).  
3. **Hallucination Prevention:** Strict Temperature control (0.0-0.1).  
4. **Thesaurus Guard:** Post-processing terminology validation step.

## **7\. JSON Template Schema (The "Workflow" Definition)**

This JSON structure is the output of the Template Studio and the input for the Analysis Engine.

### **7.1 Schema Definition**

{  
  "template\_metadata": {  
    "id": "uuid",  
    "name": "Risk Analysis Audit",  
    "category\_id": "risk\_mgmt",  
    "description": "Exhaustive risk audit based on STRIDE framework.",  
    "version": "1.0.0"  
  },  
  "execution\_constraints": {  
    "min\_docs": 1,  
    "max\_docs": 5,  
    "input\_mode": "single"  
  },  
  "user\_inputs": \[  
    {  
      "id": "var\_target\_system",  
      "label": "Target System Name",  
      "type": "string",  
      "default": "Internal Network"  
    }  
  \],  
  "pipeline": \[  
    {  
      "step": 1,  
      "type": "data\_extractor",  
      "params": {  
        "generic\_sections": \["Background", "Analysis of Cons"\],  
        "domain\_sections": \["Technical Specifications", "Risk Assessments"\],  
        "target\_entities": \["Vulnerabilities", "Data Flows", "Assets"\],  
        "extraction\_objectives": "Identify all assets and potential entry points mentioned."  
      }  
    },  
    {  
      "step": 2,  
      "type": "specialized\_ai\_agent",  
      "params": {  
        "persona\_id": "cyber\_arch",  
        "framework\_id": "stride",  
        "expertise\_level\_default": "expert",  
        "thesaurus\_id": "nist\_csf",  
        "logic\_depth": "chain\_of\_thought",  
        "custom\_instructions": "Focus specifically on {{var\_target\_system}} security posture."  
      }  
    },  
    {  
      "step": 3,  
      "type": "output\_formatter",  
      "params": {  
        "primary\_format": "markdown",  
        "visual\_format": "mermaid",  
        "data\_format": "csv",  
        "include\_evidence\_table": true  
      }  
    }  
  \],  
  "guardrails": {  
    "temperature": 0.1,  
    "hallucination\_check": "strict",  
    "enforce\_citations": true  
  }  
}

### **7.2 Exhaustive Risk Analysis Example (Contextual UI)**

When a user builds a **Risk Analysis** template:

1. **Framework Wizard**: Suggests *STRIDE*, *DREAD*, or *NIST*. If user selects *STRIDE*, the Admin-defined "AI Specification" for STRIDE is injected into Step 2\.  
2. **Data Extractor**: Suggests "Risk Assessments" and "Analysis of Cons" as sections.  
3. **Agent Persona**: Automatically defaults to "Cybersecurity Architect."  
4. **Output**: Automatically configures a "Risk Matrix" (SVG) and an "Evidence List" (.md) as mandatory outputs.

*End of Specifications*