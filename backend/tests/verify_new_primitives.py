
import sys
import os
from unittest.mock import MagicMock

# Mock missing dependencies
sys.modules["jmespath"] = MagicMock()
sys.modules["llama_index"] = MagicMock()
sys.modules["llama_index.core"] = MagicMock()
sys.modules["llama_index.llms.openai"] = MagicMock()
sys.modules["llama_index.embeddings.openai"] = MagicMock()
sys.modules["langchain_core"] = MagicMock()
sys.modules["langchain_core.messages"] = MagicMock()
sys.modules["langchain_openai"] = MagicMock()
sys.modules["sqlalchemy"] = MagicMock()
sys.modules["sqlalchemy.orm"] = MagicMock()
sys.modules["sqlalchemy.ext.declarative"] = MagicMock()
sys.modules["pydantic"] = MagicMock()
sys.modules["app.core.database"] = MagicMock()
sys.modules["app.models.canvas_models"] = MagicMock()
sys.modules["app.models.agent_blueprint"] = MagicMock()
sys.modules["app.services.agent_runtime"] = MagicMock()
sys.modules["app.services.llm_service"] = MagicMock()

# Add backend to sys.path
sys.path.append(os.path.abspath("backend"))

# Ensure app.services.agent_primitives can be imported
# We might need to mock some base classes if they are heavily used
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult

def test_primitives_instantiation():
    print("Testing primitive registration...")
    from app.services.agent_primitives import PRIMITIVE_REGISTRY, get_primitive
    
    assert "CANVAS_QUERY_THINGS" in PRIMITIVE_REGISTRY
    assert "CANVAS_BATCH_LINK" in PRIMITIVE_REGISTRY
    
    query_primitive = get_primitive("CANVAS_QUERY_THINGS")
    batch_link_primitive = get_primitive("CANVAS_BATCH_LINK")
    
    print(f"Instantiated: {query_primitive.name}")
    print(f"Instantiated: {batch_link_primitive.name}")
    
    # Check schemas
    assert "domain_id" in query_primitive.param_schema["properties"]
    assert "target_ids" in batch_link_primitive.param_schema["properties"]
    
    print("SUCCESS: Primitives registered and instantiated correctly.")

if __name__ == "__main__":
    try:
        test_primitives_instantiation()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"FAILED: {e}")
        sys.exit(1)
