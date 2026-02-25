# **ArcadeDB Schema Design: Knowledge Graph**

This document defines the classes, properties, and indexes required to support the Knowledge Graph module, the "Lazy Update" strategy, and the semantic quarantine system.

## **1\. Meta-Data Model (The Ontology)**

These classes define the ontology structure validated by the human user.

### **Ontology Class (Document)**

*Each named graph has an instance of this class to version its schema.*

* graph\_id: String (Indexed) \- Unique identifier for the named graph.  
* name: String \- User-defined name of the graph.  
* version: Integer \- Ontology version number.  
* status: String \- (DRAFT, ACTIVE, ARCHIVED).  
* created\_at: DateTime.

### **NodeType Class (Vertex)**

*Defines authorized types (e.g., Project, Expert).*

* id: String (Indexed) \- Unique ID for the type.  
* label: String \- Display name.  
* description: String.  
* icon: String \- Reference for Cytoscape.  
* color: String \- Hex color code for the UI.

### **EdgeType Class (Edge)**

*Defines authorized relations (e.g., works\_on, owns).*

* label: String \- Name of the relation (Predicate).  
* constraints: JSON \- List of authorized pairs (e.g., {"from": "Expert", "to": "Project"}).

## **2\. Instance Model (The Data)**

### **Entity Class (Vertex)**

*The base class for all graph nodes (Pointers).*

* uid: String (Unique Index) \- Unique identifier from the source (e.g., Jira ID, Confluence URL).  
* type: String \- Reference to the NodeType.  
* name: String \- Display label in Cytoscape.  
* source\_type: String \- (CONFLUENCE, SQL\_DB, MCP\_SERVICE).  
* source\_uri: String \- URI for JIT (Just-In-Time) Fetch.  
* graph\_id: String (Indexed).

**"Lazy Update" Properties:**

* last\_synced: DateTime \- Last refresh timestamp.  
* version\_hash: String \- Source content hash for change detection.  
* sync\_status: String \- (SYNCED, OUTDATED, UPDATING).

### **QuarantineEntity Class (Vertex)**

*Entities detected but not compliant with the current ontology.*

* raw\_content: JSON \- Extracted raw data.  
* suggested\_type: String \- Type suggested by the LLM.  
* discovery\_date: DateTime.  
* reason: String \- Reason for quarantine (e.g., "Unknown Relation").

## **3\. Relationship Model (The Edges)**

### **KNOWLEDGE\_LINK Class (Edge)**

*Generic relation typed by the ontology.*

* relation\_type: String (Indexed) \- The predicate (e.g., "is\_responsible\_for").  
* strength: Float \- Relation confidence score.  
* discovery\_method: String \- (MANUAL, AUTOMATIC, MCP\_INFERRED).

## **4\. Sample Queries (Gremlin/SQL)**

### **Lazy Update Check (Outdated Nodes)**

SELECT uid, name, source\_uri   
FROM Entity   
WHERE graph\_id \= 'my-graph'   
AND last\_synced \< DATE\_ADD(now(), \-24, 'hour')

### **Neighborhood Expansion (Radial Focus)**

g.V().has('uid', 'ID-123')  
 .bothE('KNOWLEDGE\_LINK')  
 .bothV()  
 .path()

## **5\. Deletion and Invalidation Management**

* **Source Deletion:** If the source via MCP signals a deletion, the Entity node is removed, and associated KNOWLEDGE\_LINK edges are automatically cleaned up by ArcadeDB (referential integrity).  
* **Ontology Refactoring:** In the event of an ontology type name change, an update query is executed: UPDATE Entity SET type \= 'NewName' WHERE type \= 'OldName'.