# Speech-To-Text Configuration

Configure how the application transcribes your voice into text.

### Provider Types

*   **Browser Native**: Uses your browser's built-in recognition. It's free and fast (Chrome/Edge recommended).
*   **Remote API**: Connects to external services like OpenAI Whisper or OpenRouter.
*   **Local**: Connects to a local Whisper instance running on your machine (e.g., via Docker).

---

### Using Your Own Docker Image

If you have a Whisper Docker container running, you can connect it easily:

#### 1. Get your URL
Identify the URL where your container is listening. Common examples:
*   `http://localhost:9000/asr`
*   `http://localhost:8000/v1`

#### 2. Configure in Settings
*   **Provider Type**: Local
*   **API Protocol**: 
    *   Use **OpenAI Compatible** if your image supports the standard OpenAI API (most modern images like `faster-whisper-server`).
    *   Use **Raw / Legacy** if your image uses a custom endpoint (like the older `onerahmet` or `ahmet` images).
*   **API URL**: Paste your full URL here.

> [!TIP]
> **Connection Issues?** If `localhost` doesn't work, try using `127.0.0.1`. If your backend is running inside Docker, you must use `host.docker.internal` to reach a container running on your host machine.
