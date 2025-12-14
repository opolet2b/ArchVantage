# data Transformation Template

Use this to transform the JSON output from the previous step.

Supports **JMESPath** syntax or simple JavaScript objects.

Example:
```json
{
  "userName": "user.name",
  "orderId": "orders[0].id"
}
```
