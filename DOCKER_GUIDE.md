# Docker & Ollama Guide

This guide provides important information for users running the application via Docker, especially regarding performance and integration with Ollama.

## ⚠️ Important: CPU-Only Build

The provided Docker image is optimized for **CPU-only** operation. 
- **No GPU Support**: The container does not include NVIDIA drivers or CUDA support.
- **Why?**: This ensures the image is portable and works on any machine (including those without a dedicated GPU).
- **Impact**: Heavy machine learning tasks (like local embeddings or running LLMs *inside* the container) will be significantly slower than on a GPU-enabled system.

---

## 🦙 Using LLMs with Docker

Ollama is **not required** to run the application. It is only necessary if you want to run LLMs locally.

### 1. Cloud Gateways (Recommended)
You can completely skip local LLM setup by using cloud providers like **OpenRouter**, **OpenAI**, or **Anthropic**. These can be configured in the application settings once the container is running and are the preferred way to ensure high performance without local hardware constraints.

### 2. Local LLMs via Ollama
If you choose to use local models, the application expects to connect to an **Ollama instance running on your host machine**, not inside the Docker container.

### 1. Connecting to Host Ollama (Recommended)
Running Ollama on your host machine allows it to use your hardware's full potential (GPU acceleration).

- **Windows/Mac**: Connect to `http://host.docker.internal:11434`.
- **Linux**: Connect to `http://172.17.0.1:11434` (default Docker bridge IP).

> [!IMPORTANT]
> Ensure Ollama is configured to allow cross-origin requests. Set the environment variable `OLLAMA_ORIGINS="*"` on your host machine before starting Ollama.

### 2. Running Ollama inside Docker
If you prefer to run Ollama as another container, you can add it to the `docker-compose.yml`. However, note that without complex NVIDIA Docker configurations, it will also run in **CPU mode**, which is extremely slow for LLM inference.

---

## 🚀 Performance Best Practices

To ensure a smooth experience while running under CPU-only Docker:

1.  **Use Cloud Models for Heavy Tasks**: If possible, use OpenAI, Anthropic, or OpenRouter for large document summarization or complex research tasks. This offloads the computation from your local CPU.
2.  **Run Ollama on the Host**: Always prefer running Ollama directly on your Windows/Host OS if you have a GPU. The application in Docker will connect to it as a remote service.
3.  **Batch Processing**: Avoid running "Analyze All" or large batch operations on many nodes simultaneously if you are using local CPU-based models. Queue them incrementally.
4.  **Small Embedding Models**: If using LlamaIndex for RAG (Retrieval Augmented Generation), the application will use CPU for local embeddings. Stick to smaller models (like `BGE-Small`) to keep responsiveness high.

---

## 🚫 What to Avoid

- **Do NOT run large LLMs inside the container**: Running models like `llama3:70b` on a CPU inside a Docker container will be agonizingly slow (often < 1 token per second).
- **Avoid concurrent heavy builds**: Building the frontend and running heavy Python analysis at the same time may cause the container to hang or restart due to CPU/Memory exhaustion.

---

*For instructions on how to build and maintain the Docker image, see [DOCKER_DEVELOPER_GUIDE.md](./DOCKER_DEVELOPER_GUIDE.md).*
