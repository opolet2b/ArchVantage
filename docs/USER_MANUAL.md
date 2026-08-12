A# Semantic Workbench User Manual

Welcome to the **Semantic Workbench**, a powerful environment for intelligent investigation, knowledge management, and AI-assisted analysis. This manual will guide you through all features of the application.

---

## 1. Introduction

The Semantic Workbench combines two powerful modes of interaction:
*   **Chat Mode**: A traditional conversational interface for quick queries and linear interactions with AI agents.
*   **ArchVantage**: An infinite, spatial workspace where you can organize "Things" (notes, files, data), visualize relationships, and perform complex analysis using AI.

---

## 2. Getting Started

### Login & Authentication
Access the application via your web browser. You will be prompted to log in.
*   Enter your credentials to access your secure workspace.
*   Once logged in, you will land on the **Home Dashboard** (defaulting to Chat view).

### Application Interface Overview
The interface is divided into three main areas:
1.  **Sidebar (Left)**: Your primary navigation hub.
    *   **Files / History**: Shows recent Conversations or Canvases depending on your mode.
    *   **Mode Switcher**: Toggle between **Canvas** and **Chat** modes.
    *   **Tools Menu**: Access specific features like Workflows, Agents, Templates, and Settings.
2.  **Main Workspace (Center)**: Where you interact with your content (the Chat stream or the Canvas).
3.  **Toolbar (Top/Floating)**: Context-specific tools for your current task.

![Screenshot: Home Dashboard showing the Sidebar and Chat Interface]

---

## 3. Chat Mode

Use Chat Mode for standard interactions with AI models.

### Creating a New Conversation
*   Click the **"New Chat"** button in the sidebar.
*   Select your preferred **Model** from the dropdown at the top.
*   Type your message in the input box at the bottom.

### Managing History
Your past conversations are saved automatically.
*   **View History**: Click any item in the sidebar list to resume that chat.
*   **Search**: Use the search bar in the sidebar to find specific past discussions.

![Screenshot: Chat Interface with conversation history]

---

## 4. ArchVantage Mode

The ArchVantage is the core of the workbench, designed for non-linear thinking and complex data organization.

### Canvas Basics
*   **Create a Canvas**: Click the **"+"** icon next to "Canvases" in the sidebar.
*   **Navigation**:
    *   **Pan**: specific mouse action (e.g., Space + Drag or Middle Click).
    *   **Zoom**: Mouse wheel to zoom in/out.
    *   **Semantic Zoom**: As you zoom out, content simplifies (text fades, headers remain) to help you maintain an overview of large projects.

### The Toolbox & Interface
The Canvas features a **Floating Toolbar** (often referred to as the Toolbox) providing essential controls:
*   **Model Selection**: Choose the AI model that will power operations on this canvas.
*   **Vision Model**: Select a specialized model for image analysis.
*   **Tools**:
    *   **Hand Tool**: For panning around the canvas.
    *   **Pointer Tool**: For selecting objects.
    *   **3D Capture**: Captures a snapshot of your current view.

> **The Green Toolbox**: A specialized context menu that appears for specific advanced actions.
> **The Green Brain**: Your AI assistant on the canvas. Click the brain icon to trigger analysis or run agents on selected items.

![Screenshot: ArchVantage with the Toolbox highlighted]

### Working with Things (Nodes)
"Things" are the fundamental units of content on your canvas.

#### Adding Content
*   **Text Notes**: Double-click anywhere to create a note.
*   **Files**: Drag and drop images, PDFs, or text files directly onto the canvas.
*   **MCP Tools**: Drag available tools from the side panel to instantiate them as nodes.

#### Selection & Arrangement
*   **Select**: Click a node to select it. Hold `Shift` to select multiple.
*   **Drag Selection**: Click and drag on the background to create a selection box.
*   **Arrange**: Use the auto-arrange features in the toolbar to organize messy nodes into cleaner layouts.

#### Grouping & Domains
*   **Domains**: Create container zones called "Domains" to group related Things.
*   **Hierarchical Domains**: You can nest domains inside other domains to create deep hierarchies of information.

#### Transclusions
You can embed content from one node into another.
*   **Live Embeds**: Changes in the original "source" node are instantly reflected wherever it is transcluded.
*   **Usage**: Great for creating summary dashboards that pull live data from raw notes.

#### External Links
*   Add URL references to nodes.
*   These appear as clickable links that open in a new tab, allowing you to connect your canvas to the wider web.

![Screenshot: Canvas showing various Nodes, Domains, and Transclusions]

### Content Editing & Fragments

#### Rich Text Editor
Double-click a Text Thing to enter **Edit Mode**.
*   Use the formatting toolbar for **Bold**, *Italic*, Lists, Headers, etc.
*   Type `/` to open a command menu for quick inserts.

#### Fragments
You don't have to link to an entire node. You can link to specific **Fragments** of text.
1.  Highlight a specific sentence or paragraph within a node.
2.  Right-click relative to the selection.
3.  Choose **"Create Fragment Link"** (or similar context action).
*   This allows for extremely precise referencing and "concept linking" similar to advanced knowledge tools.

### Connectivity (Links)

#### Creating Links
*   Drag from the handle of one node to another to create a connection.

#### Link Properties
*   **Labels**: Click a link to add a text label describing the relationship (e.g., "supports", "contradicts", "author of").
*   **Types**: Assign semantic types to links for better categorization.
*   **Direction**: Links can be unidirectional (arrow) or bidirectional.

#### Link Discovery
The system can help you find connections.
*   Use the **"Find Related"** feature (via The Green Brain) to suggest links based on content similarity.

#### Visibility
*   **Global Toggle**: Hide/Show all links on the canvas to reduce clutter.
*   **Node Toggle**: Hide/Show links for specific selected nodes only.

---

## 5. Document Templates

Templates allow you to generate structured outputs from your canvas content.

### Using Templates
1.  Navigate to **Templates** in the sidebar.
2.  **Create New**: Define a structure using "Primitives".
    *   **Text Primitive**: Static text or instructions.
    *   **LLM Generation Primitive**: Dynamic sections written by AI.
3.  **Apply to Canvas**: Drag a template onto the canvas. It will create a "Document Node" that pulls context from connected nodes to fill out the template automatically.

![Screenshot: Document Template Editor]

---

## 6. Advanced Features & Analysis

### Agents on Canvas
AI Agents are not just for chat—they live on the canvas.
*   **Drag & Drop**: Drag an Agent from the catalog onto the canvas.
*   **Interaction**: Connect an Agent node to a Data node (text/file). The Agent will process that specific data.

### Smart Analysis
*   **Dynamic Analysis**: Use React-based analysis components that update in real-time.
*   **Visualizing Results**: Analysis output can be visualized as charts, summaries, or new sets of generated nodes.

### Research & Workflows
*   **Search**: Use the integrated search to find content across all your canvases and chats.
*   **Workflows**: clear, step-by-step processes that guide you through complex tasks (e.g., "Research a Topic" or "Draft a Report").

![Screenshot: Smart Analysis showing a chart or graph on the canvas]

---

## 7. Settings

Access the **Settings** page to configure your experience.
*   **Profile**: Update your user details.
*   **Theme**: Switch between Light/Dark mode or other application themes.
*   **API Keys**: Manage connections to external AI providers if using custom models.

![Screenshot: Settings Page]
