# **Technical Specifications: Smart Analysis Framework**

## **1\. System Architecture Overview**

The framework acts as a high-level orchestration layer within the Canvas environment. It processes document selections through a template-driven pipeline using a standardized JSON contract.

### **1.1 High-Level Stack**

* **Frontend:** React 18+ with **React Flow** for the pipeline editor (Studio) and Tailwind CSS for the execution UI.  
* **Orchestrator:** Backend logic (Node.js/Python) responsible for parsing the Template JSON and managing the execution lifecycle.  
* **LLM Integration:** Agnostic. Interfaces with existing multi-provider implementation (Cloud/Local).  
* **Persistence:** **RDBMS** for storing templates, personas, and framework rules.

## **2\. Generic Data Schema (The "Contract")**

Le schéma doit être agnostique au domaine métier. Voici la structure normalisée qui sera produite par le Studio et consommée par l'Engine.

### **2.1 The Smart Template Object**

{  
  "template\_id": "uuid",  
  "metadata": {  
    "name": "string",  
    "version": "string",  
    "category": "Strategic | Compliance | Technical | Legal",  
    "description": "string"  
  },  
  "execution\_constraints": {  
    "input\_mode": "single | multi",  
    "min\_assets": "number",  
    "max\_assets": "number"  
  },  
  "user\_parameters": \[  
    {  
      "id": "string",  
      "label": "string",  
      "type": "text | number | date | time | list\_single | list\_multi",  
      "description": "string (mandatory for AI grounding)",  
      "options": \["string"\],  
      "required": "boolean"  
    }  
  \],  
  "pipeline": \[  
    {  
      "step": 1,  
      "module": "data\_extractor",  
      "params": {  
        "target\_sections": \["string"\],  
        "target\_entities": \["string"\],  
        "objectives": "string"  
      }  
    },  
    {  
      "step": 2,  
      "module": "ai\_agent",  
      "params": {  
        "persona\_id": "string",  
        "framework\_id": "string",  
        "logic\_depth": "fast | chain\_of\_thought | deep\_audit",  
        "thesaurus\_id": "string (optional)"  
      }  
    },  
    {  
      "step": 3,  
      "module": "output\_formatter",  
      "params": {  
        "synthesis\_category": "Text | Tables | Pictures | Diagrams | Combination",  
        "rendering\_type": "string (from Master Reference)",  
        "file\_formats": \["md", "csv", "svg"\]  
      }  
    }  
  \]  
}

## **3\. The Analysis Lifecycle**

### **3.1 Step 1: Pre-processing (Context Optimization)**

L'Engine utilise la couche de vectorisation existante de l'application pour extraire uniquement les target\_sections définies. Cela réduit le bruit et optimise la fenêtre de contexte du LLM.

### **3.2 Step 2: Individual Analysis (Map Phase)**

Pour chaque document sélectionné, l'Engine génère des **Evidence Objects**.

{  
  "id": "uuid",  
  "snippet": "raw\_text\_source",  
  "asset\_id": "canvas\_id",  
  "page": "number",  
  "confidence": "float"  
}

### **3.3 Step 3: Synthesis (Reduce Phase)**

L'Engine agrège tous les Evidence Objects et les injecte dans le ai\_agent avec les user\_parameters saisis par l'utilisateur final. L'IA produit alors la synthèse finale en respectant le framework\_id et la persona\_id.

## **4\. UI/UX & Visual Rendering**

* **Studio:** Utilise React Flow pour manipuler le tableau pipeline comme un graphe de noeuds.  
* **Mermaid & SVG:** Les modules output\_formatter génèrent du code (Mermaid) ou des chemins de données (Tables) rendus dynamiquement par le Frontend.  
* **Traceability:** Chaque affirmation dans le rapport final doit porter l'ID d'un Evidence Object pour permettre le "Source Highlighting".

## **5\. Execution Guardrails**

* **Concurrency Mode:** Configurable par template ou globalement (Séquentiel pour LLM locaux, Parallèle pour Cloud).  
* **Temperature:** Fixée à 0.0 pour l'extraction et 0.1 pour la synthèse afin de garantir la reproductibilité.  
* **Validation:** Étape de post-traitement optionnelle pour valider la conformité terminologique avec le thesaurus\_id.

*End of Technical Specifications*