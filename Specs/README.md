# Project Specifications

This directory contains the functional and technical specifications for the ChatBotn project.

## 📂 Directory Structure

### [Functional Specifications](./Functional/)
Describes **WHAT** the system does from a user's perspective.
- **[Agent Builder](./Functional/Agent_Builder/Overview.md)**: Visual workflow editor for creating agents.
- **[Tool Builder](./Functional/Tool_Builder/Overview.md)**: Creation wizard for MCP tools and GUI forms.
- **[User Management](./Functional/User_Management/Overview.md)**: RBAC, User roles, and permissions.

### [Technical Specifications](./Technical/)
Describes **HOW** the requirements are implemented.
- **[Architecture Overview](./Technical/Architecture_Overview.md)**: High-level system design, stack, and folders.
- **[Agent Builder](./Technical/Agent_Builder/Implementation.md)**: Custom Graph Runtime and Blueprint execution.
- **[Tool Builder](./Technical/Tool_Builder/Implementation.md)**: Schema generation, Dry-Run engine, and MCP integration.
- **[User Management](./Technical/User_Management/Implementation.md)**: API Security, JWT Auth, and Permission handling.

### [Templates](./Templates/)
Standard templates for creating new specifications.
- [Functional Spec Template](./Templates/functional_template.md)
- [Technical Spec Template](./Templates/technical_template.md)

### [Archive](./Archive/)
Old or superceded documents and bug reports.

## 📝 Contribution Guide
1. **New Feature**: Start by creating a Functional Spec using the template.
2. **Implementation**: Create a corresponding Technical Spec detailing the architecture/code changes.
3. **Updates**: Keep these documents in sync with code changes.
