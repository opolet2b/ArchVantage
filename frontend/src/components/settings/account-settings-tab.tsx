import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Save, Loader2, User, KeyRound } from "lucide-react"
import { API_URL } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"

export function AccountSettingsTab() {
    const { user } = useAuth()
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState({ type: "", text: "" })

    const handleUpdatePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            setMessage({ type: "error", text: "Please fill in all password fields." })
            return
        }
        
        if (newPassword !== confirmPassword) {
            setMessage({ type: "error", text: "New passwords do not match." })
            return
        }

        if (newPassword.length < 6) {
            setMessage({ type: "error", text: "New password must be at least 6 characters." })
            return
        }

        setSaving(true)
        setMessage({ type: "", text: "" })

        try {
            const token = localStorage.getItem("token")
            const headers: HeadersInit = {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {})
            }

            const res = await fetch(`${API_URL}/auth/password`, {
                method: "PUT",
                headers,
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword
                })
            })

            if (res.ok) {
                setMessage({ type: "success", text: "Password updated successfully!" })
                setCurrentPassword("")
                setNewPassword("")
                setConfirmPassword("")
            } else {
                const data = await res.json().catch(() => null)
                setMessage({ type: "error", text: data?.detail || "Failed to update password." })
            }
        } catch (error) {
            console.error("Failed to update password", error)
            setMessage({ type: "error", text: "An error occurred while updating the password." })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="w-full space-y-6">
            <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <User className="h-5 w-5 text-blue-500" />
                    Account Settings
                </h3>
                <p className="text-sm text-muted-foreground">Manage your personal profile and security settings.</p>
            </div>

            <div className="space-y-6">
                <div className="space-y-4 p-4 border rounded-lg bg-slate-50/30 dark:bg-slate-900/30">
                    <h4 className="font-medium flex items-center gap-2 border-b pb-2 mb-4">
                        Profile Information
                    </h4>
                    
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Email Address</label>
                        <Input value={user?.email || ""} disabled className="bg-muted/50" />
                        <p className="text-xs text-muted-foreground">Your email address is used for login and cannot be changed here.</p>
                    </div>
                </div>

                <div className="space-y-4 p-4 border rounded-lg bg-slate-50/30 dark:bg-slate-900/30">
                    <h4 className="font-medium flex items-center gap-2 border-b pb-2 mb-4">
                        <KeyRound className="h-4 w-4" />
                        Change Password
                    </h4>
                    
                    <div className="space-y-4 max-w-md">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Current Password</label>
                            <Input 
                                type="password" 
                                value={currentPassword} 
                                onChange={e => setCurrentPassword(e.target.value)} 
                                placeholder="Enter current password"
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-sm font-medium">New Password</label>
                            <Input 
                                type="password" 
                                value={newPassword} 
                                onChange={e => setNewPassword(e.target.value)} 
                                placeholder="Enter new password"
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Confirm New Password</label>
                            <Input 
                                type="password" 
                                value={confirmPassword} 
                                onChange={e => setConfirmPassword(e.target.value)} 
                                placeholder="Confirm new password"
                            />
                        </div>

                        {message.text && (
                            <p className={`text-sm ${message.type === "error" ? "text-red-500" : "text-green-500"}`}>
                                {message.text}
                            </p>
                        )}

                        <Button onClick={handleUpdatePassword} disabled={saving} className="w-full h-9 mt-4">
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Update Password
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
