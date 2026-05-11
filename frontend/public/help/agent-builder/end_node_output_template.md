# Output Template

Define the final structure of the data returned by this agent.

- Use a JSON object where keys are the names of the output fields.
- Use `{{variable}}` syntax to map agent variables to these output fields.
- If left empty, the agent will return all variables defined during its execution.
