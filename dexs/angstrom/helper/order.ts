import { BinaryDecoder } from './binaryDecoder'
import { OrderSignature, StandingValidation, i32, u32, u16, u8, } from './type/type'

export class UserOrder {
  binary_array: i32[]
  ref_id: u32
  use_internal: boolean
  pairs_index: u16
  min_price: string
  recipient: string
  hook_data: string
  zero_for_one: boolean
  standing_validation: StandingValidation | null
  order_quantity: string
  max_extra_fee_asset0: string
  extra_fee_asset0: string
  exact_in: boolean
  signature: OrderSignature

  constructor(
    binary_array: i32[],
    ref_id: u32,
    use_internal: boolean,
    pairs_index: u16,
    min_price: string,
    recipient: string,
    hook_data: string,
    zero_for_one: boolean,
    standing_validation: StandingValidation | null,
    order_quantity: string,
    max_extra_fee_asset0: string,
    extra_fee_asset0: string,
    exact_in: boolean,
    signature: OrderSignature
  ) {
    this.binary_array = binary_array
    this.ref_id = ref_id
    this.use_internal = use_internal
    this.pairs_index = pairs_index
    this.min_price = min_price
    this.recipient = recipient
    this.hook_data = hook_data
    this.zero_for_one = zero_for_one
    this.standing_validation = standing_validation
    this.order_quantity = order_quantity
    this.max_extra_fee_asset0 = max_extra_fee_asset0
    this.extra_fee_asset0 = extra_fee_asset0
    this.exact_in = exact_in
    this.signature = signature
  }
}
class UserOrderDecoder {
  decoder: BinaryDecoder
  bitmap: i32[]

  constructor(decoder: BinaryDecoder) {
    this.decoder = decoder
    const bitmapByte = decoder.readU8()
    const binaryArray: i32[] = new Array<i32>(8)
    for (let i: i32 = 0; i < 8; i++) binaryArray[i] = (bitmapByte >> ((7 - i) as u8)) & 1
    this.bitmap = binaryArray
  }

  readRefId(): u32 {
    return this.decoder.readU32()
  }

  readUseInternal(): boolean {
    return this.bitmap[7] == 1
  }

  readPairsIndex(): u16 {
    return this.decoder.readU16()
  }

  readMinPrice(): string {
    return this.decoder.readU256()
  }

  readRecipient(): string {
    if (this.bitmap[6] == 1) return this.decoder.readAddress()
    return '0x0000000000000000000000000000000000000000'
  }

  readHookData(): string {
    if (this.bitmap[5] == 1) {
      const hook_data_length = this.decoder.readU24()
      return this.decoder.readBytes(hook_data_length)
    }
    return ''
  }

  readZeroForOne(): boolean {
    return this.bitmap[4] == 1
  }

  readStandingValidation(): StandingValidation | null {
    if (this.bitmap[3] == 1) {
      const nonce = this.decoder.readU64()
      const deadline = this.decoder.readU40()
      return new StandingValidation(nonce, deadline)
    }
    return null
  }

  readOrderQuantities(): string {
    if (this.bitmap[2] == 1) {
      const min_quantity_in = this.decoder.readU128()
      const max_quantity_in = this.decoder.readU128()
      const filled_quantity = this.decoder.readU128()
      return filled_quantity
    } else {
      const quantity = this.decoder.readU128()
      return quantity
    }
  }

  readMaxExtraFeeAsset0(): string {
    return this.decoder.readU128()
  }

  readExtraFeeAsset0(): string {
    return this.decoder.readU128()
  }

  readExactIn(): boolean {
    return this.bitmap[1] == 1
  }

  readSignature(): OrderSignature {
    if (this.bitmap[0] == 1) {
      const signature_v = this.decoder.readU8()
      const signature_r = this.decoder.readBytes(32)
      const signature_s = this.decoder.readBytes(32)
      return new OrderSignature("Ecdsa", signature_v, signature_r, signature_s, "", "")
    } else {
      const from = this.decoder.readAddress()
      const signature_length = this.decoder.readU24()
      const signature_bytes = this.decoder.readBytes(signature_length)
      return new OrderSignature("Contract", 0, "", "", from, signature_bytes)
    }
  }
}

function padUserOrder(decoder: BinaryDecoder): UserOrder {
  const userOrderDecoder = new UserOrderDecoder(decoder)
  const ref_id = userOrderDecoder.readRefId()
  const use_internal = userOrderDecoder.readUseInternal()
  const pairs_index = userOrderDecoder.readPairsIndex()
  const min_price = userOrderDecoder.readMinPrice()
  const recipient = userOrderDecoder.readRecipient()
  const hook_data = userOrderDecoder.readHookData()
  const zero_for_one = userOrderDecoder.readZeroForOne()
  const standing_validation = userOrderDecoder.readStandingValidation()
  const order_quantity = userOrderDecoder.readOrderQuantities()
  const max_extra_fee_asset0 = userOrderDecoder.readMaxExtraFeeAsset0()
  const extra_fee_asset0 = userOrderDecoder.readExtraFeeAsset0()
  const exact_in = userOrderDecoder.readExactIn()
  const signature = userOrderDecoder.readSignature()
  
  return new UserOrder(
    userOrderDecoder.bitmap,
    ref_id,
    use_internal,
    pairs_index,
    min_price,
    recipient,
    hook_data,
    zero_for_one,
    standing_validation,
    order_quantity,
    max_extra_fee_asset0,
    extra_fee_asset0,
    exact_in,
    signature
  )
}

export function padUserOrders(decoder: BinaryDecoder): UserOrder[] {
  const size = decoder.readU24() as i32
  const userOrdersArray: UserOrder[] = []
  let bytesRead = 3 // Already read 3 bytes for size (U24)
  while (bytesRead < size) {
    const startPosition = decoder.pos
    userOrdersArray.push(padUserOrder(decoder))
    bytesRead += decoder.pos - startPosition
  }
  return userOrdersArray
}
