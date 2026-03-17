# Volume 6: Agents and Automation

## 1. What are Agents?
Agents are autonomous processes that can perform complex, multi-step tasks. In SemanticCanvas, agents are defined by **Blueprints**.

## 2. Agent Blueprints
A Blueprint is a JSON execution graph that maps out the "brain" of an agent.
- **Nodes**: Primitives (actions the agent can take).
- **Edges**: Transitions based on logic or results.
- **Variables**: State that is passed between steps.

## 3. Primitives (Building Blocks)
- **Ask AI**: Direct LLM call for generation or reasoning.
- **Logic If/Else**: Branching based on variables.
- **Pipeline**: Runs a sub-sequence of steps.
- **Extractor**: Pulls entities or data from text.
- **Visualizer**: Generates charts, diagrams, or spatial layouts.

## 4. Spatial Automations (Drop Zones)
You can trigger agents simply by moving data around the canvas.
- **Defining a Zone**: Designate a Domain as an "Automation Zone."
- **Matching Hooks**: Assign an event (e.g., "ON_DROP") and a filter (e.g., "Type: PDF") to the zone.
- **Action**: Link an Agent Blueprint to the hook.
- **Result**: When you drop a PDF into the zone, the agent starts, processes the file, and spawns the result (e.g., a formal report) next to it.

## 5. Monitoring Execution
- **Step Logging**: Open the execution panel to see every step the agent takes in real-time.
- **Error Handling**: If a step fails, you can inspect the state and manually restart or skip steps.
