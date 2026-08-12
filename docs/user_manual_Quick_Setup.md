# 📘 ArchVantage User Manual

Welcome to **ArchVantage**, a powerful spatial orchestrator for AI agents and knowledge management. This guide will help you get started from scratch.

---

## 1. Installation & Prerequisites

The application runs as a Docker container but relies on two external services for local AI and graph database features.

### System Requirements
*   **RAM**: 16GB minimum (32GB recommended for large local models).
*   **Software**: Docker Desktop, Ollama.

### Setup Steps
1.  **Ollama (AI)**:
    *   Download from [ollama.com](https://ollama.com).
    *   Open terminal and run: `ollama pull llama3` (and optionally `ollama pull nomic-embed-text` for local embeddings).
2.  **ArcadeDB (Knowledge Graph)**:
    *   Run: `docker run -d --name arcadedb -p 2480:2480 -p 2424:2424 -e ARCADE_ROOT_PASSWORD=playwithdata arcadedata/arcadedb:latest`.
3.  **Launch App**:
    *   Place `docker-compose.yml` and your image file in a folder.
    *   Run: `docker-compose up -d`.
    *   Access via [http://localhost:3000](http://localhost:3000).

---

## 2. First-Time Model Configuration

The app needs to know which AI models to use. Follow these steps to configure your first provider:

### Step 1: Open Settings
Click the **Gear Icon (⚙️)** in the sidebar to open the Settings panel.

### Step 2: Create a Model Preset
You can mix local and remote models:
*   **Local (Ollama)**: 
    *   Select **Local (Ollama)**.
    *   The app will automatically list models you have pulled in Ollama.
    *   Select `qwen3.5:latest`, give it a name, and click **Save Configuration**.
*   **Remote (OpenRouter/OpenAI)**:
    *   Select **Remote API**.
    *   Enter the API URL (e.g., `https://openrouter.ai/api/v1`).
    *   Paste your **API Key**.
    *   Enter the **Model Name** (e.g., `anthropic/claude-3-sonnet`).
    *   Click **Save Configuration**.

### Step 3: Set Global Defaults
At the top of the Settings page, look for **Global Defaults**. 
*   Set your **Default LLM** to the preset you just created.
*   This ensures that chat and analysis use your preferred model by default.

---

## 3. Working with the Canvas

The Canvas is where you organize your thoughts and data spatially.

### Adding Content
*   **Nodes**: Use the top toolbar to drag and drop Text, Image, or Document nodes.
*   **Linking**: Hover over a node, click the connection handle, and drag to another node to create a semantic relationship.

### Semantic Zoom
*   Scroll your mouse wheel to "Zoom" into data.
*   **Out**: You see only the Labels.
*   **Mid**: You see AI-generated summaries.
*   **In**: You see the full content/editor.

---

## 4. Knowledge Management (RAG)

To make the AI "aware" of your documents:
1.  Upload PDFs or Docx files into the canvas.
2.  Go to the **Knowledge Base** tab (Brain icon).
3.  Click **Sync/Index**.
4.  Now, when you chat with the AI, you can enable "Knowledge Base" mode to get answers based on your private files.

---

## 5. Troubleshooting

*   **"Ollama not found"**: Ensure Ollama is running in your system tray. On Windows, check if `http://localhost:11434` is accessible in your browser.
*   **"ArcadeDB Connection Error"**: Ensure the ArcadeDB docker container is running.
*   **Slow Response**: Local models depend heavily on your GPU/CPU. If it's too slow, try smaller models like `phi3` or use a remote API.

---
*Manual Version 1.0*
