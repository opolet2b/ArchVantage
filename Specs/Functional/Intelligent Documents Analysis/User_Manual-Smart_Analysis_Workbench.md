# **User Manual \- Smart Analysis Workbench**

## **1\. Introduction**

The **Smart Analysis Workbench** is a document intelligence platform designed to automate expert analyses across various document volumes. The application is built on three pillars: the **Workbench** (execution), the **Template Studio** (logic configuration), and the **Admin Interface** (governance and knowledge management).

## **2\. The Workbench (User Interface)**

The Workbench is integrated directly into your **Canvas**. It serves as the primary consumption layer where analyses are triggered.

### **Step 1: Selection on Canvas**

Select one or more documents directly on the Canvas.

* **Single Analysis:** Select one document (e.g., SWOT, Anomaly Detection).  
* **Comparative Analysis:** Select two or more documents (e.g., Benchmarking, Gap Analysis).

### **Step 2: Triggering via Context Menu**

Right-click on the selected assets to open the **Contextual Menu**. Templates are organized by categories (Strategic, Technical, Compliance, etc.). The menu dynamically filters templates based on the number of documents selected.

### **Step 3: Dynamic Parameters**

If a template requires specific inputs (e.g., "Target Competitor" or "Fiscal Year"), a modal will appear. Fill in these **No-Code Variables** before proceeding.

### **Step 4: Execution and Results**

Click **"EXECUTE"**. Results appear in an interactive overlay:

* **Textual:** Markdown (.md) reports.  
* **Visuals:** Diagrams (Mermaid), Matrices, or Pictures (SVG/PNG).  
* **Data:** Tables (CSV/Markdown).  
* **Traceability:** Click any claim to highlight the exact **Evidence Object** (snippet and page) in the source document on the Canvas.

## **3\. Template Studio (Power User Interface)**

The Studio is a No-Code environment for building **Sequential Pipelines**.

### **Building the Pipeline**

A template is a linear sequence of blocks:

1. **Data Extractor:** \* **Target Entities:** Assisted by AI suggestions based on document type.  
   * **Hybrid Sections:** Select from **Generic/Functional** sections (Introduction, Pros, Cons, Conclusions) or **Domain-Specific** sections (Legal Clauses, Financial Statements, etc.).  
2. **Specialized AI Agent:**  
   * **Persona:** Choose from pre-defined experts (Legal Counsel, Financial Auditor, etc.).  
   * **Framework Wizard:** Define your template type (e.g., "Risk Analysis") and the app will suggest frameworks (STRIDE, NIST, etc.).  
3. **Variable Management:** Create user-facing parameters via a UI (Text, Date, Number, List) without writing code.  
4. **Output Formatter:** Define the target format (.md, Mermaid, CSV, or SVG/PNG).

### **Publishing**

Click **"PUBLISH"** to make the template available in the Canvas right-click menu.

## **4\. Admin Interface (System Governance)**

The Admin Interface allows administrators to manage the global "intelligence" of the system:

* **Taxonomy & Categories:** Manage dynamic lists for activity types and groupings.  
* **Persona Management:** Define roles and "System Prompts" that govern AI behavior.  
* **Framework Library:** Link frameworks to technical **AI Specifications**—the deep logic rules the AI uses for analysis.  
* **Knowledge Base:** Manage the list of Generic and Domain-specific document sections.  
* **Thesauruses:** Upload industry-specific lexicons (HL7, TOGAF, IFRS) for terminology enforcement.

## **5\. Technical Concepts**

### **Evidence Objects & Traceability**

To eliminate hallucinations, every AI finding is linked to an **Evidence Object**. This object contains the raw snippet, page number, and precise coordinates. In the results, these act as "Source Links" to the original document.

### **Map-Reduce Architecture**

For large document sets or multi-document comparisons, the system automatically uses a **Map-Reduce** flow:

* **Map:** Extracts facts from each document individually.  
* **Reduce:** Synthesizes individual facts into a single comparative or strategic report.

## **6\. Prompt Optimization (Best Practices)**

To achieve high precision in the Template Studio:

* **Role Definition:** Start instructions with "Act as a \[Domain Expert\]".  
* **Specificity:** Be precise about what to find (e.g., "Identify liabilities exceeding $10k" vs "Find risks").  
* **Thesaurus Usage:** Mention active thesauruses in the Agent instructions to ensure standardized terminology.

## **7\. Troubleshooting**

* **Low Confidence Score:** Indicates insufficient evidence. Check document OCR or adjust the **Data Extractor** targets.  
* **Context Saturation:** For massive files, use the **Data Extractor** to filter out noise (headers/footers) before the AI Agent processes the text.