# Volume 7: Ontology & Semantic Graph

## 1. Beyond Keywords: The Semantic Graph
While RAG finds information, the Semantic Graph (Ontology) understands *relationships*. SemanticCanvas uses ArcadeDB to maintain a graph of how "Things" are connected.

## 2. Taxonomies & Classes
An Ontology defines the "What":
- **Classes**: Major entity types (e.g., "Project," "Client," "Risk," "Milestone").
- **Properties**: Attributes of a class (e.g., a "Project" has a "Deadline").
- **Icons & Colors**: Visual styles associated with each class on the canvas.

## 3. Predicates & Relationships
An Ontology defines the "How":
- **Relationships**: Logical links between classes (e.g., "Client" -> *OWNS* -> "Project").
- **Constraints**: Rules for links (e.g., a "Risk" can only be *LINKED_TO* a "Project").

## 4. AI-Driven Ontology Extraction
You don't have to build your ontology manually.
1.  **Select Sources**: Provide a folder or URL as reference.
2.  **Taxonomy Extraction**: The AI scans the text to suggest relevant classes and categories.
3.  **Relationship Mapping**: The AI identifies how these classes typically relate in your domain.
4.  **Import**: Bring the suggested structure into your graph.

## 5. Using the Graph
- **Graph Traversal**: Discover hidden connections between distant nodes.
- **Advanced Retrieval**: Ask questions like "Find all Risks associated with Projects owned by Client X."
