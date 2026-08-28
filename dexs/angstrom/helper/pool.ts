import { BinaryDecoder } from './binaryDecoder'
import { i32, u16, u32, u8 } from './type/type'

export class RewardsUpdate {
  isMultiTick: boolean
  // MultiTick fields
  start_tick: u32
  start_liquidity: string
  quantities: string[]
  checksum: string
  // CurrentOnly fields
  amount: string
  expected_liquidity: string

  constructor(
    isMultiTick: boolean,
    start_tick: u32,
    start_liquidity: string,
    quantities: string[],
    checksum: string,
    amount: string,
    expected_liquidity: string
  ) {
    this.isMultiTick = isMultiTick
    this.start_tick = start_tick
    this.start_liquidity = start_liquidity
    this.quantities = quantities
    this.checksum = checksum
    this.amount = amount
    this.expected_liquidity = expected_liquidity
  }

  static createMultiTick(start_tick: u32, start_liquidity: string, quantities: string[], checksum: string): RewardsUpdate {
    return new RewardsUpdate(true, start_tick, start_liquidity, quantities, checksum, "", "")
  }

  static createCurrentOnly(amount: string, expected_liquidity: string): RewardsUpdate {
    return new RewardsUpdate(false, 0, "", [], "", amount, expected_liquidity)
  }
}

export class PoolUpdate {
  bitmap: i32[]
  zero_for_one: boolean
  pair_index: u16
  swap_in_quantity: string
  rewards_update: RewardsUpdate

  constructor(
    bitmap: i32[],
    zero_for_one: boolean,
    pair_index: u16,
    swap_in_quantity: string,
    rewards_update: RewardsUpdate
  ) {
    this.bitmap = bitmap
    this.zero_for_one = zero_for_one
    this.pair_index = pair_index
    this.swap_in_quantity = swap_in_quantity
    this.rewards_update = rewards_update
  }
}

class PoolUpdateDecoder {
  decoder: BinaryDecoder
  bitmap: i32[]

  constructor(decoder: BinaryDecoder) {
    this.decoder = decoder
    const bitmapByte = decoder.readU8()
    const binaryArray: i32[] = new Array<i32>(8)
    for (let i: i32 = 0; i < 8; i++) binaryArray[i] = (bitmapByte >> ((7 - i) as u8)) & 1
    this.bitmap = binaryArray
  }

  readZeroForOne(): boolean {
    return this.bitmap[7] == 1
  }

  readPairIndex(): u16 {
    return this.decoder.readU16()
  }

  readSwapInQuantity(): string {
    return this.decoder.readU128()
  }

  readRewardsUpdateStartTick(): u32 {
    return this.decoder.readU24()
  }

  readRewardsUpdateStartLiquidity(): string {
    return this.decoder.readU128()
  }

  readRewardsUpdateAmount(): string {
    return this.decoder.readU128()
  }

  readRewardsUpdateExpectedLiquidity(): string {
    return this.decoder.readU128()
  }

  readRewardsUpdateQuantities(): string[] {
    const rewards_update_quantities = this.decoder.readU24()
    const length = (rewards_update_quantities / 16) as i32
    const rewardsUpdateQuantitiesArray: string[] = []
    for (let i = 0; i < length; i++) {
      rewardsUpdateQuantitiesArray.push(this.decoder.readU128())
    }
    return rewardsUpdateQuantitiesArray
  }

  readRewardsUpdateChecksum(): string {
    return this.decoder.readAddress()
  }
}

function readPoolUpdate(decoder: BinaryDecoder): PoolUpdate {
  const poolUpdateDecoder = new PoolUpdateDecoder(decoder)
  const zero_for_one = poolUpdateDecoder.readZeroForOne()
  const pair_index = poolUpdateDecoder.readPairIndex()
  const swap_in_quantity = poolUpdateDecoder.readSwapInQuantity()
  
  let rewards_update: RewardsUpdate
  if (poolUpdateDecoder.bitmap[6] == 0) {
    // MultiTick
    const start_tick = poolUpdateDecoder.readRewardsUpdateStartTick()
    const start_liquidity = poolUpdateDecoder.readRewardsUpdateStartLiquidity()
    const quantities = poolUpdateDecoder.readRewardsUpdateQuantities()
    const checksum = poolUpdateDecoder.readRewardsUpdateChecksum()
    rewards_update = RewardsUpdate.createMultiTick(start_tick, start_liquidity, quantities, checksum)
  } else {
    // CurrentOnly
    const amount = poolUpdateDecoder.readRewardsUpdateAmount()
    const expected_liquidity = poolUpdateDecoder.readRewardsUpdateExpectedLiquidity()
    rewards_update = RewardsUpdate.createCurrentOnly(amount, expected_liquidity)
  }

  return new PoolUpdate(
    poolUpdateDecoder.bitmap,
    zero_for_one,
    pair_index,
    swap_in_quantity,
    rewards_update
  )
}

export function padPoolUpdates(decoder: BinaryDecoder): PoolUpdate[] {
  const size = decoder.readU24() as i32
  const poolUpdatesArray: PoolUpdate[] = []
  let bytesRead = 3 // Already read 3 bytes for size (U24)
  while (bytesRead < size) {
    const startPosition = decoder.pos
    poolUpdatesArray.push(readPoolUpdate(decoder))
    bytesRead += decoder.pos - startPosition
  }
  return poolUpdatesArray
}
