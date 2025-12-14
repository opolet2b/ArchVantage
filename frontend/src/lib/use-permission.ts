import { useAuth } from "./auth-context"
import { Permission } from "./permissions"

export function usePermission() {
    const { user } = useAuth()

    const hasPermission = (permission: Permission) => {
        if (!user) return false
        // Admin role has all permissions
        if (user.roles?.includes("Admin")) return true
        return user.permissions?.includes(permission) ?? false
    }

    return { hasPermission }
}
