import { UserOrder } from './order'
import { PairMap } from './pairMap'
import { PoolUpdate } from './pool'
import { TopOfBlock } from './tob'
import { i32 } from './type/type'

export class Transaction {
  zeroForOne: boolean
  exactIn: boolean
  price_1over0: string
  token0: string
  token0Amount: string // Using string for bigint compatibility
  token1: string
  token1Amount: string // Using string for bigint compatibility
  origin: string
  sender: string
  gasUsedAsset0: string

  constructor(
    zeroForOne: boolean,
    exactIn: boolean,
    price_1over0: string,
    token0: string,
    token0Amount: string,
    token1: string,
    token1Amount: string,
    origin: string,
    sender: string,
    gasUsedAsset0: string,
  ) {
    this.zeroForOne = zeroForOne
    this.exactIn = exactIn
    this.price_1over0 = price_1over0
    this.token0 = token0
    this.token0Amount = token0Amount
    this.token1 = token1
    this.token1Amount = token1Amount
    this.origin = origin
    this.sender = sender
    this.gasUsedAsset0 = gasUsedAsset0
  }
}

export function parseTransactionsFromBundle(
  topOfBlocks: TopOfBlock[],
  userOrders: UserOrder[],
  pairMappings: Map<i32, PairMap>,
): Transaction[] {
  const transactions: Transaction[] = []

  for (let i = 0; i < topOfBlocks.length; i++) {
    const topOfBlock = topOfBlocks[i]
    const zero_for_one = topOfBlock.zero_for_1
    const pairMapping = pairMappings.get(topOfBlock.pairs_index)
    const quantity_in = topOfBlock.quantity_in
    const quantity_out = topOfBlock.quantity_out
    if (pairMapping) {
      transactions.push(
        new Transaction(
          zero_for_one,
          true,
          pairMapping.price_1over0,
          pairMapping.token0,
          zero_for_one ? quantity_in : quantity_out,
          pairMapping.token1,
          zero_for_one ? quantity_out : quantity_in,
          topOfBlock.recipient,
          topOfBlock.recipient,
          topOfBlock.gas_used_asset_0,
        ),
      )
    }
  }

  for (let i = 0; i < userOrders.length; i++) {
    const userOrder = userOrders[i]
    const pairMapping = pairMappings.get(userOrder.pairs_index)
    if (pairMapping) {
      const zero_for_one = userOrder.zero_for_one
      const quantity_in = userOrder.exact_in ? userOrder.order_quantity : '0x00'
      const quantity_out = userOrder.exact_in ? '0x00' : userOrder.order_quantity
      transactions.push(
        new Transaction(
          zero_for_one,
          userOrder.exact_in,
          pairMapping.price_1over0,
          pairMapping.token0,
          zero_for_one ? quantity_in : quantity_out,
          pairMapping.token1,
          zero_for_one ? quantity_out : quantity_in,
          userOrder.recipient,
          userOrder.recipient,
          userOrder.extra_fee_asset0
        ),
      )
    }
  }
  return transactions
}

export class PoolReward {
  token0: string
  token1: string
  rewards: string[]

  constructor(token0: string, token1: string, rewards: string[]) {
    this.token0 = token0
    this.token1 = token1
    this.rewards = rewards
  }
}

export function parsePoolRewards(poolUpdates: PoolUpdate[], pairMappings: Map<i32, PairMap>): PoolReward[] {
  const poolRewards: PoolReward[] = []

  for (let i = 0; i < poolUpdates.length; i++) {
    const poolUpdate = poolUpdates[i]
    const pairMapping = pairMappings.get(poolUpdate.pair_index)

    if (pairMapping) {
      const rewards: string[] = []
      if (poolUpdate.rewards_update.isMultiTick) {
        // MultiTick variant
        const quantities = poolUpdate.rewards_update.quantities
        for (let j = 0; j < quantities.length; j++) {
          rewards.push(quantities[j])
        }
      } else {
        // CurrentOnly variant
        rewards.push(poolUpdate.rewards_update.amount)
      }
      poolRewards.push(new PoolReward(pairMapping.token0, pairMapping.token1, rewards))
    }
  }

  return poolRewards
}
