import { ChainBlocks, FetchOptions } from '../../adapters/types';
import { httpGet } from "../../utils/fetchURL";

async function last24h(timestamp: number, _: ChainBlocks, { createBalances }: FetchOptions) {
  const [volumeData, poolsData] = await Promise.all([
    httpGet('https://raw.githubusercontent.com/saberdao/birdeye-data/refs/heads/main/volume.json'),
    httpGet('https://raw.githubusercontent.com/saberdao/saber-registry-dist/master/data/pools-info.mainnet.json')
  ]);

  const dailyVolume = createBalances()

  // Create map of tokenA mint addresses by swap account
  const poolTokens = new Map(
    poolsData.pools.map((pool: any) => [
      pool.swap.config.swapAccount,
      pool.swap.state.tokenA.mint.toString()
    ])
  )

  Object.entries(volumeData).forEach(([swapAccount, pool]: [string, any]) => {
    if (!pool.v) return;

    const tokenAMint = poolTokens.get(swapAccount)
    if (!tokenAMint) return;
    dailyVolume.add(tokenAMint.toString(), pool.v)
  })

  return { dailyVolume, timestamp: Math.floor(Date.now() / 1e3) }
}


export default {
  adapter: {
    "solana": {
      fetch: last24h,
      runAtCurrTime: true,
    }
  }
}
