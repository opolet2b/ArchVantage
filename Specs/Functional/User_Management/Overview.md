# User Management - Functional Specification

**Status**: Draft
**Last Updated**: 2025-12-14

## 1. Overview
The User Management system controls access to the platform through a Role-Based Access Control (RBAC) model, supporting both local users and Active Directory (AD) group mappings.

## 2. Key Features
- **Authentication**: Secure login with email/password.
- **RBAC**: Fine-grained permission control via Roles (e.g., Admin, User).
- **AD Integration**: Map Active Directory Groups to local Roles for automated privilege assignment.

## 3. User Stories
- **As an** Admin
- **I want to** map the "Finance-Team" AD group to the "Tool-Editor" role
- **So that** new finance employees automatically get the right access.

## 4. Default Roles
- **Admin**: Full system access.
- **User**: Basic access (chat only).
