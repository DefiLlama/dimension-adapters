import { BinaryDecoder } from './binaryDecoder'
import { i32 } from './type/type'

const size = 38

export class Pair {
  index0: i32
  index1: i32
  store_index: i32
  price_1over0: string

  constructor(index0: i32, index1: i32, store_index: i32, price_1over0: string) {
    this.index0 = index0
    this.index1 = index1
    this.store_index = store_index
    this.price_1over0 = price_1over0
  }
}

function readPair(decoder: BinaryDecoder): Pair {
  const index0 = decoder.readU16() as i32
  const index1 = decoder.readU16() as i32
  const store_index = decoder.readU16() as i32
  const price_1over0 = decoder.readU256()
  return new Pair(index0, index1, store_index, price_1over0)
}

export function padPairs(decoder: BinaryDecoder): Map<i32, Pair> {
  const length = decoder.readU24()
  const count = (length / size) as i32
  const pairsMap: Map<i32, Pair> = new Map<i32, Pair>()
  for (let i = 0; i < count; i++) {
    const pair = readPair(decoder)
    pairsMap.set(i, pair)
  }
  return pairsMap
}
