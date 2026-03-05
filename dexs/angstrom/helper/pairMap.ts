import { Asset } from "./asset"
import { i32 } from './type/type'
import { Pair } from "./pair"

export class PairMap {
  token0: string
  token1: string
  price_1over0: string

  constructor(token0: string, token1: string, price_1over0: string) {
    this.token0 = token0
    this.token1 = token1
    this.price_1over0 = price_1over0
  }
}

export function parsePairMappings(assetsData: Map<i32, Asset>, pairsData: Map<i32, Pair>): Map<i32, PairMap> {
  const pairMappings: Map<i32, PairMap> = new Map<i32, PairMap>()
  const pairValues: any = pairsData.values()
  for (let i = 0; i < pairsData.size; i++) {
    const pair = pairValues[i] as any as Pair
    const token0Asset = assetsData.get(pair.index0)
    const token1Asset = assetsData.get(pair.index1)
    const token0 = token0Asset ? token0Asset.addr : '0x0'
    const token1 = token1Asset ? token1Asset.addr : '0x0'
    pairMappings.set(i, new PairMap(token0, token1, pair.price_1over0))
  }
  return pairMappings
}
