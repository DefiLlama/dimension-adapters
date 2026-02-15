import { httpPost } from "../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import * as sdk from '@defillama/sdk'


const fetch = async (): Promise<FetchResult> => {
  const pools = await httpPost('https://aftermath.finance/api/pools', {})
  const poolObjectIds = pools.map((pool: any) => pool.objectId)
  const chunks = sdk.util.sliceIntoChunks(poolObjectIds, 42)
  let i = 0
  let dailyVolume = 0
  let dailyFees = 0
  for (const chunk of chunks) {
    const result = await httpPost('https://aftermath.finance/api/pools/stats', { poolIds: chunk})
    i++
    dailyVolume += result.reduce((acc: number, pool: any) => acc + pool.volume, 0)
    dailyFees += result.reduce((acc: number, pool: any) => acc + pool.fees, 0)
  }
  return {
    dailyFees, dailyVolume
  };
};

const methodology = {
  Fees: "Swap fees collected from all AMM pools on Aftermath Finance"
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading fees charged on token swaps across all Aftermath Finance AMM pools"
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-07-20'
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
