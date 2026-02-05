# Launch Instructions

Follow these steps to start the application.

## 1. Start the Backend Server

1. Open a terminal (Command Prompt or PowerShell).
2. Navigate to the `backend` directory:
   ```powershell
   cd backend
   ```
3. Activate the virtual environment:
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```
4. Run the server:
   ```powershell
   uvicorn main:app --reload
   ```
   *You should see output indicating the server is running at `http://127.0.0.1:8000`.*

## 2. Start the Frontend Application

1. Open a **new** terminal window.
2. Navigate to the `frontend` directory:
   ```powershell
   cd frontend
   ```
3. Run the application:
   ```powershell
   npm run dev
   ```
   *You should see output indicating the app is ready at `http://localhost:3000`.*

## 3. Access the App

1. Open your web browser.
2. Go to: [http://localhost:3000](http://localhost:3000)

## 4. Configuration (Optional)

### Custom Backend API URL

The frontend is configured to connect to the backend at `http://127.0.0.1:8000/api/v1` by default.

To use a different backend URL (e.g., for production deployment):

1. Create a `.env.local` file in the `frontend` directory
2. Add the following line (replace with your backend URL):
   ```
   NEXT_PUBLIC_API_URL=http://your-backend-url.com/api/v1
   ```
3. Restart the frontend server (`Ctrl+C` then `npm run dev`)


## 5. Running with Docker (Alternative)

For a simplified setup using Docker:

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

> [!TIP]
> See [DOCKER_GUIDE.md](./DOCKER_GUIDE.md) for important performance warnings and Ollama configuration steps.
