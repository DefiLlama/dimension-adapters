import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";

const methodology = {
  Fees: "Swap fees paid by users.",
  UserFees: "Users pay fees for every swaps.",
  SupplySideRevenue: 'Share of 5/6 swap fees goes to liquidity providers.',
  Revenue: 'Share of 1/6 of swap fees are revenue to protocol.',
  ProtocolRevenue: 'Share of 1/6 of swap fees are revenue to protocol.',
}

const fetch = async (_a: number , _b: any, { startOfDay }: FetchOptions) => {
  let dailyVolume = 0
  let dailyFees = 0
  let dailyRevenue = 0
  let dailySupplySideRevenue = 0

  // get know pools list
  const pools: Array<any> = (await httpGet('https://api.saucerswap.finance/v2/pools', {
    headers: {
      'origin': 'https://www.saucerswap.finance',
      'x-api-key': getEnv('SAUCERSWAP_API_KEY'),
    }
  }))

  // get pool stats
  for (const pool of pools) {
    const poolStats: any = (await httpGet(`https://api.saucerswap.finance/v2/pools/conversionRates/${pool.id}?interval=DAY&from=${startOfDay}&to=${startOfDay}`, {
      headers: {
        'x-api-key': getEnv('SAUCERSWAP_API_KEY'),
        'origin': 'https://www.saucerswap.finance',
      }
    }))
    const _dailyVolume = poolStats
      .find((dayItem: any) => Number(dayItem.timestampSeconds) === startOfDay)
    
    const volume = Number(_dailyVolume ? _dailyVolume.volumeUsd : 0)
    const fee = volume * Number(pool.fee) / 1e6

    // https://docs.saucerswap.finance/protocol/saucerswap-v2
    dailyVolume += volume
    dailyFees += fee
    dailyRevenue += fee * 1 / 6
    dailySupplySideRevenue += fee * 5 / 6
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      start: '2023-11-04',
    },
  },
  methodology,
};

export default adapter;
