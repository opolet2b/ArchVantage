import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

try:
    from llama_index.embeddings.openai import OpenAIEmbedding
    print("OpenAIEmbedding imported successfully.")
    
    import inspect
    sig = inspect.signature(OpenAIEmbedding.__init__)
    print(f"Signature: {sig}")
    
    # Check if there are class attributes or fields regarding validation
    print(f"Fields: {OpenAIEmbedding.model_fields.keys() if hasattr(OpenAIEmbedding, 'model_fields') else 'No model_fields'}")
    
    # Try to instantiate with the problematic model and see if we can pass a flag
    try:
        print("Attempting instantiation with validation bypassed (guessing implicit)...")
        # In some versions, just passing it might fail, checking if there is a way to disable it.
        # It's likely a Pydantic validation.
        inst = OpenAIEmbedding(model="baai/bge-m3", api_key="sk-test")
        print("Instantiation SUCCESS")
    except Exception as e:
        print(f"Instantiation FAIL: {e}")

except Exception as e:
    print(f"General Error: {e}")
