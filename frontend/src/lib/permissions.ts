export const PERMISSIONS = {
    CANVAS_READ: "canvas:read",
    CANVAS_WRITE: "canvas:write",
    CHAT_USE: "chat:use",
    ANALYSIS_WRITE: "analysis:write",
    AGENT_READ: "agent:read",
    AGENT_WRITE: "agent:write",
    TOOL_READ: "tool:read",
    TOOL_WRITE: "tool:write",
    SCENARIO_READ: "scenario:read",
    SCENARIO_WRITE: "scenario:write",
    TEMPLATE_READ: "template:read",
    TEMPLATE_WRITE: "template:write",
    KB_MANAGE: "kb:manage",
    SETTINGS_MANAGE: "settings:manage",
    USER_MANAGE: "user:manage",
    ROLE_MANAGE: "role:manage"
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const PERMISSION_LABELS: Record<string, string> = {
    "canvas:read": "Read Canvases",
    "canvas:write": "Create/Edit Canvases",
    "chat:use": "Use Chat",
    "analysis:write": "Create Smart Analysis",
    "agent:read": "Read Agents",
    "agent:write": "Create/Edit Agents",
    "tool:read": "Read Tools",
    "tool:write": "Create/Edit Tools",
    "scenario:read": "Read Scenarios",
    "scenario:write": "Create/Edit Scenarios",
    "template:read": "Read Templates",
    "template:write": "Create/Edit Templates",
    "kb:manage": "Manage Knowledge Base",
    "settings:manage": "Manage System Settings",
    "user:manage": "Manage Users",
    "role:manage": "Manage Roles"
};
