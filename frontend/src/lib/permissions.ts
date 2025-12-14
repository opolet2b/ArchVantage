export const PERMISSIONS = {
    MANAGE_USERS: "MANAGE_USERS",
    MANAGE_ROLES: "MANAGE_ROLES",
    MANAGE_AGENTS: "MANAGE_AGENTS",
    VIEW_ANALYTICS: "VIEW_ANALYTICS",
    CHAT: "CHAT"
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_LABELS: Record<Permission, string> = {
    MANAGE_USERS: "Manage Users",
    MANAGE_ROLES: "Manage Roles",
    MANAGE_AGENTS: "Manage Agents",
    VIEW_ANALYTICS: "View Analytics",
    CHAT: "Access Chat"
};
