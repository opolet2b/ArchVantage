"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { API_URL } from "@/lib/utils"

export default function LoginPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const { login } = useAuth()

    const [requiresPasswordChange, setRequiresPasswordChange] = useState(false)
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [tempToken, setTempToken] = useState("")
    const [userData, setUserData] = useState<any>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError("")

        try {
            const formData = new URLSearchParams()
            formData.append("username", email)
            formData.append("password", password)

            const res = await fetch(`${API_URL}/auth/token`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: formData,
            })

            if (!res.ok) {
                throw new Error("Invalid credentials")
            }

            const data = await res.json()
            // Decode token or fetch user details. For now, we'll fetch user details.

            const userRes = await fetch(`${API_URL}/auth/me`, {
                headers: {
                    "Authorization": `Bearer ${data.access_token}`
                }
            })

            if (!userRes.ok) {
                throw new Error("Failed to fetch user details")
            }

            const fetchedUserData = await userRes.json()

            if (fetchedUserData.requires_password_change) {
                setTempToken(data.access_token)
                setUserData(fetchedUserData)
                setRequiresPasswordChange(true)
                setIsLoading(false)
                return
            }

            login(data.access_token, { email: fetchedUserData.email, roles: fetchedUserData.roles })

        } catch (err) {
            setError("Invalid email or password")
        } finally {
            if (!requiresPasswordChange) {
                setIsLoading(false)
            }
        }
    }

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match")
            return
        }
        setIsLoading(true)
        setError("")

        try {
            const res = await fetch(`${API_URL}/auth/password`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tempToken}`
                },
                body: JSON.stringify({
                    current_password: password,
                    new_password: newPassword
                })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.detail || "Failed to change password")
            }

            // Success, login now
            login(tempToken, { email: userData.email, roles: userData.roles })
        } catch (err: any) {
            setError(err.message)
            setIsLoading(false)
        }
    }

    return (
        <div className="flex h-screen items-center justify-center bg-muted/50">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold">{requiresPasswordChange ? "Change Password" : "Login"}</CardTitle>
                    <CardDescription>
                        {requiresPasswordChange 
                            ? "You must change your password upon first login."
                            : "Enter your email and password to access the account."}
                    </CardDescription>
                </CardHeader>
                {!requiresPasswordChange ? (
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="m@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full" type="submit" disabled={isLoading}>
                                {isLoading ? "Signing in..." : "Sign in"}
                            </Button>
                        </CardFooter>
                    </form>
                ) : (
                    <form onSubmit={handlePasswordChange}>
                        <CardContent className="space-y-4">
                            {error && (
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="new-password">New Password</Label>
                                <Input
                                    id="new-password"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirm-password">Confirm New Password</Label>
                                <Input
                                    id="confirm-password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full" type="submit" disabled={isLoading}>
                                {isLoading ? "Updating..." : "Update Password & Sign In"}
                            </Button>
                        </CardFooter>
                    </form>
                )}
            </Card>
        </div>
    )
}
