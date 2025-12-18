# **Technical Specification: Templates Management Module**

## **1\. Overview**

The **Templates Management Module** is a subsystem within the Agent Builder that allows administrators and users to create, organize, secure, and edit the Markdown templates used by the **Markdown Generator Node**.

It features a specialized **"Architecture-Aware" Editor** that creates files compliant with the strict YAML Frontmatter \+ Markdown Body schema defined in the Generator Node specifications.

## **2\. Functional Requirements**

### **2.1 Settings & Configuration (In "Settings" Menu)**

* **UI Location:** This section must be implemented within the existing **"Settings"** menu of the application, under a new tab labeled **"Templates"**.  
* **Storage Backend:** Admin can configure the root location for templates.  
  * *Options:* Local File System path, AWS S3 Bucket, or Database Blob storage.  
* **Permission Model (RBAC):**  
  * **Scope:** Permissions are applied at the **Folder** level.  
  * **Entities:** Permissions can be assigned to **Users** or **Groups** (e.g., AD Groups, LDAP Roles).  
  * **Levels:**  
    * READ: Can select and use templates in agents.  
    * WRITE: Can **Create**, **Update**, and **Delete** templates and folders.  
    * DENY: Folder is invisible to the user.

### **2.2 Template Explorer (Side Bar \- "Templates")**

* **UI Location:** A new menu item labeled **"Templates"** must be added to the application's **side bar** (positioned at the bottom left).  
* **Access Control:** The view content is filtered dynamically based on the permissions defined in Settings (2.1).  
* **Tree View:** Displays folders and files. Folders where the user has DENY access must not be rendered.  
* **CRUD Operations:**  
  * **Create New Template / Folder:** Button available **ONLY** if the user has WRITE permission on the current folder.  
  * **Edit / Update Template:** Clicking a template opens the Editor. Save functionality is enabled **ONLY** if the user has WRITE permission.  
  * **Delete / Rename:** Context menu options available **ONLY** if the user has WRITE permission.

## **3\. The "Architecture-Aware" Editor (The Core Feature)**

To ensure compatibility with the **Markdown Generator Node**, the editor must strictly separate **Structure** (Content) from **Style** (YAML). It CANNOT be a standard "Rich Text" editor.

### **3.1 Layout**

The Editor interface consists of two distinct panels (Split View or Tabs):

#### **Panel A: The Theme Designer (Controls YAML)**

* **Purpose:** A GUI Form that generates the YAML Frontmatter. **No code editing required.**  
* **Controls:**  
  * **Page Settings:** Dropdown for Size (A4, Letter), Margin inputs.  
  * **Typography Groups:** Collapsible sections for "Header 1", "Header 2", "Body Text", "Notes (Blockquote)".  
    * *Selectors:* Font Family (Dropdown), Size (Number \+ Unit), Color (Color Picker), Bold/Italic (Toggles).  
* **Output:** Real-time updates to the underlying YAML string.

#### **Panel B: The Structure Editor (Controls Content)**

* **Purpose:** A WYSIWYG Markdown editor for writing the template body.  
* **Behavior:**  
  * **Semantic Blocks:** Users insert "Header 1", "Table", "Comment", not "18px Bold Text".  
  * **Visual Preview:** This editor renders the content using the styles defined in **Panel A**. (e.g., If user sets H1 to Blue in Panel A, the H1 in this editor turns Blue).  
  * **Special Components:**  
    * **"Instruction Block" Button:** Inserts the special syntax \<\!-- INSTRUCTION: ... \--\> as a visual editable pill/card, preventing the user from breaking the HTML comment syntax.  
    * **"Variable" Button:** Inserts placeholders like {{Title}}.

### **3.2 Saving**

* **Process:** On save, the system merges the State of Panel A (YAML) and Panel B (Markdown) into a single .md file.  
* **Validation:** Ensures YAML is valid and all Instruction Blocks are properly closed.

## **4\. AI Template Generation (LLM Integration)**

### **4.1 Feature Description**

Allows users to bootstrap a new template by describing it naturally.

* **Trigger:** Available in the "Create New Template" flow (requires WRITE permission).  
* *Input:* "I need a Project Status Report with a Blue and Orange theme, focusing on budget and risks."  
* *LLM Selection:* Dropdown to choose the configured LLM.

### **4.2 Generation Logic**

The system constructs a complex prompt to the LLM to generate **both** sections simultaneously.

**System Prompt Strategy:**

"You are a Template Generator. Output a valid Markdown file with YAML Frontmatter.

1. Based on the user's description ('Blue/Orange theme'), fill the YAML Frontmatter with appropriate hex codes and fonts.  
2. Based on the user's description ('Status Report'), structure the Markdown Body with headers.  
3. Inside sections, write \<\!-- INSTRUCTION: ... \--\> blocks describing what data to extract.  
4. Do not fill the sections with fake text, only placeholders."

## **5\. API / Backend Interface**

### **5.1 Template Object Model**

{  
  "id": "uuid",  
  "name": "Executive Resume",  
  "path": "/HR/Resumes/exec\_v1.md",  
  "acl": \[  
    { "role": "HR\_Managers", "permission": "WRITE" },  
    { "role": "HR\_Interns", "permission": "READ" }  
  \],  
  "last\_modified": "timestamp"  
}

### **5.2 File System Operations**

* GET /templates/tree: Returns folder hierarchy filtered by user permissions.  
* POST /templates/render-preview: Accepts { yaml, markdown } and returns a generic HTML preview for the editor.  
* POST /templates/generate: Calls the LLM to create a new template string.