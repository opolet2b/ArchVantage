# **Functional Specifications: Knowledge Graph Module**

## **1\. Module Objectives**

Enable knowledge workers to navigate a heterogeneous information ecosystem. The graph does not serve as document storage but as a **semantic map** to identify relevant sources (Confluence, DB, APIs) before triggering a targeted data collection for analysis.

## **2\. Data Architecture (Tech Stack)**

* **Graph Database:** ArcadeDB (Multi-model).  
* **Visual Engine:** Cytoscape.js.  
* **Source Integration:** **MCP (Model Context Protocol)** for databases and third-party services.  
* **Backend/Frontend:** Python (FastAPI) / ReactJS.

## **3\. Golden Rule: Ontology-First**

**Creating a graph without a prior ontology is strictly prohibited.** The system supports two pathways for ontology establishment:

### **Pathway A: Systematic Creation Workflow (De Novo)**

1. **Phase 1 (Reference Corpus):** Manual selection of "benchmark" sources to build the ontology.  
2. **Phase 2 (Taxonomy):** Automatic extraction of types, followed by human validation.  
3. **Phase 3 (Predicates):** Definition of fundamental relations, followed by human validation.

### **Pathway B: External Ontology Import (Industry Standards)**

This pathway allows users to leverage existing official frameworks (e.g., Pharma, Legal, Finance).

1. **Import:** Upload of standard files (OWL, RDF/TTL, or structured JSON).  
2. **Pruning/Selection:** The user selects a subset of the industry ontology to avoid over-complexity.  
3. **Validation:** Structural check to ensure compatibility with ArcadeDB classes.

## **4\. Ontology Import & Management**

### **Supported Standards**

* **Formats:** OWL (Web Ontology Language), RDF/XML, Turtle (TTL), and custom JSON-LD.  
* **Pre-sets:** The system provides built-in templates for common sectors:  
  * **Pharma/Bio:** MeSH, SNOMED CT.  
  * **Legal:** ELI (European Legislation Identifier).  
  * **Finance:** FIBO (Financial Industry Business Ontology).

### **UI for External Import**

* **Upload Zone:** Drag-and-drop interface for ontology files.  
* **Ontology Browser:** A tree-view explorer allowing users to preview the hierarchy of classes and properties before final import.  
* **Conflict Resolution:** Interface to resolve duplicate labels or circular references detected during the parsing phase.

## **5\. External Connector Management (MCP & APIs)**

### **Connection UI**

* **"Source Hub" Interface:**  
  * **Confluence Grabbing:** OAuth/Token authentication and selection of "Spaces".  
  * **MCP Connectors:** Configuration interface for MCP servers.  
  * **Mapping UI:** For each source, the user must "map" source data types to the imported or created ontology types.

### **Intelligent Synchronization Mechanism**

The system synchronizes **index-nodes** using two modes:

#### **A. "Lazy Update" Strategy (On-Demand Update) \- *Implementation Priority***

* **Principle:** A node's freshness is only verified at the time of interaction.  
* **ArcadeDB Attributes:** Each node includes a last\_synced (timestamp) and version\_hash field.  
* **Triggers:** Navigation or Query identification of an outdated node.  
* **Action:** Targeted API call via MCP to refresh metadata and node links.

#### **B. Event-Driven Preparation (Webhooks & CDC) \- *Architecture Only***

* **Webhooks:** Provision of listening endpoints for page\_updated events.  
* **CDC:** Ingestion layer for database transaction logs.

## **6\. Discovery and Analysis Process (Discovery-First)**

The graph acts as an intent filter before heavy extraction.

1. **Exploration:** The user queries the graph or navigates visually.  
2. **Identification:** The graph identifies relevant nodes containing Source\_URIs.  
3. **Collection (JIT \- Just In Time):** Retrieval of full content occurs only after identification of relevance.

## **7\. Visual Navigation Interface (Cytoscape)**

### **Reconciliation Center UI (Quarantine)**

* **Sorting Dashboard:** Interface to process entities that do not fit the ontology (whether imported or created).  
* **Alignment Tool:** Tool to manually link "Quarantine" items to existing Industry Standard classes.

### **Cytoscape Navigation**

* **Freshness Indicator:** Visual "Clock" icon for Lazy Update status.  
* **Pointer Visualization:** Nodes display provenance (Confluence, SQL, etc.).  
* **Radial Focus & Expansion:** Loading level 2 relations triggers automatic Lazy Update.

## **8\. Named Graph Management**

* **Isolation:** Each named graph has its own namespace in ArcadeDB.  
* **Canvas Association:** A canvas can be linked to a specific version of an imported or generated ontology.