import { i32, u16, u32, u64, u8, bool } from './type/type'
import { bytesToHex } from './utils'

/**
 * Binary decoder for parsing Angstrom bundle format
 * Handles reading various data types from byte arrays
 */
export class BinaryDecoder {
  data: Uint8Array
  pos: i32

  constructor(data: Uint8Array) {
    this.data = data
    this.pos = 0
  }

  readU8(): u8 {
    if (this.pos >= this.data.length) return 0
    return this.data[this.pos++]
  }

  readU16(): u16 {
    const b0 = this.readU8()
    const b1 = this.readU8()
    return ((b0 as u16) << 8) | (b1 as u16)
  }

  readU24(): u32 {
    const b0 = this.readU8()
    const b1 = this.readU8()
    const b2 = this.readU8()
    return ((b0 as u32) << 16) | ((b1 as u32) << 8) | (b2 as u32)
  }

  readU32(): u32 {
    const b0 = this.readU8()
    const b1 = this.readU8()
    const b2 = this.readU8()
    const b3 = this.readU8()
    return ((b0 as u32) << 24) | ((b1 as u32) << 16) | ((b2 as u32) << 8) | (b3 as u32)
  }

  readU40(): string {
    const high = this.readU32()
    const low = this.readU8()
    const result = ((high as u64) << 8) | (low as u64)
    return result.toString()
  }

  readU64(): string {
    const high = this.readU32()
    const low = this.readU32()
    const result = ((high as u64) << 32) | (low as u64)
    return result.toString()
  }

  readU128(): string {
    return this.readBytes(16)
  }

  readU256(): string {
    return this.readBytes(32)
  }

  readAddress(): string {
    const bytes = new Uint8Array(20)
    for (let i = 0; i < 20; i++) {
      bytes[i] = this.readU8()
    }
    return '0x' + bytesToHex(bytes)
  }

  readBytes(len: i32): string {
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = this.readU8()
    }
    return '0x' + bytesToHex(bytes)
  }

  readBool(): bool {
    return this.readU8() != 0
  }

  skip(count: i32): void {
    this.pos += count
  }

}
