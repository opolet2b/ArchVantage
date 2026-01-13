"""
JSON Mapping Primitive

Transforms and extracts data from JSON using JMESPath expressions.
"""
from typing import Any, Dict
import jmespath
import ast
import json
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


class JSONMappingPrimitive(BasePrimitive):
    """
    Primitive for transforming and extracting JSON data.
    
    Uses JMESPath for powerful query expressions.
    """
    
    @property
    def name(self) -> str:
        return "JSON_MAPPING"
    
    @property
    def description(self) -> str:
        return "Transforms and extracts data from JSON using JMESPath."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": "Variable name containing the source JSON"
                },
                "template": {
                    "type": "string",
                    "description": "JMESPath expression for extraction"
                },
                "output_variable": {
                    "type": "string",
                    "description": "Variable name to store the result",
                    "default": "mapped_data"
                }
            },
            "required": ["source", "template"]
        }
    
    
    def safe_eval(self, expression: str, variables: Dict[str, Any]) -> Any:
        """
        Safely evaluate a python-like expression for data transformation.
        
        supports:
        - Variable access (dot notation): node.field
        - String ops: + (concat), slices
        - Math ops: +, -, *, /
        - Functions: str(), int(), float(), len(), list(), dict()
        - New: date(), datetime(), time(), round(), format()
        - Methods: .title(), .capitalize()
        """

        from datetime import datetime, date, time
        
        # DEBUG LOGGING (Temporary)
        print(f"[DEBUG] safe_eval expression: {expression}")
        # print(f"[DEBUG] safe_eval variables keys: {list(variables.keys())}")
        if 'list_columns' in variables:
            print(f"[DEBUG] list_columns type: {type(variables['list_columns'])}")
            print(f"[DEBUG] list_columns sample: {str(variables['list_columns'])[:100]}")
        else:
            print(f"[DEBUG] list_columns NOT FOUND in {list(variables.keys())}")

        try:
             tree = ast.parse(expression, mode='eval')
        except Exception as e:
             print(f"[DEBUG] Parse Error: {e}")
             return None

        # Whitelist of safe functions
        SAFE_FUNCTIONS = {
            "str": str,
            "int": int,
            "float": float,
            "len": len,
            "bool": bool,
            "list": list,
            "dict": dict,
            "sum": sum,
            "max": max,
            "min": min,
            "abs": abs,
            "date": date,
            "datetime": datetime,
            "time": time,
            "round": round,
            "format": format,
            "search": jmespath.search, 
            "parse": json.loads,
            "from_json": json.loads, # Alias
            "to_json": json.dumps,
            "str": str, # Ensure explicit string conversion
        }

        # Whitelist of allowed methods on objects
        ALLOWED_METHODS = {
            "title", "capitalize", "upper", "lower", "strip", "split", "replace", 
            "join",  # String join
            "keys", "values", "items", "get", # Dict methods
            "append", "extend", "pop", "insert", "remove", # List methods (though mutation might not persist in eval context, helpful for constructing result)
        }

        class SafeEvaluator(ast.NodeVisitor):
            def __init__(self, vars_context):
                self.vars = vars_context

            def visit(self, node):
                method = 'visit_' + node.__class__.__name__
                visitor = getattr(self, method, self.generic_visit)
                return visitor(node)

            def generic_visit(self, node):
                raise ValueError(f"Unsupported syntax: {type(node).__name__}")

            def visit_Expression(self, node):
                return self.visit(node.body)

            def visit_Constant(self, node):
                return node.value

            def visit_Name(self, node):
                # Try exact match first
                val = None
                if node.id in self.vars:
                    val = self.vars[node.id]
                else:
                    # Try fuzzy match for Node IDs (handle suffixes like node_id-suffix)
                    prefix_dash = node.id + "-"
                    prefix_underscore = node.id + "_"
                    matches = [k for k in self.vars.keys() if k.startswith(prefix_dash) or k.startswith(prefix_underscore)]
                    if matches:
                        val = self.vars[matches[0]]
                
                if val is not None:
                     # AUTO-UNWRAP 'result' wrapper from AgentRuntime
                     if isinstance(val, dict):
                         # 1. unwrapping {"result": ...} - loop to handle nesting
                         while isinstance(val, dict) and "result" in val:
                             val = val["result"]
                         
                         # 2. Parsing MCP Content ({"content": [{"text": "..."}]})
                         if isinstance(val, dict) and "content" in val and isinstance(val["content"], list):
                             try:
                                 # Checking for text content
                                 items = val["content"]
                                 if len(items) > 0 and isinstance(items[0], dict):
                                     text_data = items[0].get("text")
                                     if isinstance(text_data, str):
                                         trimmed = text_data.strip()
                                         # print(f"[DEBUG visit_Name] Found text content: {trimmed[:30]}...")
                                         if trimmed.startswith("[") or trimmed.startswith("{"):
                                             import json
                                             parsed = json.loads(text_data)
                                             # print(f"[DEBUG visit_Name] Parsed JSON! Type: {type(parsed)}")
                                             # Ensure we return the main data
                                             val = parsed
                             except Exception as e:
                                 # print(f"[DEBUG visit_Name] Parsing Failed: {e}")
                                 pass
                                 
                     return val
                
                if node.id in SAFE_FUNCTIONS:
                    return SAFE_FUNCTIONS[node.id]
                    
                raise ValueError(f"Unknown variable or function: {node.id}")

            def visit_Attribute(self, node):
                # Handle dot notation: node.field
                val = self.visit(node.value)
                
                # If we are part of a Call, we might be looking up a method
                # But visit_Attribute is called by visit -> dispatch. 
                # If we return the bound method here, visit_Call checks it.
                
                if isinstance(val, dict):
                    if node.attr in val:
                        return val[node.attr]
                    return None 
                
                # Check if it's a safe method on the object
                if hasattr(val, node.attr):
                    attr = getattr(val, node.attr)
                    return attr
                    
                return None

            def visit_Slice(self, node):
                # Handle slice syntax explicitly [start:stop:step]
                lower = self.visit(node.lower) if node.lower else None
                upper = self.visit(node.upper) if node.upper else None
                step = self.visit(node.step) if node.step else None
                return slice(lower, upper, step)

            def visit_Subscript(self, node):
                val = self.visit(node.value)
                # Should visit slice directly. In <3.9 it might be ExtSlice/Index/Slice. 
                # In 3.9+ it's just the slice node or Constant.
                idx = self.visit(node.slice)
                
                try:
                    return val[idx]
                except (KeyError, IndexError, TypeError):
                    return None

            def visit_BinOp(self, node):
                left = self.visit(node.left)
                right = self.visit(node.right)
                
                # Safe operations
                if isinstance(node.op, ast.Add):
                    if isinstance(left, str) and isinstance(right, str):
                        return left + right
                    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
                        return left + right
                    if isinstance(left, list) and isinstance(right, list):
                        return left + right
                    return str(left) + str(right)
                
                if isinstance(node.op, ast.Sub): return left - right
                if isinstance(node.op, ast.Mult): return left * right
                if isinstance(node.op, ast.Div): return left / right
                
                raise ValueError(f"Unsupported operator: {type(node.op).__name__}")

            def visit_Compare(self, node):
                left = self.visit(node.left)
                for op, comparator in zip(node.ops, node.comparators):
                    right = self.visit(comparator)
                    if isinstance(op, ast.Eq):
                        if not left == right: return False
                    elif isinstance(op, ast.NotEq):
                        if not left != right: return False
                    elif isinstance(op, ast.Lt):
                        if not left < right: return False
                    elif isinstance(op, ast.LtE):
                        if not left <= right: return False
                    elif isinstance(op, ast.Gt):
                        if not left > right: return False
                    elif isinstance(op, ast.GtE):
                        if not left >= right: return False
                    else:
                        raise ValueError(f"Unsupported comparison: {type(op).__name__}")
                    left = right
                return True

            def visit_Call(self, node):
                # Handle method calls specifically
                if isinstance(node.func, ast.Attribute):
                    # It's a method call like obj.method()
                    obj = self.visit(node.func.value)
                    method_name = node.func.attr
                    
                    if method_name not in ALLOWED_METHODS:
                         # Unless it's a SAFE_FUNCTION disguised as attribute? Unlikely.
                         raise ValueError(f"Method call not allowed: {method_name}")
                    
                    method = getattr(obj, method_name, None)
                    if not method:
                        raise ValueError(f"Method not found: {method_name}")
                        
                    args = [self.visit(arg) for arg in node.args]
                    return method(*args)

                # Regular function call
                func = self.visit(node.func)
                if func not in SAFE_FUNCTIONS.values():
                     func_name = func.__name__ if hasattr(func, '__name__') else str(func)
                     # Check if it looks like a dict/list/obj that user tried to call
                     if isinstance(func, (dict, list, str, int, float, bool)):
                         raise ValueError(f"Object of type '{type(func).__name__}' is not callable. Did you use '()' instead of '[]' or '.' to access a field? (Value: {str(func)[:100]}...)")
                     raise ValueError(f"Function call not allowed: {func_name}")
                
                args = [self.visit(arg) for arg in node.args]
                return func(*args)
            
            def visit_List(self, node):
                return [self.visit(elt) for elt in node.elts]

            def visit_Dict(self, node):
                return {self.visit(k): self.visit(v) for k, v in zip(node.keys, node.values)}
            
            def visit_JoinedStr(self, node):
                return "".join(str(self.visit(v)) for v in node.values)
            
            def visit_FormattedValue(self, node):
                return self.visit(node.value)

        try:
            tree = ast.parse(expression, mode='eval')
            evaluator = SafeEvaluator(variables)
            result = evaluator.visit(tree)
            if isinstance(result, slice):
                return "Error: Expression evaluated to a raw slice object (e.g. [:50]). Slices must be used inside brackets (e.g. data[:50])."
            return result
        except Exception as e:
            return f"Error: {str(e)}"

    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """Extract/transform JSON data using expressions."""
        try:
            mappings = params.get("mappings", [])
            output_var = params.get("output_variable", "mapped_data")
            
            # Context construction: Merge everything for global access
            variables = state.get("variables", {}).copy()
            current_output = state.get("current_output", {})
            
            # Flatten context slightly for convenience? 
            # Or just expose everything as is.
            # We add current_output as 'input' or 'prev' for convenience
            variables['input'] = current_output
            variables['prev'] = current_output
            
            # Create underscore aliases for all variables to handle Python syntax limitations
            # e.g. "my-var" (subtraction) -> "my_var" (valid variable)
            # This allows users to reference "node-id" as "node_id" in expressions
            aliases = {}
            for k, v in variables.items():
                if "-" in k:
                    aliases[k.replace("-", "_")] = v
            variables.update(aliases)
            # Creating aliases with dot notation is handled by AST visitor (dict access)
            
            final_output = {}
            debug_info = {}
            
            if not mappings:
                # Legacy / fallback mode
                # ... (omitted for brevity, prioritizing new feature)
                return PrimitiveResult(success=True, output={})

            for mapping in mappings:
                target_key = mapping.get("target")
                
                # Check for 'expression' (new) or 'source' (old)
                expression = mapping.get("expression") or mapping.get("source")
                
                if target_key and expression:
                    # Evaluate
                    result = self.safe_eval(expression, variables)
                    final_output[target_key] = result
                    debug_info[target_key] = str(result)
            
            # Also store the whole result in the requested output variable
            # We spread final_output to the root so that downstream tools can find variables directly
            final_output_wrapped = {
                **final_output, 
                output_var: final_output,
                "result": final_output,
                "_debug": debug_info
            }
            
            return PrimitiveResult(
                success=True,
                output=final_output_wrapped
            )
            
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=f"Mapping failed: {str(e)}"
            )

