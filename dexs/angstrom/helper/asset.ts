import { BinaryDecoder } from './binaryDecoder'
import { i32 } from './type/type'

const size = 68

export class Asset {
  addr: string
  save: string
  take: string
  settle: string

  constructor(addr: string, save: string, take: string, settle: string) {
    this.addr = addr
    this.save = save
    this.take = take
    this.settle = settle
  }
}

function readAsset(decoder: BinaryDecoder): Asset {
  const addr = decoder.readAddress()
  const save = decoder.readU128().toString()
  const take = decoder.readU128().toString()
  const settle = decoder.readU128().toString()
  return new Asset(addr, save, take, settle)
}

export function padAssets(decoder: BinaryDecoder): Map<i32, Asset> {
  const assetsLength = decoder.readU24()
  const assetCount = (assetsLength / size) as i32
  const assetsMap: Map<i32, Asset> = new Map<i32, Asset>()
  for (let i = 0; i < assetCount; i++) {
    assetsMap.set(i, readAsset(decoder))
  }
  return assetsMap
}
