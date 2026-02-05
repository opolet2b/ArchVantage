#!/bin/bash

# Define directories
DATA_DIR="/app/backend/data"
DB_DIR="/app/backend/db"
SEED_DATA_DIR="/app/seed_data"

echo "Checking for initial data..."

# Check if data directory is empty or missing content
if [ -z "$(ls -A $DATA_DIR)" ]; then
    echo "Data directory is empty. Initializing from seed data..."
    cp -r $SEED_DATA_DIR/data/* $DATA_DIR/
else
    echo "Data directory already exists. Skipping initialization."
fi

# Check if db directory is empty
if [ -z "$(ls -A $DB_DIR)" ]; then
    echo "DB directory is empty. Initializing from seed data..."
    cp -r $SEED_DATA_DIR/db/* $DB_DIR/
else
    echo "DB directory already exists. Skipping initialization."
fi

# New: Asset Storage
ASSET_DIR="/app/backend/data_storage"
if [ -z "$(ls -A $ASSET_DIR)" ]; then
    echo "Asset storage is empty. Initializing..."
    cp -r $SEED_DATA_DIR/data_storage/* $ASSET_DIR/
fi

# New: Vector Store
CHROMA_DIR="/app/backend/chroma_db"
if [ -z "$(ls -A $CHROMA_DIR)" ]; then
    echo "ChromaDB is empty. Initializing..."
    cp -r $SEED_DATA_DIR/chroma_db/* $CHROMA_DIR/
fi

# Ensure permissions (just in case)
chmod -R 777 $DATA_DIR
chmod -R 777 $DB_DIR

echo "Starting Supervisord..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
