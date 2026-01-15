"""
Dry-Run Service for Pipeline Verification

This module provides interactive step-by-step pipeline verification
with schema discovery and intelligent variable mapping.

Session State: In-memory only (ephemeral)
User Confirmation: Required for mappings and destructive operations
"""
import uuid
import re
import traceback
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum


class DryRunStatus(str, Enum):
    """Status of a dry-run session"""
    PENDING_INPUT = "pending_input"  # Waiting for user to provide test input
    PENDING_CONFIRM = "pending_confirm"  # Waiting for safety confirmation
    EXECUTING = "executing"  # Step is being executed
    PENDING_MAPPING = "pending_mapping"  # Waiting for user to confirm mapping
    COMPLETED = "completed"  # All steps verified
    FAILED = "failed"  # Verification failed
    EXPIRED = "expired"  # Session timed out


@dataclass
class StepResult:
    """Result from executing a single step"""
    step_id: str
    success: bool
    output: Any
    captured_schema: Dict[str, Any]
    error: Optional[str] = None


@dataclass
class MappingSuggestion:
    """Suggested mapping from output to next step's input"""
    source_path: str  # e.g., "step1.result.user_id"
    target_param: str  # e.g., "user_id"
    confidence: float  # 0.0 - 1.0
    match_reason: str  # Why this mapping was suggested
    target_type: Optional[str] = None # The expected type for the target parameter


@dataclass
class SafetyWarning:
    """Warning for potentially destructive operations"""
    step_id: str
    function_name: str
    warning_type: str  # "destructive" | "external" | "unknown"
    message: str


@dataclass
class DryRunSession:
    """
    Manages the state of an interactive dry-run session.
    
    Stores in-memory only - no database persistence.
    """
    session_id: str
    tool_id: int
    pipeline: List[Dict[str, Any]]
    model_name: Optional[str] = None
    current_step_index: int = 0
    status: DryRunStatus = DryRunStatus.PENDING_INPUT
    context: Dict[str, Any] = field(default_factory=dict)
    captured_schemas: Dict[str, Dict] = field(default_factory=dict)
    refined_mappings: Dict[str, Dict] = field(default_factory=dict)
    type_transformations: Dict[str, str] = field(default_factory=dict)  # "step_id.param" -> type
    input_types: Dict[str, str] = field(default_factory=dict)  # input_name -> type
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    
    # Timeout settings
    SESSION_TIMEOUT_MINUTES: int = 30
    
    @property
    def is_expired(self) -> bool:
        """Check if session has expired"""
        return datetime.utcnow() > self.last_activity + timedelta(
            minutes=self.SESSION_TIMEOUT_MINUTES
        )
    
    @property
    def current_step(self) -> Optional[Dict[str, Any]]:
        """Get the current step being verified"""
        if 0 <= self.current_step_index < len(self.pipeline):
            return self.pipeline[self.current_step_index]
        return None
    
    @property
    def is_complete(self) -> bool:
        """Check if all steps have been verified"""
        return self.current_step_index >= len(self.pipeline)
    
    def touch(self):
        """Update last activity timestamp"""
        self.last_activity = datetime.utcnow()


class DryRunSessionManager:
    """
    Manages in-memory dry-run sessions.
    
    Sessions are ephemeral and expire after inactivity.
    """
    
    def __init__(self):
        self._sessions: Dict[str, DryRunSession] = {}
    
    def create_session(
        self,
        tool_id: int,
        pipeline: List[Dict[str, Any]],
        model_name: Optional[str] = None
    ) -> DryRunSession:
        """Create a new dry-run session"""
        session_id = str(uuid.uuid4())
        session = DryRunSession(
            session_id=session_id,
            tool_id=tool_id,
            pipeline=pipeline,
            model_name=model_name,
            context={"input": {}}
        )
        self._sessions[session_id] = session
        self._cleanup_expired()
        return session
    
    def get_session(self, session_id: str) -> Optional[DryRunSession]:
        """Get a session by ID, returns None if expired or not found"""
        session = self._sessions.get(session_id)
        if session is None:
            return None
        if session.is_expired:
            session.status = DryRunStatus.EXPIRED
            return session
        session.touch()
        return session
    
    def delete_session(self, session_id: str):
        """Delete a session"""
        self._sessions.pop(session_id, None)
    
    def _cleanup_expired(self):
        """Remove expired sessions"""
        expired = [
            sid for sid, session in self._sessions.items()
            if session.is_expired
        ]
        for sid in expired:
            del self._sessions[sid]


# Global session manager instance
session_manager = DryRunSessionManager()


class SchemaDiscoveryService:
    """
    Service for discovering schemas from actual runtime data
    and creating intelligent mappings.
    """
    
    # Patterns that suggest destructive operations
    DESTRUCTIVE_PATTERNS = [
        r'\bdelete\b', r'\bremove\b', r'\bdestroy\b',
        r'\bupdate\b', r'\bmodify\b', r'\bedit\b',
        r'\bcreate\b', r'\binsert\b', r'\badd\b',
        r'\bpost\b', r'\bput\b', r'\bpatch\b',
        r'\bsend\b', r'\bsubmit\b', r'\bexecute\b'
    ]
    
    @staticmethod
    def infer_schema_from_data(data: Any) -> Dict[str, Any]:
        """
        Generate a JSON Schema from actual runtime data.
        
        Args:
            data: The actual data returned from an MCP function
            
        Returns:
            JSON Schema describing the data structure
        """
        if data is None:
            return {"type": "null"}
        
        if isinstance(data, bool):
            return {"type": "boolean"}
        
        if isinstance(data, int):
            return {"type": "integer"}
        
        if isinstance(data, float):
            return {"type": "number"}
        
        if isinstance(data, str):
            return {"type": "string"}
        
        if isinstance(data, list):
            if len(data) == 0:
                return {"type": "array", "items": {}}
            # Infer from first item
            return {
                "type": "array",
                "items": SchemaDiscoveryService.infer_schema_from_data(data[0])
            }
        
        if isinstance(data, dict):
            properties = {}
            required = []
            for key, value in data.items():
                properties[key] = SchemaDiscoveryService.infer_schema_from_data(
                    value
                )
                # Assume non-null values indicate required fields
                if value is not None:
                    required.append(key)
            
            return {
                "type": "object",
                "properties": properties,
                "required": required
            }
        
        return {"type": "string"}  # Fallback
    
    @staticmethod
    def extract_field_paths(
        data: Any,
        prefix: str = ""
    ) -> List[Tuple[str, Any, str]]:
        """
        Extract all field paths from data with their values and types.
        
        Returns:
            List of (path, value, type_name) tuples
        """
        paths = []
        
        if isinstance(data, dict):
            for key, value in data.items():
                path = f"{prefix}.{key}" if prefix else key
                type_name = type(value).__name__
                paths.append((path, value, type_name))
                
                # Recurse into nested structures
                if isinstance(value, dict):
                    paths.extend(
                        SchemaDiscoveryService.extract_field_paths(value, path)
                    )
                elif isinstance(value, list) and value:
                    # Sample first item of array
                    # We create a path like field[0] regardless of content type
                    # to expose primitives inside lists (e.g. ["Paris"] -> "Paris")
                    paths.extend(
                        SchemaDiscoveryService.extract_field_paths(
                            value[0], f"{path}[0]"
                        )
                    )
        elif isinstance(data, list) and data:
             # Handle root-level list
             paths.extend(
                SchemaDiscoveryService.extract_field_paths(
                    data[0], f"{prefix}[0]" if prefix else "[0]"
                )
             )
        
        return paths
    
    @staticmethod
    def suggest_mappings(
        source_output: Dict[str, Any],
        target_params: Dict[str, Any],
        step_id: str
    ) -> List[MappingSuggestion]:
        """
        Intelligently suggest mappings from source output to target parameters.
        
        Uses multiple strategies:
        1. Exact name match
        2. Partial name match (contains)
        3. Type-compatible fields
        4. Common naming patterns (id, name, email, etc.)
        
        Args:
            source_output: The actual output from the previous step
            target_params: The input schema properties of the next step
            step_id: The step ID for path construction
            
        Returns:
            List of mapping suggestions with confidence scores
        """
        suggestions = []
        
        # Extract all source paths
        source_paths = SchemaDiscoveryService.extract_field_paths(source_output)
        
        for target_param, param_schema in target_params.items():
            target_type = param_schema.get("type", "string")
            target_lower = target_param.lower()
            
            best_match = None
            best_confidence = 0.0
            
            for source_path, source_value, source_type in source_paths:
                path_parts = source_path.split(".")
                field_name = path_parts[-1].lower()
                
                confidence = 0.0
                reason = ""
                
                # Strategy 1: Exact name match (highest confidence)
                if field_name == target_lower:
                    confidence = 0.95
                    reason = "Exact name match"
                
                # Strategy 2: Partial match
                elif target_lower in field_name or field_name in target_lower:
                    confidence = 0.7
                    reason = "Partial name match"
                
                # Strategy 3: Common patterns
                elif SchemaDiscoveryService._match_common_patterns(
                    field_name, target_lower
                ):
                    confidence = 0.6
                    reason = "Common naming pattern"
                
                # Strategy 4: Type compatibility as fallback
                elif SchemaDiscoveryService._types_compatible(
                    source_type, target_type
                ):
                    confidence = 0.3
                    reason = "Type compatible"
                
                # Update best match
                if confidence > best_confidence:
                    best_confidence = confidence
                    
                    # Format path: avoid double dot if source_path starts with [
                    final_source_path = f"{step_id}.result.{source_path}"
                    if source_path.startswith("["):
                        final_source_path = f"{step_id}.result{source_path}"
                        
                    best_match = MappingSuggestion(
                        source_path=final_source_path,
                        target_param=target_param,
                        confidence=confidence,
                        match_reason=reason
                    )
            
            if best_match:
                suggestions.append(best_match)
            else:
                 # Add an empty suggestion to ensure the field appears in the UI
                 suggestions.append(MappingSuggestion(
                        source_path="",
                        target_param=target_param,
                        confidence=0.0,
                        match_reason="Manual mapping available"
                 ))
        
        return suggestions
    
    @staticmethod
    def _match_common_patterns(source: str, target: str) -> bool:
        """Check if fields match common naming patterns"""
        patterns = {
            "id": ["id", "identifier", "key", "pk"],
            "name": ["name", "title", "label"],
            "email": ["email", "mail", "e_mail"],
            "user": ["user", "customer", "client", "person"],
            "date": ["date", "time", "timestamp", "created", "updated"],
            "amount": ["amount", "value", "total", "sum", "price"],
        }
        
        for pattern_group in patterns.values():
            source_match = any(p in source for p in pattern_group)
            target_match = any(p in target for p in pattern_group)
            if source_match and target_match:
                return True
        
        return False
    
    @staticmethod
    def _types_compatible(source_type: str, target_type: str) -> bool:
        """Check if types are compatible for mapping"""
        compatible_groups = [
            {"int", "integer", "float", "number"},
            {"str", "string", "text"},
            {"bool", "boolean"},
        ]
        
        source_lower = source_type.lower()
        target_lower = target_type.lower()
        
        for group in compatible_groups:
            if source_lower in group and target_lower in group:
                return True
        
        return source_lower == target_lower
    
    @staticmethod
    def check_destructive_operation(
        function_name: str,
        function_description: str = ""
    ) -> Optional[SafetyWarning]:
        """
        Check if a function is potentially destructive.
        
        Args:
            function_name: The function name
            function_description: Optional function description
            
        Returns:
            SafetyWarning if destructive, None otherwise
        """
        text_to_check = f"{function_name} {function_description}".lower()
        
        for pattern in SchemaDiscoveryService.DESTRUCTIVE_PATTERNS:
            if re.search(pattern, text_to_check, re.IGNORECASE):
                return SafetyWarning(
                    step_id="",  # To be filled by caller
                    function_name=function_name,
                    warning_type="destructive",
                    message=f"This operation '{function_name}' may modify "
                            f"real data. Please confirm before proceeding."
                )
        
        return None


def transform_value(value: Any, target_type: str) -> Any:
    """
    Transform a value to the target type.
    
    Args:
        value: The source value to transform
        target_type: Target type ('string', 'number', 'integer', 'boolean', 'json', 'date')
        
    Returns:
        The transformed value
    """
    if target_type == "auto" or not target_type:
        return value
    
    if target_type == "string":
        return str(value) if value is not None else ""
    
    if target_type == "number":
        try:
            return float(value)
        except (ValueError, TypeError):
            return 0.0
    
    if target_type == "integer":
        try:
            return int(float(value))  # Handle "123.45" -> 123
        except (ValueError, TypeError):
            return 0
    
    if target_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ("true", "1", "yes", "on")
        return bool(value)
    
    if target_type == "json":
        if isinstance(value, str):
            try:
                import json
                return json.loads(value)
            except:
                return value
        return value
    
    if target_type == "date":
        # Return ISO format string for dates
        if isinstance(value, str):
            try:
                from datetime import datetime
                # Try parsing various formats
                for fmt in ["%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y", "%m/%d/%Y"]:
                    try:
                        dt = datetime.strptime(value, fmt)
                        return dt.isoformat()
                    except:
                        continue
            except:
                pass
        return value
    
    return value


class DryRunService:
    """
    Main service for managing dry-run verification workflow.
    """
    
    def __init__(self, db=None):
        self.db = db
        self.schema_service = SchemaDiscoveryService()
    
    async def start_session(
        self,
        tool_id: int,
        pipeline: List[Dict[str, Any]],
        model_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Start a new dry-run verification session.
        
        Args:
            tool_id: The tool being verified
            pipeline: The candidate pipeline to verify
            
        Returns:
            Session info with first step requirements
        """
        session = session_manager.create_session(tool_id, pipeline, model_name)
        
        # Analyze first step for required inputs
        required_inputs = self._get_required_inputs(session)
        
        # Suggest values for initial inputs based on tool description
        if required_inputs and self.db:
             try:
                from app.services.tool_runtime import ToolRuntime
                from app.services import tools as tool_service
                
                # Load tool for description
                runtime = ToolRuntime(self.db, tool_id)
                tool = runtime.load_tool()
                
                # Create target schema for suggestion
                target_schema = {}
                for req in required_inputs:
                    target_schema[req["name"]] = {
                        "type": req.get("type", "string"),
                        "description": req.get("description", "")
                    }
                
                # Context is the tool description/goal
                context = {
                    "Tool Goal": tool.description or "",
                    "Pipeline Goal": tool.description or "" # Redundant but explicit
                }
                
                print(f"[DEBUG DRYRUN] Suggesting initial values for start_session at {datetime.now()}", flush=True)
                
                suggestions = await tool_service.suggest_mappings(
                    description="Infer initial test values for pipeline Inputs based on the goal",
                    target_step_id="initial_input",
                    target_input_schema=target_schema,
                    available_context=context,
                    model_name=model_name
                )
                
                print(f"[DEBUG DRYRUN] Finished initial suggestion at {datetime.now()}", flush=True)

                # Apply suggestions to required_inputs default values
                for req in required_inputs:
                    if req["name"] in suggestions:
                         suggestion_obj = suggestions[req["name"]]
                         suggestion_val = suggestion_obj["value"] if isinstance(suggestion_obj, dict) else suggestion_obj
                         
                         req["default_value"] = suggestion_val
                         
             except Exception as e:
                 print(f"[DEBUG DRYRUN] Failed to suggest initial values: {e}")
        
        return {
            "session_id": session.session_id,
            "status": session.status.value,
            "current_step": 0,
            "total_steps": len(pipeline),
            "required_inputs": required_inputs,
            "current_step_info": self._get_step_info(session)
        }
    
    async def provide_input(
        self,
        session_id: str,
        input_data: Dict[str, Any],
        input_types: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Provide input data for the current step.
        
        Args:
            session_id: The session ID
            input_data: Input data to inject
            input_types: Type definitions for each input (string, number, integer, boolean, date, json)
            
        Returns:
            Safety check result or ready-to-execute status
        """
        session = session_manager.get_session(session_id)
        if not session:
            return {"error": "Session not found or expired"}
        
        if session.status == DryRunStatus.EXPIRED:
            return {"error": "Session has expired"}
        
        # Store input types if provided
        if input_types:
            session.input_types.update(input_types)
        
        print(f"[DEBUG DRYRUN] provide_input called for session {session_id}", flush=True)
        print(f"[DEBUG DRYRUN] Input Data: {input_data}", flush=True)
        print(f"[DEBUG DRYRUN] Input Types: {input_types}", flush=True)

        # Apply type transformations to input values before storing
        transformed_input = {}
        for name, value in input_data.items():
            input_type = input_types.get(name, "string") if input_types else "string"
            transformed_input[name] = transform_value(value, input_type)
        
        print(f"[DEBUG DRYRUN] Transformed Input: {transformed_input}", flush=True)
        
        # Store transformed input in context
        if "input" not in session.context:
            session.context["input"] = {}
        session.context["input"].update(transformed_input)
        
        print(f"[DEBUG DRYRUN] Updated Context Input: {session.context['input']}", flush=True)
        
        # Check if current step is destructive
        step = session.current_step
        if step:
            func_name = step.get("function_ref", "").split(".")[-1]
            warning = self.schema_service.check_destructive_operation(func_name)
            
            if warning:
                warning.step_id = step.get("step_id", "")
                session.status = DryRunStatus.PENDING_CONFIRM
                return {
                    "status": "pending_confirm",
                    "safety_warning": {
                        "step_id": warning.step_id,
                        "function_name": warning.function_name,
                        "warning_type": warning.warning_type,
                        "message": warning.message
                    }
                }
        
        session.status = DryRunStatus.EXECUTING
        return {"status": "ready_to_execute"}
    
    async def execute_step(
        self,
        session_id: str,
        confirmed: bool = False
    ) -> Dict[str, Any]:
        """
        Execute the current step and capture the schema.
        
        Args:
            session_id: The session ID
            confirmed: Whether user confirmed (for destructive ops)
            
        Returns:
            Step result with captured schema and mapping suggestions
        """
        from app.services.tool_runtime import PipelineExecutor
        
        session = session_manager.get_session(session_id)
        if not session:
            return {"error": "Session not found or expired"}
        
        if session.status == DryRunStatus.PENDING_CONFIRM and not confirmed:
            return {"error": "Confirmation required for destructive operation"}
        
        step = session.current_step
        if not step:
            return {"error": "No current step to execute"}
        
        session.status = DryRunStatus.EXECUTING
        step_id = step.get("step_id", f"step{session.current_step_index}")
        
        try:
            # Execute single step using PipelineExecutor
            executor = PipelineExecutor(self.db, session.tool_id)
            executor.load_tool()
            executor.context = session.context.copy()
            
            # Inject type transformations from session into tool configuration for this run
            if hasattr(session, "type_transformations") and session.type_transformations:
                print(f"[DEBUG] Injecting type transformations: {session.type_transformations}")
                # Ensure configuration exists and is a dict
                if not executor.tool.configuration:
                    executor.tool.configuration = {}
                elif hasattr(executor.tool.configuration, "copy"):
                     executor.tool.configuration = executor.tool.configuration.copy()
                
                executor.tool.configuration["type_transformations"] = session.type_transformations
            
            # Apply refined mappings if any
            step_to_exec = step.copy()
            # Try index-based lookup first (new robust way)
            mappings = session.refined_mappings.get(session.current_step_index)
            if not mappings:
                 # Fallback to ID-based (legacy)
                 mappings = session.refined_mappings.get(step_id)
            
            if mappings:
                print(f"[DEBUG] Applying refined mappings for step {session.current_step_index} ({step_id}): {mappings}")
                input_mappings = mappings
                new_args = step.get("arguments", {}).copy()
                for target, source in input_mappings.items():
                    # Wrap path in {{ }}
                    new_args[target] = f"{{{{ {source} }}}}"
                step_to_exec["arguments"] = new_args
            
            result = await executor.execute_step(step_to_exec)
            
            # Store result in context
            session.context[step_id] = {"result": result}
            
            # Capture schema from actual output
            captured_schema = self.schema_service.infer_schema_from_data(result)
            session.captured_schemas[step_id] = captured_schema
            
            # Suggest mappings for next step
            suggestions = []
            next_step_index = session.current_step_index + 1
            if next_step_index < len(session.pipeline):
                next_step = session.pipeline[next_step_index]
                next_args = next_step.get("arguments", {})
                
                # Find which args need mapping request
                # We want to expose ALL arguments for mapping consideration,
                # not just the ones that already have templates.
                target_params = {}

                # Try to get schema for next step function
                next_func_schema = None
                if self.db:
                    try:
                        from app.services.tool_runtime import ToolRuntime
                        # Note: pipeline steps might use different tools/servers if fully dynamic
                        # But typically they are bound to the tool's context. 
                        # PipelineExecutor handles this context.
                        # For now assume same tool context or simple function lookup.
                        runtime = ToolRuntime(self.db, session.tool_id)
                        runtime.load_tool()
                        next_func_ref = next_step.get("function_ref")
                        if next_func_ref:
                            next_func_schema = runtime.get_function_schema(next_func_ref)
                            print(f"[DEBUG DRYRUN] Schema for {next_func_ref}: {next_func_schema}", flush=True)
                            
                    except Exception as e:
                        print(f"[DEBUG] Failed to load next step schema: {e}")

                for arg_name, arg_value in next_args.items():
                    # Preserve existing logic but allow all fields
                    param_type = "any" # Default to 'any' to allow LLM to infer if schema is missing
                    param_desc = ""
                    
                    if next_func_schema and "properties" in next_func_schema:
                        prop = next_func_schema["properties"].get(arg_name)
                        if prop:
                            param_type = prop.get("type", "any")
                            param_desc = prop.get("description", "")
                    
                    target_params[arg_name] = {
                        "type": param_type,
                        "description": param_desc
                    }
                
                if target_params: 
                    # Use LLM for intelligent mapping suggestions
                    print(f"[DEBUG DRYRUN] Starting LLM suggestion at {datetime.now()}", flush=True)
                    context = {}
                    # Build context strings from available variables
                    for k, v in session.context.items():
                        # Flatten context variable to string representation
                        # Check result type
                        if isinstance(v, dict) and "result" in v:
                             context[k] = str(v["result"])
                        else:
                             context[k] = str(v)
                             
                    # Include current step result explicitly as it's the most likely source
                    context[step_id] = str(result)
                    
                    from app.services import tools as tool_service
                    
                    llm_mappings = await tool_service.suggest_mappings(
                        description=f"Map output of {step_id} to inputs of next step",
                        target_step_id=next_step.get("step_id", f"step{next_step_index}"),
                        target_input_schema=target_params,
                        available_context=context,
                        model_name=session.model_name
                    )
                    
                    print(f"[DEBUG DRYRUN] Finished LLM suggestion at {datetime.now()}", flush=True)

                    # Convert LLM dict result to MappingSuggestion objects
                    suggestions = []
                    for param, val_obj in llm_mappings.items():
                        # Extract details from rich object
                        source = val_obj["value"] if isinstance(val_obj, dict) else val_obj
                        reason = val_obj.get("reason", "AI Suggested") if isinstance(val_obj, dict) else "AI Suggested"
                        inferred_type = val_obj.get("type") if isinstance(val_obj, dict) else None
                        
                        if source:
                            # Lookup target type from schema (authoritative)
                            t_type = "any"
                            if param in target_params:
                                t_type = target_params[param].get("type", "any")
                            
                            # If schema is generic "string" or "any" but LLM logic inferred a specific type (e.g. integer),
                            # prefer the specific type. This handles cases where schema is missing, loose, or defaults to "any".
                            if (t_type == "string" or t_type == "any") and inferred_type and inferred_type.lower() not in ("string", "any"):
                                t_type = inferred_type
                            
                            suggestions.append(MappingSuggestion(
                                source_path=source.replace("{{ ", "").replace(" }}", ""), # Strip handlebars if present
                                target_param=param,
                                confidence=0.9, # High confidence for LLM guess
                                match_reason=reason,
                                target_type=t_type
                            ))
                     
                    # Validation: Ensure ALL target_params are represented in suggestions
                    # even if LLM missed them or failed. This ensures UI renders a row for them.
                    suggested_params = {s.target_param for s in suggestions}
                    for param, details in target_params.items():
                        if param not in suggested_params:
                            suggestions.append(MappingSuggestion(
                                source_path="", # Empty default
                                target_param=param,
                                confidence=0.0,
                                match_reason="Manual Input Required",
                                target_type=details.get("type", "string")
                            ))
            
            print(f"[DEBUG DRYRUN] Final Mapping Suggestions (with types): {suggestions}", flush=True)
            
            session.status = DryRunStatus.PENDING_MAPPING
            print(f"[DEBUG DRYRUN] Returning response at {datetime.now()}", flush=True)
            
            return {
                "success": True,
                "step_id": step_id,
                "output": result,
                "captured_schema": captured_schema,
                "mapping_suggestions": [
                    {
                        "source_path": s.source_path,
                        "target_param": s.target_param,
                        "confidence": s.confidence,
                        "reason": s.match_reason,
                        "target_type": s.target_type
                    }
                    for s in suggestions
                ],
                "has_next_step": next_step_index < len(session.pipeline)
            }
            
        except Exception as e:
            session.status = DryRunStatus.FAILED
            session.error = str(e)
            print(f"Dry Run Error: {str(e)}")
            traceback.print_exc()
            return {
                "success": False,
                "step_id": step_id,
                "error": str(e)
            }
    
    async def accept_mapping(
        self,
        session_id: str,
        mapping: Dict[str, str],
        type_transformations: Optional[Dict[str, str]] = None,
        output_mapping: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Accept (or modify) the mapping and move to next step.
        
        Args:
            session_id: The session ID
            mapping: The accepted/modified mapping {target_param: source_path}
            type_transformations: Optional type transformations for the mapping
            output_mapping: Optional mapping for the final pipeline output
            
        Returns:
            Next step info or completion status
        """
        session = session_manager.get_session(session_id)
        if not session:
            return {"error": "Session not found or expired"}
        
        # Store refined mapping and type transformations
        # Mappings accepted here are for the NEXT step's arguments
        next_step_index = session.current_step_index + 1
        if next_step_index < len(session.pipeline):
            next_step = session.pipeline[next_step_index]
            next_step_id = next_step.get("step_id", f"step{next_step_index}")
            
            # Use Index for robust storage (avoid ID mismatches)
            session.refined_mappings[next_step_index] = mapping
            
            if type_transformations:
                # Prefix transformations with step_id so PipelineExecutor can find them
                prefixed_transformations = {}
                for k, v in type_transformations.items():
                    prefixed_transformations[f"{next_step_id}.{k}"] = v
                
                # Merge into session store
                if hasattr(session, "type_transformations"):
                   session.type_transformations.update(prefixed_transformations)
                else:
                   session.type_transformations = prefixed_transformations
        
        # Move to next step
        session.current_step_index += 1
        
        if session.is_complete:
            session.status = DryRunStatus.COMPLETED
            
            # Calculate final pipeline output if output_mapping is provided
            final_output = {}
            if output_mapping:
                for target_field, source_path in output_mapping.items():
                    try:
                        # Resolve value from context
                        value = self._resolve_path(session.context, source_path)
                        
                        # Apply type transformation if specified
                        transform_key = f"output.{target_field}"
                        if type_transformations and transform_key in type_transformations:
                            target_type = type_transformations[transform_key]
                            value = transform_value(value, target_type)
                            
                        # Handle nested paths in target_field (e.g. "address.city")
                        self._set_nested_value(final_output, target_field, value)
                    except Exception as e:
                        # Log error but verify successfully
                        pass
            
            # Persist these changes to the tool configuration
            verified_pipeline = self._get_verified_pipeline(session)
            
            from app.services import tools as tool_service
            from app.schemas.tools import ToolUpdate
            
            # Get current configuration to preserve other fields
            current_tool = tool_service.get_tool(self.db, session.tool_id)
            if current_tool:
                new_config = current_tool.configuration.copy() if current_tool.configuration else {}
                new_config["pipeline"] = verified_pipeline
                
                if output_mapping:
                    new_config["output_mappings"] = output_mapping
                    
                # Also saving type transformations if any
                if session.type_transformations:
                    # Transformations are already stored in flattened format (step_id.param -> type)
                    new_config["type_transformations"] = session.type_transformations.copy()
                
                tool_service.update_tool(
                    self.db, 
                    session.tool_id, 
                    ToolUpdate(configuration=new_config)
                )

            return {
                "status": "completed",
                "verified_pipeline": verified_pipeline,
                "captured_schemas": session.captured_schemas,
                "final_output": final_output
            }
        
        # Prepare for next step
        session.status = DryRunStatus.PENDING_INPUT
        return {
            "status": "next_step",
            "current_step": session.current_step_index,
            "total_steps": len(session.pipeline),
            "required_inputs": self._get_required_inputs(session),
            "current_step_info": self._get_step_info(session)
        }
    
    def _resolve_path(self, context: Dict[str, Any], path: str) -> Any:
        """
        Resolve a path against the session context.
        Handles both dot notation and array indexing.
        Also handles implicit 'result' unwrapping for steps.
        Supports parsing JSON strings if path traverses into them.
        """
        if not path:
            return None
            
        print(f"[DEBUG] _resolve_path: resolving '{path}'")
        
        # Parse path into parts
        parts = []
        for part in path.split('.'):
            if '[' in part and part.endswith(']'):
                name = part[:part.index('[')]
                index = int(part[part.index('[')+1:-1])
                if name:
                    parts.append(name)
                parts.append(index)
            else:
                parts.append(part)
        
        print(f"[DEBUG]   Parsed parts: {parts}")
        
        current = context
        
        # Special handling for first part (step_id)
        if parts:
            first_part = parts[0]
            if isinstance(first_part, str) and first_part in context:
                # If it's a step_id, we might need to access .result
                step_data = context[first_part]
                if isinstance(step_data, dict) and "result" in step_data:
                    # Check if next part is NOT 'result'
                    if len(parts) > 1 and parts[1] != "result":
                        # Implicitly access result
                        current = step_data["result"]
                        parts = parts[1:]  # Continue with next parts
                        print(f"[DEBUG]   Accessing implicit result for '{first_part}'")
                    else:
                        current = step_data
                        parts = parts[1:]
                else:
                    current = step_data
                    parts = parts[1:]
            
        # Traverse remaining parts
        for part in parts:
            if current is None:
                print(f"[DEBUG]   Hit None at part '{part}'")
                return None
            
            # Handle JSON string parsing
            if isinstance(current, str) and (isinstance(part, int) or isinstance(part, str)):
                try:
                    import json
                    parsed = json.loads(current)
                    print(f"[DEBUG]   Parsed JSON string needed for part '{part}'")
                    current = parsed
                except:
                    print(f"[DEBUG]   Failed to parse JSON string for part '{part}'")
                    # Not a valid JSON string, fail
                    return None

            if isinstance(part, int):  # Array index
                if isinstance(current, list) and 0 <= part < len(current):
                    current = current[part]
                else:
                    print(f"[DEBUG]   Index {part} out of bounds or not list (type: {type(current)})")
                    return None
            else:  # Dict key
                if isinstance(current, dict) and part in current:
                    current = current[part]
                else:
                    print(f"[DEBUG]   Key '{part}' not found in keys: {list(current.keys()) if isinstance(current, dict) else type(current)}")
                    return None
                    
        return current

    def _set_nested_value(self, obj: Dict[str, Any], path: str, value: Any):
        """Set a value in a nested dictionary using dot notation."""
        parts = path.split('.')
        current = obj
        for i, part in enumerate(parts[:-1]):
            if part not in current:
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value
    
    def _get_required_inputs(self, session: DryRunSession) -> List[Dict]:
        """Get required inputs for current step that aren't in context"""
        step = session.current_step
        if not step:
            return []
        
        required = []
        arguments = step.get("arguments", {})
        
        # Try to get schema for accurate types/descriptions
        function_schema = None
        if self.db:
            try:
                from app.services.tool_runtime import ToolRuntime
                runtime = ToolRuntime(self.db, session.tool_id)
                runtime.load_tool()
                function_ref = step.get("function_ref")
                if function_ref:
                    # Handle MCP format "mcp::server::tool" -> "tool" or check exact match logic
                    # The runtime.get_function_schema expects the selected function name
                    # In pipeline, function_ref might be "search_city" or "mcp::server::tool"
                    # We should try to lookup by ref.
                    function_schema = runtime.get_function_schema(function_ref)
            except Exception as e:
                print(f"[DEBUG] Failed to load tool schema: {e}")
        
        for arg_name, arg_value in arguments.items():
            if isinstance(arg_value, str) and "{{ input." in arg_value:
                # Extract variable name from {{ input.xxx }}
                match = re.search(r'\{\{\s*input\.(\w+)\s*\}\}', arg_value)
                if match:
                    input_name = match.group(1)
                    if input_name not in session.context.get("input", {}):
                        req_info = {
                            "name": input_name,
                            "argument": arg_name,
                            "description": f"Please provide a test value for '{input_name}'"
                        }
                        
                        # Enrich with schema info if available
                        if function_schema and "properties" in function_schema:
                             prop_def = function_schema["properties"].get(arg_name)
                             if prop_def:
                                 req_info["description"] = prop_def.get("description", req_info["description"])
                                 req_info["type"] = prop_def.get("type", "string")
                                 
                        required.append(req_info)
        
        return required
    
    def _get_step_info(self, session: DryRunSession) -> Dict:
        """Get info about the current step"""
        step = session.current_step
        if not step:
            return {}
        
        return {
            "step_id": step.get("step_id", ""),
            "function_ref": step.get("function_ref", ""),
            "arguments": step.get("arguments", {})
        }
    
    def _get_verified_pipeline(self, session: DryRunSession) -> List[Dict]:
        """Get the pipeline with refined mappings applied"""
        verified = []
        
        for i, step in enumerate(session.pipeline):
            new_step = step.copy()
            step_id = step.get("step_id", f"step{i}")
            
            # Apply refined mappings if any
            # Try index-based lookup first
            mappings = session.refined_mappings.get(i)
            if not mappings:
                # Fallback to ID-based
                mappings = session.refined_mappings.get(step_id)
            
            if mappings:
                print(f"[DEBUG] Applying mappings for step {i} ({step_id}): {mappings}")
                new_args = step.get("arguments", {}).copy()
                for target_param, source_path in mappings.items():
                    new_args[target_param] = f"{{{{ {source_path} }}}}"
                new_step["arguments"] = new_args
            else:
                print(f"[DEBUG] No mappings found for step {i} ({step_id}). Available: {list(session.refined_mappings.keys())}")
            
            verified.append(new_step)
        
        return verified
