import { BinaryDecoder } from './binaryDecoder'
import { OrderSignature, i32, u16, u8 } from './type/type'
export class TopOfBlock {
  binary_array: i32[]
  use_internal: boolean
  quantity_in: string
  quantity_out: string
  max_gas_asset_0: string
  gas_used_asset_0: string
  pairs_index: u16
  zero_for_1: boolean
  recipient: string
  signature: OrderSignature

  constructor(
    binary_array: i32[],
    use_internal: boolean,
    quantity_in: string,
    quantity_out: string,
    max_gas_asset_0: string,
    gas_used_asset_0: string,
    pairs_index: u16,
    zero_for_1: boolean,
    recipient: string,
    signature: OrderSignature,
  ) {
    this.binary_array = binary_array
    this.use_internal = use_internal
    this.zero_for_1 = zero_for_1
    this.quantity_in = quantity_in
    this.quantity_out = quantity_out
    this.max_gas_asset_0 = max_gas_asset_0
    this.gas_used_asset_0 = gas_used_asset_0
    this.pairs_index = pairs_index
    this.recipient = recipient
    this.signature = signature
  }
}

class TopOfBlockDecoder {
  decoder: BinaryDecoder
  bitmap: i32[]

  constructor(decoder: BinaryDecoder) {
    this.decoder = decoder
    const bitmapByte = decoder.readU8()
    const binaryArray: i32[] = new Array<i32>(8)
    for (let i: i32 = 0; i < 8; i++) binaryArray[i] = (bitmapByte >> ((7 - i) as u8)) & 1
    this.bitmap = binaryArray
  }

  readUseInternal(): boolean {
    return this.bitmap[7] == 1
  }

  readZeroForOne(): boolean {
    return this.bitmap[6] == 1
  }

  readRecipient(): string {
    if (this.bitmap[5] == 1) return this.decoder.readAddress()
    return '0x0000000000000000000000000000000000000000'
  }

  readQuantityIn(): string {
    return this.decoder.readU128()
  }

  readQuantityOut(): string {
    return this.decoder.readU128()
  }

  readMaxGasAsset0(): string {
    return this.decoder.readU128()
  }

  readGasUsedAsset0(): string {
    return this.decoder.readU128()
  }

  readPairsIndex(): u16 {
    return this.decoder.readU16()
  }

  readSignature(): OrderSignature {
    if (this.bitmap[4] == 1) {
      const signature_v = this.decoder.readU8()
      const signature_r = this.decoder.readBytes(32)
      const signature_s = this.decoder.readBytes(32)
      return new OrderSignature('Ecdsa', signature_v, signature_r, signature_s, '', '')
    } else {
      const from = this.decoder.readAddress()
      const signature_length = this.decoder.readU24()
      const signature_bytes = this.decoder.readBytes(signature_length)
      return new OrderSignature('Contract', 0, '', '', from, signature_bytes)
    }
  }
}

function padTopOfBlock(decoder: BinaryDecoder): TopOfBlock {
  const topOfBlockDecoder = new TopOfBlockDecoder(decoder)
  const use_internal = topOfBlockDecoder.readUseInternal()
  const quantity_in = topOfBlockDecoder.readQuantityIn()
  const quantity_out = topOfBlockDecoder.readQuantityOut()
  const max_gas_asset_0 = topOfBlockDecoder.readMaxGasAsset0()
  const gas_used_asset_0 = topOfBlockDecoder.readGasUsedAsset0()
  const pairs_index = topOfBlockDecoder.readPairsIndex()
  const zero_for_1 = topOfBlockDecoder.readZeroForOne()
  const recipient = topOfBlockDecoder.readRecipient()
  const signature = topOfBlockDecoder.readSignature()

  return new TopOfBlock(
    topOfBlockDecoder.bitmap,
    use_internal,
    quantity_in,
    quantity_out,
    max_gas_asset_0,
    gas_used_asset_0,
    pairs_index,
    zero_for_1,
    recipient,
    signature,
  )
}

export function padTopOfBlocks(decoder: BinaryDecoder): TopOfBlock[] {
  const size = decoder.readU24() as i32
  const topOfBlocksArray: TopOfBlock[] = []
  const startPos = decoder.pos - 3 // Account for the 3 bytes we just read
  const endPos = startPos + size
  
  while (decoder.pos < endPos) {
    const beforePos = decoder.pos
    topOfBlocksArray.push(padTopOfBlock(decoder))
    
    // Safety check to prevent infinite loop
    if (decoder.pos <= beforePos) {
      break
    }
  }
  return topOfBlocksArray
}
