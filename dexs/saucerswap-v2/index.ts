import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const methodology = {
  Fees: "Swap fees paid by users.",
}

const fetch = async (timestamp: number , _: ChainBlocks, { createBalances, startOfDay }: FetchOptions) => {
  let dailyVolume = 0
  let dailyFees = 0

  // get know pools list
  const pools: Array<any> = (await httpGet('https://server.saucerswap.finance/api/public/v2/pools', {
    headers: {
      'origin': 'https://www.saucerswap.finance',
    }
  }))

  // get pool stats
  const TwoDays = 2 * 24 * 3600
  for (const pool of pools) {
    const poolStats: any = (await httpGet(`https://server.saucerswap.finance/api/public/v2/pools/conversionRates/${pool.id}?interval=DAY&from=${startOfDay - TwoDays}&to=${startOfDay}`, {
      headers: {
        'origin': 'https://www.saucerswap.finance',
      }
    }))
    const _dailyVolume = poolStats
      .find(dayItem => Number(dayItem.timestampSeconds) === startOfDay)
    
      const volume = Number(_dailyVolume ? _dailyVolume.volumeUsd : 0)

    // https://docs.saucerswap.finance/protocol/saucerswap-v2
    // v2 fees goes to LP
    dailyVolume += volume
    dailyFees += volume * Number(pool.fee) / 1000000
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: 0,
    timestamp: startOfDay,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      meta: {
        methodology,
      },
    },
  }
};

export default adapter;
