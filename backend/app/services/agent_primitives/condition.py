"""
Condition Primitive

Provides If/Else branching logic using safe expression evaluation.
"""
from typing import Any, Dict
import ast
import operator
from app.services.agent_primitives.base import BasePrimitive, PrimitiveResult


# Safe operators for expression evaluation
SAFE_OPERATORS = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.And: lambda a, b: a and b,
    ast.Or: lambda a, b: a or b,
    ast.Not: operator.not_,
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
}


class ConditionPrimitive(BasePrimitive):
    """
    Primitive for conditional branching (If/Else).
    
    Evaluates a safe expression and returns the appropriate target node.
    """
    
    @property
    def name(self) -> str:
        return "CONDITION"
    
    @property
    def description(self) -> str:
        return "Logic branching based on condition evaluation (If/Else)."
    
    @property
    def param_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "Condition expression to evaluate"
                },
                "true_target": {
                    "type": "string",
                    "description": "Node ID to go to if condition is true"
                },
                "false_target": {
                    "type": "string",
                    "description": "Node ID to go to if condition is false"
                }
            },
            "required": ["expression", "true_target", "false_target"]
        }
    
    def safe_eval(self, expression: str, variables: Dict[str, Any]) -> bool:
        """
        Safely evaluate a simple comparison expression.
        
        Supports comparisons like:
        - "status_code == 200"
        - "count > 10"
        - "name == 'John'"
        - "value in items"
        """
        try:
            # Parse the expression into an AST
            tree = ast.parse(expression, mode='eval')
            return self._eval_node(tree.body, variables)
        except Exception as e:
            raise ValueError(f"Invalid expression: {expression}. Error: {str(e)}")
    
    def _eval_node(self, node: ast.AST, variables: Dict[str, Any]) -> Any:
        """Recursively evaluate an AST node."""
        if isinstance(node, ast.Constant):
            return node.value
        
        elif isinstance(node, ast.Name):
            if node.id in variables:
                return variables[node.id]
            raise ValueError(f"Unknown variable: {node.id}")
        
        elif isinstance(node, ast.Compare):
            left = self._eval_node(node.left, variables)
            for op, comparator in zip(node.ops, node.comparators):
                right = self._eval_node(comparator, variables)
                op_func = SAFE_OPERATORS.get(type(op))
                if op_func is None:
                    raise ValueError(f"Unsupported operator: {type(op).__name__}")
                if not op_func(left, right):
                    return False
                left = right
            return True
        
        elif isinstance(node, ast.BoolOp):
            op_func = SAFE_OPERATORS.get(type(node.op))
            if op_func is None:
                raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
            result = self._eval_node(node.values[0], variables)
            for value in node.values[1:]:
                result = op_func(result, self._eval_node(value, variables))
            return result
        
        elif isinstance(node, ast.UnaryOp):
            operand = self._eval_node(node.operand, variables)
            op_func = SAFE_OPERATORS.get(type(node.op))
            if op_func is None:
                raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
            return op_func(operand)
        
        elif isinstance(node, ast.Attribute):
            value = self._eval_node(node.value, variables)
            return getattr(value, node.attr)
        
        elif isinstance(node, ast.Subscript):
            value = self._eval_node(node.value, variables)
            index = self._eval_node(node.slice, variables)
            return value[index]
        
        else:
            raise ValueError(f"Unsupported expression type: {type(node).__name__}")
    
    async def execute(
        self, 
        params: Dict[str, Any], 
        state: Dict[str, Any]
    ) -> PrimitiveResult:
        """Evaluate condition and return the appropriate next node."""
        try:
            expression = params.get("expression", "")
            true_target = params.get("true_target")
            false_target = params.get("false_target")
            
            # Get variables from state
            variables = state.get("variables", {})
            
            # Evaluate the condition
            result = self.safe_eval(expression, variables)
            
            return PrimitiveResult(
                success=True,
                output={"condition_result": result},
                next_node=true_target if result else false_target
            )
            
        except Exception as e:
            return PrimitiveResult(
                success=False,
                error=f"Condition evaluation failed: {str(e)}"
            )
