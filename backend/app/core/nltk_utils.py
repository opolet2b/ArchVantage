import nltk
from nltk.corpus import stopwords

def ensure_nltk_resources():
    """
    Pre-load NLTK resources to prevent LazyCorpusLoader errors in threads.
    This must be called as early as possible (before LlamaIndex/Unstructured are used).
    """
    try:
        print("[NLTK Utils] Pre-loading NLTK resources...", flush=True)
        
        # Check and download stopwords
        try:
            nltk.data.find('corpora/stopwords')
        except LookupError:
            print("[NLTK Utils] Downloading stopwords...", flush=True)
            nltk.download('stopwords')
        
        # Check and download punkt (and punkt_tab for newer NLTK)
        try:
            nltk.data.find('tokenizers/punkt')
        except LookupError:
            print("[NLTK Utils] Downloading punkt...", flush=True)
            nltk.download('punkt')
            try:
                nltk.download('punkt_tab')
            except Exception:
                pass # punkt_tab might not be available in older NLTK
            
        # FORCE LOAD stopwords to resolve LazyCorpusLoader
        # This is the critical fix for "AttributeError: 'WordListCorpusReader' object has no attribute '_LazyCorpusLoader__args'"
        _ = stopwords.words('english')
        print("[NLTK Utils] NLTK resources loaded successfully.", flush=True)
        
    except Exception as e:
        print(f"[NLTK Utils] WARNING: NLTK initialization failed: {e}", flush=True)

# Run automatically on import? Or explicit call?
# Explicit call is better for control, but import side-effect is guaranteed to run early.
# Let's do it on import to ensure it happens before other imports in main.py
ensure_nltk_resources()
