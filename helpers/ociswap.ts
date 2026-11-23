import ADDRESSES from "./coreAssets.json";
import fetchURL from "../utils/fetchURL";

const POOLS_URL = 'https://api.ociswap.com/pools'
const XRD = ADDRESSES.radixdlt.XRD

type Window = { '24h': string }

interface PoolSide {
  token: { address: string };
  volume: Window;
  fee: { token: Partial<Window> }; // the 24h key is absent when the pool had no swaps
}

interface Pool {
  address: string;
  pool_type: string;
  x: PoolSide;
  y: PoolSide;
}

async function getPools(): Promise<Pool[]> {
  const pools = new Map<string, Pool>()
  let cursor = 0
  while (true) {
    const { data, next_cursor } = await fetchURL(`${POOLS_URL}?limit=100&cursor=${cursor}`)
    for (const pool of data) pools.set(pool.address, pool)
    if (!next_cursor || !data.length) break
    cursor = next_cursor
  }
  return [...pools.values()]
}

export async function getOciswapXrdTotals(poolType: 'basic' | 'precision') {
  const pools = (await getPools()).filter(pool => pool.pool_type === poolType)
  if (!pools.length) throw new Error(`Ociswap API returned no ${poolType} pools`)

  let volume = 0
  let fees = 0
  for (const pool of pools) {
    // Pools without an XRD leg are skipped (none exist as of 2026-11-08).
    const [xrdSide, tokenSide] = pool.x.token.address === XRD ? [pool.x, pool.y] : pool.y.token.address === XRD ? [pool.y, pool.x] : []
    if (!xrdSide || !tokenSide) continue

    const xrdVolume = Number(xrdSide.volume['24h'])
    const tokenVolume = Number(tokenSide.volume['24h'])
    const xrdFee = Number(xrdSide.fee.token['24h'] ?? 0)
    const tokenFee = Number(tokenSide.fee.token['24h'] ?? 0)
    if ([xrdVolume, tokenVolume, xrdFee, tokenFee].some(Number.isNaN)) throw new Error(`Ociswap pool ${pool.address} has a non-numeric 24h volume or fee`)

    volume += xrdVolume
    fees += xrdFee + (tokenFee ? tokenFee * xrdVolume / tokenVolume : 0)
  }
  return { volume, fees }
}
