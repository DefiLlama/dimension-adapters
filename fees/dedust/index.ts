import { FetchOptions, FetchResultV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains'
import { httpPost } from "../../utils/fetchURL"
import { METRIC } from '../../helpers/metrics';
import { sleep } from '../../utils/utils';

const DEDUST_API = 'https://mainnet.api.dedust.io/v4/api/get_pools';

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  let offset = 0;

  while (true) {
    const apiResponse = await httpPost(DEDUST_API, {
      offset,
      limit: 100,
      sort_by: "volume_24h",
      sort_direction: "desc",
      filter_by_type: ["cpmm_v2", "stable", "cpmm_v1"]
    });
    let lastVolume = 0;
    for (const poolRow of apiResponse.pool_rows) {
      for (const pool of poolRow.pools) {
        const lpRatio = (Number(pool.lp_fee) / (Number(pool.protocol_fee) + Number(pool.lp_fee)));

        dailyFees.addUSDValue(Number(pool.fees_24h_usd), METRIC.SWAP_FEES);
        dailyRevenue.addUSDValue(Number(pool.fees_24h_usd) * (1 - lpRatio), METRIC.PROTOCOL_FEES);
        dailySupplySideRevenue.addUSDValue(Number(pool.fees_24h_usd) * lpRatio, METRIC.LP_FEES);
      }
      lastVolume = Number(poolRow.volume_24h_usd);
    }
    if (lastVolume < 1) break;
    const totalPools = apiResponse.total_count;
    offset += 100;
    if (offset >= totalPools) break;
    await sleep(3000);
  }

  return {
    dailyUserFees: dailyFees,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
  }
}

const methodology = {
  Fees: "Swap fees paid by users, ranging from 0.05% to 5% depending on the pool.",
  UserFees: "User pays fee on each swap (depends on pool, 0.05% - 5%).",
  Revenue: "Protocol receives 20%(stable and CPMM v1) and 30%(CPMM v2) of fees, it is distributed to DUST stakers.",
  HoldersRevenue: "20% of fees(stable and CPMM v1) and 30% of fees(CPMM v2) are distributed among DUST token stakers.",
  SupplySideRevenue: "80%(stable and CPMM v1) and 70%(CPMM v2) of user fees are distributed among LPs.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees paid by users on token swaps, ranging from 0.05% to 5% depending on the liquidity pool"
  },
  Revenue: {
    [METRIC.STAKING_REWARDS]: "20% of swap fees(stable and CPMM v1) and 30% of swap fees(CPMM v2) distributed to DUST token stakers as protocol revenue"
  },
  HoldersRevenue: {
    [METRIC.STAKING_REWARDS]: "20% of swap fees(stable and CPMM v1) and 30% of swap fees(CPMM v2) distributed to DUST token stakers as protocol revenue"
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "80% of swap fees(stable and CPMM v1) and 70% of swap fees(CPMM v2) distributed to liquidity providers who supply capital to pools"
  }
}

export default {
  version: 2,
  chains: [CHAIN.TON],
  fetch,
  //start: '2023-11-14',
  methodology,
  breakdownMethodology,
  runAtCurrTime: true,
}
