export type i32 = number
export type u8 = number
export type u16 = number
export type u32 = number
export type u64 = number
export type bool = boolean

export class StandingValidation {
  nonce: string
  deadline: string
  constructor(nonce: string, deadline: string) {
    this.nonce = nonce
    this.deadline = deadline
  }
}

export class OrderSignature {
  type: string
  v: i32
  r: string
  s: string
  from: string
  signature: string

  constructor(type: string, v: i32, r: string, s: string, from: string, signature: string) {
    this.type = type
    this.v = v
    this.r = r
    this.s = s
    this.from = from
    this.signature = signature
  }
}
