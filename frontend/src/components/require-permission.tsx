import { Permission } from "@/lib/permissions"
import { usePermission } from "@/lib/use-permission"

interface RequirePermissionProps {
    permission: Permission
    children: React.ReactNode
    fallback?: React.ReactNode
}

export function RequirePermission({ permission, children, fallback = null }: RequirePermissionProps) {
    const { hasPermission } = usePermission()

    if (!hasPermission(permission)) {
        return <>{fallback}</>
    }

    return <>{children}</>
}
