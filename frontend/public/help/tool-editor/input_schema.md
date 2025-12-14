# Input Schema

Defines the parameters that must be passed to this tool.

It follows the **JSON Schema** standard.

### Structure
```json
{
  "type": "object",
  "properties": {
    "param_name": {
      "type": "string",
      "description": "Description of the parameter"
    }
  },
  "required": ["param_name"]
}
```

You can edit this manually or use the **"Generate Schema"** button to create it from your System Prompt.
