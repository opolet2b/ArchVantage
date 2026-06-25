import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"


export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
export const API_URL = process.env.NEXT_PUBLIC_API_URL || `${basePath}/api/v1`
