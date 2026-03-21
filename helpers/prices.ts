import { Balances } from '@defillama/sdk'
import coreAssets from './coreAssets.json'

const coreAssetCache: Record<string, Set<string>> = {}

export function isCoreAsset(chain: string, address: string): boolean {
  if (!coreAssetCache[chain])
    coreAssetCache[chain] = new Set(Object.values((coreAssets as any)[chain] ?? {}).map((a: any) => a.toLowerCase()))
  return coreAssetCache[chain].has(address.toLowerCase())
}

export function addOneToken({ chain, balances, token0, amount0, token1, amount1 }: { balances: Balances, chain?: string, token0: string, amount0: any, token1: string, amount1: any }) {
  if (!chain) chain = balances.chain

  amount0 = normalize(amount0)
  amount1 = normalize(amount1)
  if (isCoreAsset(chain, token0))
    balances.add(token0, amount0)
  else
    balances.add(token1, amount1)

  function normalize(amount: any) {
    amount = Number(amount)
    return amount < 0 ? amount * -1 : amount
  }
}