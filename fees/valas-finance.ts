import { CHAIN } from "../helpers/chains";
import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getPoolFees, AaveLendingPoolConfig } from "../helpers/aave";

const DISABLED_ASSETS = ['0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', '0x14016E85a25aeb13065688cAFB43044C2ef86784']

const fetch = async (options: FetchOptions) => {
  let dailyFees = options.createBalances()
  let dailyProtocolRevenue = options.createBalances()
  let dailySupplySideRevenue = options.createBalances()

  const config = {
    pools: [
      {
        version: 2,
        lendingPoolProxy: '0xE29A55A6AEFf5C8B1beedE5bCF2F0Cb3AF8F91f5',
        dataProvider: '0xc9704604E18982007fdEA348e8DDc7CC652E34cA',
      },
    ],
  }
  for (const pool of config.pools) {
    await getPoolFees(pool as AaveLendingPoolConfig, options, {
      dailyFees,
      dailySupplySideRevenue,
      dailyProtocolRevenue,
    })
  }
  dailyFees.removeTokenBalance(DISABLED_ASSETS[0])
  dailyFees.removeTokenBalance(DISABLED_ASSETS[1])

  dailyProtocolRevenue.removeTokenBalance(DISABLED_ASSETS[0])
  dailyProtocolRevenue.removeTokenBalance(DISABLED_ASSETS[1])

  dailySupplySideRevenue.removeTokenBalance(DISABLED_ASSETS[0])
  dailySupplySideRevenue.removeTokenBalance(DISABLED_ASSETS[1])

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2022-03-20',
    },
  }
}

export default adapter
