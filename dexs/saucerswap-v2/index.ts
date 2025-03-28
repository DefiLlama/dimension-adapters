import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const methodology = {
  Fees: "Swap fees paid by users.",
}

const fetch = async (timestamp: number , _: ChainBlocks, { createBalances, startOfDay }: FetchOptions) => {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()

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
    
    // https://docs.saucerswap.finance/protocol/saucerswap-v2
    // v2 fees goes to LP
    const dailyVolumeUsd = Number(_dailyVolume ? _dailyVolume.volumeUsd : 0)
    const dailyFeesUsd = dailyVolumeUsd * Number(pool.fee) / 1000000

    dailyVolume.addUSDValue(dailyVolumeUsd)
    dailyFees.addUSDValue(dailyFeesUsd)
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
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
