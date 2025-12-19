"""
Unified Agent Execution State Machine

Single source of truth for both dry-run and production execution.
Mode determines pause behavior, not execution logic.

This module implements a finite state machine pattern to manage agent
execution across different modes (production vs dry-run) while ensuring
consistent behavior and preventing code drift.

States:
    - IDLE: Initial state, waiting to start
    - EXECUTING: Currently running a step
    - PAUSED: Step complete, waiting for user to continue (dry-run only)
    - WAITING_FOR_INPUT: GUI form required from user (both modes)
    - COMPLETED: Workflow finished successfully
    - FAILED: Workflow encountered an error

Transitions:
    - start(): IDLE -> EXECUTING -> (PAUSED|WAITING_FOR_INPUT|COMPLETED|FAILED)
    - next(): PAUSED -> EXECUTING -> (PAUSED|WAITING_FOR_INPUT|COMPLETED|FAILED)
    - submit_input(): WAITING_FOR_INPUT -> EXECUTING -> (...)
"""
from enum import Enum
from typing import Any, Dict, Optional, Literal
from dataclasses import dataclass, field
from datetime import datetime

from app.services.agent_runtime import AgentRuntime


class ExecutionState(Enum):
    """Possible states of an agent execution."""
    IDLE = "idle"
    EXECUTING = "executing"
    PAUSED = "paused"  # Dry-run only: paused between steps
    WAITING_FOR_INPUT = "waiting_for_input"  # GUI form required
    COMPLETED = "completed"
    FAILED = "failed"


# Type alias for execution mode
ExecutionMode = Literal["production", "dry_run"]


@dataclass
class ExecutionContext:
    """
    Holds all execution state for a running agent.
    
    This is the data structure that persists between state transitions
    and contains everything needed to resume execution.
    """
    mode: ExecutionMode
    state: ExecutionState = ExecutionState.IDLE
    blueprint_id: str = ""
    execution_id: Optional[int] = None
    current_node_id: Optional[str] = None
    runtime_state: Dict[str, Any] = field(default_factory=dict)
    steps: list = field(default_factory=list)
    outputs: Dict[str, Any] = field(default_factory=dict)
    gui_schema: Optional[Dict] = None
    tool_name: Optional[str] = None
    description: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class InvalidStateTransition(Exception):
    """Raised when an invalid state transition is attempted."""
    pass


class ExecutionStateMachine:
    """
    Unified execution engine using state machine pattern.
    
    Same logic for both modes - only pause conditions differ:
    - production: runs until GUI input needed or workflow ends
    - dry_run: pauses after each step for user inspection
    
    Usage:
        sm = ExecutionStateMachine(blueprint, db, mode="production")
        context = await sm.start(inputs)
        
        if context.state == ExecutionState.WAITING_FOR_INPUT:
            # Show GUI form to user, collect data
            context = await sm.submit_input(form_data)
    """
    
    def __init__(self, blueprint, db, mode: ExecutionMode = "production"):
        """
        Initialize the state machine.
        
        Args:
            blueprint: The agent blueprint to execute
            db: Database session
            mode: "production" (run until GUI/END) or "dry_run" (pause each step)
        """
        self.blueprint = blueprint
        self.db = db
        self.runtime = AgentRuntime(blueprint, db)
        self.context = ExecutionContext(
            mode=mode,
            blueprint_id=str(blueprint.id) if hasattr(blueprint, 'id') else ""
        )
    
    async def start(self, inputs: Dict[str, Any]) -> ExecutionContext:
        """
        Start execution from IDLE state.
        
        Dry-run: Execute 1 step, then PAUSE
        Production: Execute until WAITING_INPUT or END
        
        Args:
            inputs: Initial input values for the workflow
            
        Returns:
            Updated ExecutionContext
            
        Raises:
            InvalidStateTransition: If not in IDLE state
        """
        print(f"[STATE_MACHINE] start() called, mode={self.context.mode}")
        
        if self.context.state != ExecutionState.IDLE:
            raise InvalidStateTransition(
                f"Cannot start from {self.context.state.value}"
            )
        
        self.context.state = ExecutionState.EXECUTING
        self.context.started_at = datetime.utcnow()
        self.context.runtime_state = {"inputs": inputs, "variables": dict(inputs)}
        
        result = await self._run_until_pause(inputs)
        print(f"[STATE_MACHINE] start() completed, final state: {result.state.value}")
        return result
    
    async def next(self) -> ExecutionContext:
        """
        Resume from PAUSED state (dry-run only).
        
        Executes the next step in the workflow.
        
        Returns:
            Updated ExecutionContext
            
        Raises:
            InvalidStateTransition: If not in PAUSED state
        """
        print(f"[STATE_MACHINE] next() called, current state: {self.context.state.value}")
        
        if self.context.state not in [ExecutionState.PAUSED, ExecutionState.WAITING_FOR_INPUT]:
            print(f"[STATE_MACHINE] Invalid state for next(): {self.context.state.value}")
            raise InvalidStateTransition(
                f"Cannot call next() from {self.context.state.value}. "
                f"Expected 'paused' or 'waiting_for_input'."
            )
        
        self.context.state = ExecutionState.EXECUTING
        return await self._run_until_pause(
            self.context.runtime_state.get("inputs", {})
        )
    
    async def submit_input(self, form_data: Dict[str, Any]) -> ExecutionContext:
        """
        Submit GUI form data and resume execution.
        
        Both modes: Accept input, then:
        - Dry-run: Execute 1 step, then PAUSE
        - Production: Execute until next WAITING_INPUT or END
        
        Args:
            form_data: Form values collected from user
            
        Returns:
            Updated ExecutionContext
            
        Raises:
            InvalidStateTransition: If not in WAITING_FOR_INPUT state
        """
        if self.context.state != ExecutionState.WAITING_FOR_INPUT:
            raise InvalidStateTransition(
                f"Cannot submit input from {self.context.state.value}"
            )
        
        # Inject form data into runtime state using existing method
        self.runtime.resume_with_input(self.context.runtime_state, form_data)
        
        # Clear GUI-related fields
        self.context.state = ExecutionState.EXECUTING
        self.context.gui_schema = None
        self.context.tool_name = None
        self.context.description = None
        
        return await self._run_until_pause(
            self.context.runtime_state.get("inputs", {})
        )
    
    async def _run_until_pause(self, inputs: Dict[str, Any]) -> ExecutionContext:
        """
        Core execution loop. Runs until a pause condition is met.
        
        Pause conditions:
        - GUI input required (both modes)
        - Step complete (dry-run only)
        - Workflow complete/failed (both modes)
        
        Args:
            inputs: Original input values
            
        Returns:
            Updated ExecutionContext
        """
        while self.context.state == ExecutionState.EXECUTING:
            # Determine if we're resuming from existing state
            initial_state = None
            if self.context.runtime_state.get("current_node"):
                initial_state = self.context.runtime_state
            
            # Execute one step using the existing AgentRuntime
            result = await self.runtime.execute(
                inputs,
                initial_state=initial_state,
                steps_limit=1
            )
            
            # Update context from result
            self.context.steps = result.get("steps", [])
            
            # Preserve full state for resumption
            self.context.runtime_state = (
                result.get("full_state") or 
                result.get("execution_state") or 
                {}
            )
            
            # Determine current node from result
            if result.get("waiting_node"):
                self.context.current_node_id = result["waiting_node"]
            elif self.context.steps:
                self.context.current_node_id = self.context.steps[-1].get("node_id")
            
            # Process result status
            status = result.get("status", "failed")
            print(f"[STATE_MACHINE] Runtime returned status: {status}, mode: {self.context.mode}")
            
            if status == "waiting_for_input":
                # GUI form is required
                self.context.state = ExecutionState.WAITING_FOR_INPUT
                self.context.gui_schema = result.get("gui_schema")
                self.context.tool_name = result.get("tool_name", "GUI Tool")
                self.context.description = result.get("description", "")
                break
            
            elif status == "completed":
                # Workflow finished successfully
                self.context.state = ExecutionState.COMPLETED
                self.context.outputs = result.get("outputs", {})
                self.context.completed_at = datetime.utcnow()
                break
            
            elif status == "failed":
                # Workflow encountered an error
                self.context.state = ExecutionState.FAILED
                self.context.error = result.get("error", "Unknown error")
                self.context.completed_at = datetime.utcnow()
                break
            
            elif status == "paused":
                # Step completed successfully, check mode for next action
                self.context.outputs = result.get("outputs", {})
                
                if self.context.mode == "dry_run":
                    # Dry-run: Pause after each step for user inspection
                    self.context.state = ExecutionState.PAUSED
                    break
                else:
                    # Production: Continue automatically to next step
                    continue
            
            else:
                # Unknown status - treat as failed
                self.context.state = ExecutionState.FAILED
                self.context.error = f"Unknown execution status: {status}"
                break
        
        return self.context
    
    def to_response(self) -> Dict[str, Any]:
        """
        Convert context to API response format.
        
        Returns:
            Dictionary suitable for JSON serialization in API responses
        """
        response = {
            "status": self.context.state.value,
            "execution_id": self.context.execution_id,
            "current_node": self.context.current_node_id,
            "waiting_node": (
                self.context.current_node_id 
                if self.context.state == ExecutionState.WAITING_FOR_INPUT 
                else None
            ),
            "steps": self.context.steps,
            "outputs": self.context.outputs,
            "execution_state": self.context.runtime_state,
            "error_message": self.context.error,
            "started_at": (
                self.context.started_at.isoformat() 
                if self.context.started_at else None
            ),
            "completed_at": (
                self.context.completed_at.isoformat() 
                if self.context.completed_at else None
            )
        }
        
        # Add GUI fields if waiting for input
        if self.context.state == ExecutionState.WAITING_FOR_INPUT:
            response["gui_schema"] = self.context.gui_schema
            response["tool_name"] = self.context.tool_name
            response["description"] = self.context.description
        
        return response


# =============================================================================
# In-Memory State Machine Storage
# =============================================================================

# Store active state machines for resumption
# Key: execution_id (int), Value: ExecutionStateMachine instance
_active_executions: Dict[int, ExecutionStateMachine] = {}


def get_state_machine(execution_id: int) -> ExecutionStateMachine:
    """
    Retrieve an active state machine by execution ID.
    
    Args:
        execution_id: The database ID of the execution record
        
    Returns:
        The ExecutionStateMachine instance
        
    Raises:
        KeyError: If no active execution exists with that ID
    """
    if execution_id not in _active_executions:
        raise KeyError(f"No active execution found with ID {execution_id}")
    return _active_executions[execution_id]


def store_state_machine(execution_id: int, sm: ExecutionStateMachine) -> None:
    """
    Store a state machine for later resumption.
    
    Args:
        execution_id: The database ID of the execution record
        sm: The ExecutionStateMachine instance to store
    """
    _active_executions[execution_id] = sm
    sm.context.execution_id = execution_id


def cleanup_state_machine(execution_id: int) -> None:
    """
    Remove a completed state machine from storage.
    
    Call this when execution completes or fails to free memory.
    
    Args:
        execution_id: The database ID of the execution record
    """
    _active_executions.pop(execution_id, None)


def get_active_execution_count() -> int:
    """
    Get the count of active executions (for monitoring/debugging).
    
    Returns:
        Number of state machines currently in memory
    """
    return len(_active_executions)
