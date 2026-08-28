import { i32 } from "./type/type"

// Helper function to convert hex character to number
export function hexCharToNum(c: string): i32 {
  const code = c.charCodeAt(0)
  if (code >= 48 && code <= 57) return code - 48 // 0-9
  if (code >= 97 && code <= 102) return code - 87 // a-f
  if (code >= 65 && code <= 70) return code - 55 // A-F
  return -1
}

// Simple hex decode function
export function hexDecode(hex: string): Uint8Array | null {
  if (hex.length % 2 != 0) return null

  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    const high = hexCharToNum(hex.charAt(i))
    const low = hexCharToNum(hex.charAt(i + 1))
    if (high == -1 || low == -1) return null
    bytes[i / 2] = (high << 4) | low
  }
  return bytes
}

// Convert bytes to hex string
export function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]
    const hi = (byte >> 4) & 0xf
    const lo = byte & 0xf
    hex += hi < 10 ? String.fromCharCode(48 + hi) : String.fromCharCode(87 + hi)
    hex += lo < 10 ? String.fromCharCode(48 + lo) : String.fromCharCode(87 + lo)
  }
  return hex
}
