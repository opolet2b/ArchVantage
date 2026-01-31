
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    from app.services.agent_primitives.structured_template_primitive import StructuredTemplatePrimitive
    print("Successfully imported StructuredTemplatePrimitive")
except Exception as e:
    print(f"Failed to import StructuredTemplatePrimitive: {e}")

try:
    from app.models.template import Template
    print("Successfully imported Template model")
except Exception as e:
    print(f"Failed to import Template model: {e}")

try:
    from app.services.agent_primitives import get_primitive
    p = get_primitive("STRUCTURED_TEMPLATE")
    print(f"Successfully retrieved STRUCTURED_TEMPLATE primitive: {p}")
except Exception as e:
    print(f"Failed to retrieve STRUCTURED_TEMPLATE from registry: {e}")
