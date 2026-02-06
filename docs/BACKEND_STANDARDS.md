# Backend Development Guidelines

## Agent Primitives

### LLM Configuration
**CRITICAL:** Do NOT hardcode LLM model names (e.g., "gpt-4o-mini", "gpt-3.5-turbo").

All primitives that require LLM access MUST use the centralized configuration method provided by `BasePrimitive`.

**Correct Usage:**
```python
# In your primitive's execute method:
model_name = self.get_llm_config(state, params)
```

**Why:**
This ensures the primitive respects:
1. Node-specific overrides (`params['model']`)
2. Global automation overrides (`state['variables']['model']`)
3. The Canvas-specific configuration (`Canvas.owner_config`)
4. System defaults (fallback)

**Incorrect Usage:**
```python
# NEVER DO THIS:
model_name = params.get("model", "gpt-4o-mini") 
```
