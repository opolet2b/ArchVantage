import time
import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from app.services.rag_service import rag_service
import threading

class RAGEventHandler(FileSystemEventHandler):
    def on_created(self, event):
        if not event.is_directory:
            print(f"New file detected: {event.src_path}")
            rag_service.ingest_folder(os.path.dirname(event.src_path))

    def on_modified(self, event):
        if not event.is_directory:
            print(f"File modified: {event.src_path}")
            rag_service.ingest_folder(os.path.dirname(event.src_path))

class WatcherService:
    def __init__(self, folder_path: str = "./data"):
        self.folder_path = folder_path
        if not os.path.exists(self.folder_path):
            os.makedirs(self.folder_path)
        
        self.event_handler = RAGEventHandler()
        self.observer = Observer()
        self.observer.schedule(self.event_handler, self.folder_path, recursive=True)
        self.thread = threading.Thread(target=self._run_observer, daemon=True)

    def _run_observer(self):
        self.observer.start()
        try:
            while True:
                time.sleep(1)
        except Exception as e:
            self.observer.stop()
            print(f"Observer stopped: {e}")
        self.observer.join()

    def start(self):
        print(f"Starting RAG Watcher on {self.folder_path}")
        self.thread.start()

# Singleton instance
watcher_service = WatcherService()
