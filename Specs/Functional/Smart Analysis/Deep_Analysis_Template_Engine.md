# **Functional Specification: Deep Analysis Template Engine**

## **1\. Overview**

A system that transforms "Instructional Markdown Blueprints" into comprehensive research reports. It integrates with the existing **Smart Analysis** framework, replacing generic output steps with structured, template-driven generation.

### **Core Stack**

* **Orchestration:** LangGraph (Stateful Agentic Workflows)  
* **Data Retrieval:** LlamaIndex (RAG & Recursive Retrieval)  
* **Interface:** Markdown with Logic Annotations  
* **Existing Integration:** Smart Analysis Framework (Extractor, Analyzer)

## **2\. Blueprint Syntax (Template Editor)**

The template editor is implemented at /templates. It supports standard Markdown enhanced by custom logic tags.

### **A. AI Verification & Prompt Optimization**

The content of the template (instructions) undergoes an automated verification process:

* **Constraint Check:** An AI agent verifies that the instructions are technically feasible given the available data tools.  
* **Prompt Engineering:** The system automatically refines instructions to ensure they are optimized for the execution engine's LLM.

### **B. Subsection Looping**

* **Syntax:**  
  \<\!-- BEGIN LOOP: \[DataSource/List\] \--\>  
  \#\# Analysis of {{item.name}}  
  \<\!-- INSTRUCTION: Deep dive into the {{item.attribute}} \--\>  
  \<\!-- END LOOP \--\>

### **C. Inline AI Instructions**

* **Syntax:** \<\!-- INSTRUCTION: \[Specific Prompt\] \--\>  
* **Behavior:** Triggers a targeted RAG query.

### **D. Tables & Figures**

* **Tables:** Standard pipes | with instructions in cells.  
* **Figures:** \!\[Placeholder\]({{figure\_id}}) followed by \<\!-- LEGEND\_INSTRUCTION: ... \--\>.

## **3\. Smart Analysis Integration & Workflow**

When a template is selected, the application's 4-step "Smart Analysis" feature is modified as follows:

| Step | Status | Template Integration Logic |
| :---- | :---- | :---- |
| **1\. Extractor** | **Active** | Extracts raw data relevant to the entities defined in the template's LOOP and INSTRUCTION blocks. |
| **2\. Analyzer** | **Modified** | **Constraint Engine:** Strictly bound by template requirements. Returns validation errors/warnings if user prompts are non-relevant. |
| **3\. Visualizer** | **Disabled** | Bypassed. Formatting is handled by the template's Markdown. |
| **4\. Formatter** | **Disabled** | Bypassed. Output is native Markdown. |

## **4\. Execution Logic & Plan Visibility**

The "Execution Engine" uses LangGraph to manage the research state.

### **Analysis Plan Accessibility**

* **Requirement:** Once the execution is triggered, the generated execution plan (the LangGraph workflow/manifest) must be accessible to the user.  
* **UI Implementation:** The created analysis node in the UI must include a button featuring the **"Green Brain"** icon.  
* **Content:** Clicking the **Green Brain** opens a modal/overlay showing the sequence of nodes, identified loops, and planned RAG queries.

### **LangGraph Nodes:**

* **Node 1: Template Parser & Constraint Checker:** Generates the TaskManifest and validates user requirements.  
* **Node 2: Smart Extractor (LlamaIndex):** Performs Recursive Retrieval and resolves loop dependencies.  
* **Node 3: Deep Research Analyzer:** Executes targeted queries for each INSTRUCTION.  
* **Node 4: Final Assembly:** Unrolls loops and performs post-processing (TOC/TOF).

## **5\. RAG Strategy (LlamaIndex Specifics)**

* **Query Transformation:** Break complex instructions into 3-5 specific search queries.  
* **Context Augmentation:** Include metadata (document date, source, reliability score).  
* **Structured Extraction:** Force JSON output for table population before conversion to Markdown.

## **6\. System Requirements for Vibe Coding Tool**

* **Persistence:** Use LangGraph Checkpointer for state recovery.  
* **Streaming:** UI must stream "Research Logs" during the execution of each node.  
* **Environment:** The template designer at /templates must persist blueprints to shared storage.