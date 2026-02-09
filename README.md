# chatbotn
Chatbot Investigations

## Running with Docker

1.  **Prepare Seed Data**:
    ```bash
    python scripts/prepare_docker_pack.py
    ```
2.  **Build and Run**:
    ```bash
    docker compose up --build
    ```
3.  **Access**:
    - Frontend: http://localhost:3000
    - Backend API: http://localhost:8000/api/v1
    - API Docs: http://localhost:8000/docs

For detailed information on **Ollama integration and performance optimization**, see [DOCKER_GUIDE.md](./docs/DOCKER_GUIDE.md).
