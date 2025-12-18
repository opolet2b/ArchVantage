# **Technical Specification: Markdown Generator Node (Component 1\)**

## **1\. Overview**

The **Markdown Generator Node** is a semantic processing engine. Its sole purpose is to ingest unstructured source text and restructure it into a valid Markdown format based on a provided template.

It utilizes a Large Language Model (LLM) to fill the structural content blocks of the template while **strictly preserving** the styling metadata (YAML Frontmatter) for use by downstream rendering components.

## **2\. Component Interface**

### **2.1 Inputs**

| Input Name | Type | Description |
| :---- | :---- | :---- |
| **Source Text** | String | The raw content to be processed (extracted text, OCR results, etc.). |
| **Template File** | File (.md) | The source markdown template containing YAML Frontmatter and Instruction Blocks. |
| **LLM Configuration** | Object | Configuration for the model (Model Name, Temperature, Context Window) used for restructuring.This should be a dropdown to select one od the model configured in settings. |

### **2.2 Outputs**

| Output Name | Type | Description |
| :---- | :---- | :---- |
| **Generated Markdown** | String (or File) | The final markdown content containing the original YAML Frontmatter \+ the LLM-generated body. |
| **Status** | Enum | SUCCESS, WARNING, or ERROR. |

## **3\. Template Architecture**

The node must process Markdown templates (.md) that contain two distinct sections.

### **3.1 YAML Frontmatter (Pass-Through)**

* **Definition:** The metadata block at the top of the file enclosed by \---.  
* **Role:** Contains style definitions (fonts, colors, margins).  
* **Requirement:** This node **must not modify** this section. It must extract it, hold it in memory, and prepend it exactly as-is to the final output.

### **3.2 Markdown Body (Instruction Logic)**

* **Definition:** The content below the Frontmatter.  
* **Role:** Defines the structure (Headers, Lists) and logic for the LLM.  
* **Syntax:** Uses HTML comments for instructions: \<\!-- INSTRUCTION: ... \--\>.

**Example Template Input:**

\---  
h1\_font: "Arial"  
h1\_color: "Blue"  
\---  
\# {{Title}}  
\<\!-- INSTRUCTION: Write a title based on the input text. \--\>

\#\# Section 1  
\<\!-- INSTRUCTION: Summarize the input text here. \--\>

## **4\. Functional Logic (Execution Flow)**

The node executes the following logic sequence:

1. **Template Parsing & Separation:**  
   * Read the **Template File**.  
   * Detect the YAML Frontmatter delimiter (---).  
   * **Split** the content into two parts: Frontmatter\_Block (String) and Body\_Template (String).  
2. **Prompt Engineering:**  
   * Construct a System Prompt using the Body\_Template.  
   * **Prompt Logic:** *"You are a document restructuring assistant. Your task is to replace the \<\!-- INSTRUCTION \--\> blocks in the provided markdown structure with content derived from the Input Text. Keep all standard markdown formatting (\#, \-, \>) exactly as they appear in the template."*  
3. **LLM Execution:**  
   * Send System Prompt \+ Source Text to the configured LLM.  
   * Receive the Filled\_Body\_Content.  
4. **Reassembly:**  
   * Concatenate Frontmatter\_Block \+ \\n \+ Filled\_Body\_Content.  
5. **Output Generation:**  
   * Return the complete string as **Generated Markdown**.

## **5\. Specific Feature Requirements**

### **5.1 Content Restructuring**

* **Text extraction:** The node must accurately extract information from the Source Text corresponding to the requested template sections.  
* **Placeholder Handling:** If the Source Text does not contain information for a specific section, the LLM must insert a neutral placeholder (e.g., *"\[No data available for this section\]"*) rather than hallucinating facts.

### **5.2 Image Placement**

* **Detection:** The node must identify image URLs present in the Source Text.  
* **Insertion:** The LLM must place these images into the Markdown flow using standard syntax \!\[Alt Text\](URL) where they are semantically relevant to the text being written.

### **5.3 Table Formatting**

* **Data Structure:** If the template requests structured data (e.g., "Extract financials"), the LLM must format this data into standard Markdown tables:  
  | Metric | Value |  
  | :--- | :--- |  
  | Revenue | $1M |

## **6\. Edge Cases & Error Handling**

| Scenario | System Behavior |
| :---- | :---- |
| **Input text exceeds Context Window** | **Error:** Return InputTooLarge. The node should not silently truncate text. |
| **Missing YAML in Template** | **Warning:** Proceed with processing. Treat the entire file as the Body. |
| **LLM Returns Broken Markdown** | **Sanitization:** The node should perform a basic check (e.g., ensuring code blocks \`\`\` are closed) before outputting, or mark Status as WARNING. |
| **Empty Input Text** | **Error:** Return EmptyInput. |

