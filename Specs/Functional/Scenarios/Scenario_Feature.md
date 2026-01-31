# **Functional Specification: Scenario Feature & Semantic System**

## **1\. Executive Summary**

The "Scenarios" feature is a meta-configuration layer that pivots the Semantic Workbench into a specialized vertical solution. Activating a scenario reconfigures the UI, overrides tool behaviors, injects specific agent logic, establishes spatial defaults on the Canvas, and enforces business-meaningful data structures.

## **2\. Interface Transformations & Placements**

### **2.1 Scenario Selector (Global Control)**

* **Location:** Bottom-left sidebar, below Settings.  
* **Function:** A "Scenario Gallery" to browse, preview, and activate vertical modes.  
* **UI Feedback:** When active, the application frame reflects the scenario's primary color/theme.

### **2.2 Contextual Toolbox (The Green Toolbox)**

* **Logic:** Generic actions (Summarize, Find Related) are replaced with scenario-specific macros.  
* **Mapping:** Macros are mapped in the JSON definition to specific agent workflows or MCP tools.  
* **Example (Recruiter):** "Find Candidate Skills," "Compare to Job Desc," "Generate Outreach."

### **2.3 The Side Panel (Right)**

* **Logic:** Automatically pins "Essential Tools" for the scenario.  
* **Content:** Pinned Agents (Specialized Personalities) and Pinned MCP Toolsets (Live Data Connectors like LinkedIn, Jira, or PubMed).

### **2.4 Labeling & Iconography**

* **Logic:** Global override of application terminology.  
* **Terms:** "Things" \-\> "Candidates"; "Links" \-\> "Relationships"; "Canvases" \-\> "Investigation Boards."

## **3\. Semantic Domains (Hierarchical Containers)**

### **3.1 Domain Libraries & Groups**

* **Structure:** High volumes of domain types are organized into searchable libraries and collapsible groups.  
* **Inheritance:** Domains inherit visual themes (colors, geometry) from their parent group unless overridden.

### **3.2 Visual Configuration & Geometry**

* **Styling:** Support for specific Icons, Color Themes (Hex/Tailwind), and Backgrounds (Solid, Gradient, Texture, or Image).  
* **Geometry:** Configurable border\_radius (0px for rigid/audit zones; 12px+ for modern/creative zones).

### **3.3 Domain Metadata & Constraints**

* **Schemas:** Defines required fields for any node placed within the domain boundaries.  
* **Canvas Overlay:** Dynamic business metrics (e.g., "Total Budget: $200k") are rendered directly on the domain background.

## **4\. Automation & Spatial Logic**

### **4.1 Event-Driven Triggers (Watchers)**

* **Logic:** On \[Entry/Exit/Change\] in Domain \[Type\] \-\> \[Condition\] \-\> \[Action\].  
* **Proactive Agents:** Agents "watch" domains to automate processing (e.g., "When a PDF enters 'New Leads', run 'Bio Scraper' and move to 'Scanned'").

### **4.2 Automated Link Types**

* **Definition:** Scenarios define a default set of semantic link types.  
* **Context:** In a "Legal Discovery" scenario, drag-linking defaults to "Supports" or "Contradicts" instead of a generic arrow.

## **5\. Initialization & Scaffolding**

### **5.1 Auto-Canvas Generation**

* **Logic:** Activating a scenario creates a "Master Canvas" for that project type.  
* **Scaffolding:** Pre-populates the canvas with a predefined layout of Semantic Domains.

### **5.2 "Ghost" Nodes (Placeholders)**

* **Function:** Dashed-line placeholders that guide the user on where to drop data.  
* **Instructional Logic:** Clicking a Ghost Node opens a specific "Input Tool" or file uploader.

### **5.3 Template Injection**

* **Logic:** The "Document Templates" menu is pre-loaded with scenario-specific primitives.  
* **Usage:** Dragging a "Candidate Bio" template onto a candidate node generates a structured report instantly.

## **6\. Technical Implementation Schema (Summary)**

The scenario.json must integrate:

1. **Metadata:** Name, description, icon.  
2. **UI Overrides:** Toolbox macros, pinned tools, and terminology.  
3. **Domain Definitions:** Grouped library of containers with visual and metadata rules.  
4. **Agent Config:** Specialized system prompts and persona overrides.  
5. **Initialization:** Layout for the Master Canvas, including Ghost Nodes and Domains.  
6. **Automations:** Rules for domain-based triggers.

Sample: Implementation Schema

{

  "scenario\_id": "recruiter\_pro",

  "metadata": {

    "name": "Recruiter Pro",

    "theme\_color": "\#2563eb",

    "labels": { "node": "Candidate", "canvas": "Hiring Board" }

  },

  "ui\_overrides": {

    "toolbox\_macros": \[

      {

        "id": "match\_cv",

        "label": "Match to Role",

        "icon": "Users",

        "action": "run\_agent\_on\_selection",

        "agent\_id": "evaluator\_agent"

      }

    \],

    "sidebar\_right": {

      "pinned\_agents": \["screener\_bot"\],

      "pinned\_mcp\_tools": \["linkedin\_connector"\]

    }

  },

  "domain\_groups": \[

    {

      "id": "pipeline",

      "label": "Hiring Pipeline",

      "default\_visual\_config": { "border\_radius": 16, "primary\_color": "\#f3f4f6" }

    }

  \],

  "domain\_definitions": \[

    {

      "id": "shortlist",

      "group\_id": "pipeline",

      "label": "Shortlisted",

      "visual\_config": { "icon": "Star", "background\_type": "gradient" },

      "metadata\_schema": {

        "required\_fields": \["technical\_score", "culture\_fit"\],

        "display\_on\_canvas": \["average\_score"\]

      }

    }

  \],

  "initialization": {

    "master\_canvas": {

      "domains": \[

        { "type": "shortlist", "x": 100, "y": 100, "w": 400, "h": 600 }

      \],

      "ghost\_nodes": \[

        { "x": 150, "y": 150, "label": "Drop CVs Here", "on\_drop": "auto\_parse" }

      \]

    }

  },

  "automations": \[

    {

      "on": "entry",

      "target\_domain": "shortlist",

      "action": "notify\_hiring\_manager"

    }

  \]

}

## **7\. Implementation Roadmap**

1. **Phase 1: The Schema:** Define the full JSON structure supporting all above features.  
2. **Phase 2: UI Pivot:** Implement the sidebar selector and the logic to swap toolbox/panel content.  
3. **Phase 3: Domain Engine:** Build the typed container system with visual/metadata support.  
4. **Phase 4: Automation Service:** Implement the background watcher for event-driven agent tasks.