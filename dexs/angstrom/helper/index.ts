import { padPairs, Pair } from './pair'
import { padAssets, Asset } from './asset'
import { BinaryDecoder } from './binaryDecoder'
import { hexDecode } from './utils'
import { padPoolUpdates, PoolUpdate } from './pool'
import { i32 } from './type/type'

export class AngstromBundle {
  assets: Map<i32, Asset>
  pairs: Map<i32, Pair>
  pool_updates: PoolUpdate[]

  constructor(
    assets: Map<i32, Asset>,
    pairs: Map<i32, Pair>,
    pool_updates: PoolUpdate[],
  ) {
    this.assets = assets
    this.pairs = pairs
    this.pool_updates = pool_updates
  }
}

function decode_bundle(s: string): AngstromBundle {
  let hex_str = s
  if (s.length >= 2 && s.charAt(0) == '0' && s.charAt(1) == 'x') hex_str = s.slice(2)
  const bundle_bytes_ext = hexDecode(hex_str)
  if (!bundle_bytes_ext) return new AngstromBundle(new Map<i32, Asset>(), new Map<i32, Pair>(), [])

  let skip = 0
  if (hex_str.length > 8 && hex_str.slice(0, 8) == '09c5eabe') skip = 68

  const bundle_bytes = bundle_bytes_ext.slice(skip)
  const decoder = new BinaryDecoder(bundle_bytes)
  const assets = padAssets(decoder)
  const pairs = padPairs(decoder)
  const pool_updates = padPoolUpdates(decoder)
  // skip top_of_block_orders and user_orders sections (not needed)

  return new AngstromBundle(assets, pairs, pool_updates)
}

export { decode_bundle, }
