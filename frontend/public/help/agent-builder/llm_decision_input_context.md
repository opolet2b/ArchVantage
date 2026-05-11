# Input Schema Builder

The Input Schema defines the data that will be available to the LLM as context. 

1. **Source Node**: Select the node from which you want to pull data.
2. **Source Field**: Select the specific field from that node.
3. **JSON Key Name**: Define the name of the key that will represent this data in the JSON object sent to the LLM.

The resulting JSON will be used for variable resolution in your instructions (using `{{key}}` syntax) and can optionally be sent as the full user message.
