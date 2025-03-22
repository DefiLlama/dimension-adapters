import { ChainBlocks, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { httpGet } from "../../utils/fetchURL";

async function fetchLast24hFees(timestamp: number, _: ChainBlocks, { createBalances }: FetchOptions) {
  // fetch volume and pools data from https://app.saberdao.so/
  const [volumeData, poolsData] = await Promise.all([
    httpGet('https://raw.githubusercontent.com/saberdao/birdeye-data/refs/heads/main/volume.json'),
    httpGet('https://raw.githubusercontent.com/saberdao/saber-registry-dist/master/data/pools-info.mainnet.json')
  ]);

  const dailyFees = createBalances()

  // Create map of tokenA mint addresses by swap account
  const poolTokens = new Map(
    poolsData.pools.map((pool: any) => [
      pool.swap.config.swapAccount,
      pool.swap.state.tokenA.mint.toString()
    ])
  )

  Object.entries(volumeData).forEach(([swapAccount, pool]: [string, any]) => {
    if (!pool.v || !pool.feesUsd) return;

    const tokenAMint = poolTokens.get(swapAccount)
    if (!tokenAMint) return;

    if (pool.feesUsd > 0) {
      dailyFees.add(tokenAMint.toString(), pool.feesUsd)
    }
  })

  return { dailyFees, dailyRevenue: dailyFees, }
}

export default {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchLast24hFees,
      runAtCurrTime: true,
    }
  }
}
