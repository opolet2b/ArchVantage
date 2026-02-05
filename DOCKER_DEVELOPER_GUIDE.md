# Docker Developer Guide

This guide is for developers who want to build and maintain the Docker image for this application.

## 🛠️ Build Preparation

Before building the Docker image, you **must**
- `backend/db`: Main SQLite database.
- `backend/data`: Config files and legacy uploads.
- `backend/data_storage`: **Crucial** - Physical asset storage (PDFs, PPTXs, etc.).
- `backend/chroma_db`: **Crucial** - RAG Vector Database.

The script `scripts/prepare_docker_pack.py` now copies all four of these into a `docker_pack/` folder that the `Dockerfile` expects.

### 1. Prepare Seed Data
Run the following command from the project root:
```bash
python scripts/prepare_docker_pack.py
```

### 2. Build the Image
Once the seed data is prepared, build the container:
```bash
docker compose build
```

---

## 🏗️ Dockerfile Principles

- **CPU Optimization**: The `Dockerfile` is intentionally configured to install CPU-only versions of PyTorch and other machine learning libraries. This reduces the image size by ~2GB and ensures compatibility across all hardware.
- **Layer Caching**: The build process is structured so that Python and Node.js dependencies are installed *before* copying source code. This means subsequent builds are very fast if `requirements.txt` or `package.json` haven't changed.
- **Standalone Frontend**: The frontend is built in Next.js standalone mode to keep the production image lightweight.

## 📦 Maintenance

- **New Dependencies**: If you add new Python packages, update `backend/requirements.txt` and rebuild.
- **Large Assets**: If you add new large assets (images, guides), ensure the `prepare_docker_pack.py` script is updated to include them if they aren't already covered.
