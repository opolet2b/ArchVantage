# **Functional Specification: Deep Analysis Template Engine Enhancements (v2)**

## **1\. Overview**

A system transforming "Instructional Markdown Blueprints" into structured research reports via LangGraph and LlamaIndex. This update introduces parallel execution, token-efficient context management, and advanced logical branching.

## **2\. Enhanced Blueprint Syntax (Template Editor)**

### **A. Subsection Looping & Parallelism**

To optimize latency, the engine supports fan-out execution.

* **Syntax:** \<\!-- BEGIN LOOP: \[DataSource\] \--\>  
* **Parallel Trigger:** When the Template Parser identifies a loop, it generates a list of TaskTasks to be dispatched simultaneously via LangGraph's Send API.

### **B. Conditional Logic Blocks (IF/ELSE)**

Allows the template to adapt based on the presence or value of data.

* **Syntax:**  
  \<\!-- IF: \[Condition, e.g., "Financials are available"\] \--\>  
  \#\# Financial Performance  
  \<\!-- INSTRUCTION: Analyze the balance sheet \--\>  
  \<\!-- ELSE \--\>  
  \#\# Financial Overview (Limited Data)  
  \<\!-- INSTRUCTION: Explain why data is missing \--\>  
  \<\!-- ENDIF \--\>

* **Logic:** The Constraint Checker evaluates the condition against the initial data extraction metadata.

### **C. Reference & Citation Management**

Automated bibliography and inline sourcing.

* **Inline Syntax:** \<\!-- INSTRUCTION: \[Prompt\] (CITE: True) \--\>  
* **Global Syntax:** \<\!-- REFERENCES \--\>  
* **Behavior:** The Final Assembly node collects all metadata associated with RAG chunks used in the output and generates a formatted list at the \<\!-- REFERENCES \--\> placeholder.

## **3\. Execution Logic & Graph Architecture**

### **Node 1: Template Parser & Plan Generator**

* **Logic:** Breaks the Markdown into a TaskManifest.  
* **Fan-out:** If LOOP is detected, it prepares a state for each item in the list.

### **Node 2: The "Map" Stage (Parallel Execution)**

* **Function:** Executes ![][image1] instances of Deep Research Analyzer in parallel.  
* **State:** Each branch maintains its own local state to avoid race conditions.

### **Node 3: Context Pruning & Map-Reduce Summarization**

To handle token limits during recursive retrieval:

1. **Threshold Check:** If retrieved context for an INSTRUCTION exceeds 80% of the model's window.  
2. **Pruning:** Remove low-relevance chunks based on cross-encoder scoring.  
3. **Map-Reduce:** If data density is required, the node triggers a sub-loop to summarize individual documents into "Topic Summaries" before passing them to the final analyzer.

### **Node 4: The "Reduce" Stage (Final Assembly)**

* **Function:** Collects results from all parallel branches.  
* **Logic:** Reconstructs the document in the order defined by the blueprint, resolving IF/ELSE branches and unrolling LOOP results.

## **4\. RAG Strategy & Token Management**

* **Recursive Retrieval:** LlamaIndex navigates from parent chunks to child nodes.  
* **Token-Aware Querying:**  
  * **Dynamic k:** The number of retrieved chunks (![][image2]) is adjusted based on the character count of the prompt and the remaining token budget.  
  * **Context Compression:** Uses LongContextReorder to place the most relevant information at the beginning and end of the context window (countering "lost in the middle" phenomena).

## **5\. Smart Analysis Integration Update**

| Step | Template Integration Logic |
| :---- | :---- |
| **Analyzer** | **Parallel Orchestrator:** Manages the LangGraph fan-out. |
| **Context Manager** | **Token Guard:** Injected between retrieval and analysis to perform Map-Reduce if the manifest's instructions are too broad. |
| **Formatter** | **Citation Engine:** Injects standard Markdown citations \[^1\] and populates the \<\!-- REFERENCES \--\> block. |

## **6\. UI Implementation (Green Brain)**

* **Parallelism Visualizer:** The modal must show parallel tracks when a LOOP is executing.  
* **Token Warning:** A visual indicator if a section required "Map-Reduce" due to context size, informing the user of potential loss of granular detail.

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAYCAYAAAD3Va0xAAABSElEQVR4XmNgGAUkAXl5eUcgfg3E/0FYTk5uh4yMDCdMXkVFhU9BQWEXTB6K14mLi3MjmwMDjEDJWUD8C4h/ArElugKgWBAQr0G2BAMAXSEItHUhkM6H2jgFKMyIrAYoVgTE0chiGEBRUVEfaEg/UKEkEF8H4idArIikhAXInw1ShySGCUA2AV2UDmID6Qaoq3Jg8lJSUiJQFwsidGEBQE19QEXGILasrKwOkP8eiE8oKSnxg8SAcjZA/mRUXWgAFj4gW6FCIG8sB+J/QHEPkADItUSHDwNS4IIMABkEMhAUSySHDwyAvATyGtSLTsSEDyj9TAaGiym6BFBjjDwk0K8BDepEl0cBWMIHDoBeEZeHJAWQYfjDB+RsIF4HNIgLXQ4EoEnhLRBrosuBAdAlLkDJL1DbQBiULbzR1YGSAijvEQqfUTAiAQBQCVhal567ggAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAAXCAYAAADduLXGAAABEElEQVR4XmNgGJSAUVpaWlhBQUEAXQIFABV0ysvL/wLi/0BchC6PAYCKgoD4t5ycnA26HAYAKpwExA9kZGSk0eVQgLq6Oi9Q4WEg3gp0Ege6PAoAKtIE4rdAJ5RDhRiVlJTUgHxXoE2c6IqjgfgfUNLF2NiYFWh6I5DfDaQ3YngY5l5ZWVlloIZ6oCIDkCJ59NABSgoCBU4D8RWgopkgJ4HEQc4A8gvFxcW5kU2FBxnQfSpABbeA/PVYPQpzAizIgIoWgmyC2ugN5MeDFYqKivIABQ4A8RoglwVJ8RpQKADpHiBWBCtWVFQEsuWfAXEO1CKQTcFA/ASI10HFGWFyjCDrgDQzTAAEQDYSTFAjGgAA7Kw/yuu5o6cAAAAASUVORK5CYII=>