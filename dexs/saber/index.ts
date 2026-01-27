/**
 * Saber Volume Adapter
 * 
 * This adapter fetches and processes the previous day's volume data for Saber pools.
 * It retrieves volume data and pool information, then calculates the adjusted volume
 * based on token decimals. The adjusted volume is used to provide accurate volume
 * metrics for each token in the pool.
 * 
 */

import { CHAIN } from '../../helpers/chains';
import { ChainBlocks, FetchOptions } from '../../adapters/types';
import { httpGet } from "../../utils/fetchURL";


async function fetchLast24hVolume(timestamp: number, _: ChainBlocks, { createBalances }: FetchOptions) {
  const [volumeData, poolsData] = await Promise.all([
    httpGet('https://raw.githubusercontent.com/saberdao/birdeye-data/refs/heads/main/volume.json'),
    httpGet('https://raw.githubusercontent.com/saberdao/saber-registry-dist/master/data/pools-info.mainnet.json')
  ]);

  const dailyVolume = createBalances()

  // Create map of tokenA mint addresses and decimals by swap account
  const poolTokens = new Map(
    poolsData.pools.map((pool: any) => [
      pool.swap.config.swapAccount,
      {
        mint: pool.swap.state.tokenA.mint.toString(),
        decimals: pool.tokens.find((token: any) => token.address === pool.swap.state.tokenA.mint.toString())?.decimals
      }
    ])
  )

  Object.entries(volumeData).forEach(([swapAccount, pool]: [string, any]) => {
    if (!pool.v) return;

    const tokenInfo = poolTokens.get(swapAccount);
    if (!tokenInfo) return;

    const { mint, decimals } = tokenInfo as { mint: string; decimals: number };
    const adjustedVolume = pool.v * Math.pow(10, decimals || 0);

    dailyVolume.add(mint, adjustedVolume);
  })

  return { dailyVolume, timestamp: Math.floor(Date.now() / 1e3) }
}


export default {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchLast24hVolume,
      runAtCurrTime: true,
    }
  }
}