import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";
import { saucerswapBreakdownMethodology, splitRevenue } from "../../helpers/saucerswap";

const methodology = {
  Fees: "Swap fees paid by users.",
  UserFees: "Users pay fees for every swaps.",
  SupplySideRevenue: 'Share of 5/6 swap fees goes to liquidity providers.',
  Revenue: 'Share of 1/6 of swap fees are revenue to protocol.',
  ProtocolRevenue: 'From 2025-08-31 protocol revenue buys SAUCE; this is the share sent to the Development Fund and the POL and Incentive Reserve (54.5%, 40% from 2026-07-01, 50% from 2026-09-07). Before 2025-08-31, all protocol revenue.',
  HoldersRevenue: 'From 2025-08-31 protocol revenue buys SAUCE; this is the share sent to xSAUCE stakers and burned (45.5%, 60% from 2026-07-01, 50% from 2026-09-07).',
}

const breakdownMethodology = saucerswapBreakdownMethodology('Swap fees paid by users, at each pool fee tier.')


const fetch = async (options: FetchOptions) => {
  const { startOfDay } = options
  let dailyVolume = 0
  let fees = 0

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
    fees += fee
  }

  const revenue = fees * 1 / 6
  const dailyFees = options.createBalances()
  dailyFees.addUSDValue(fees, 'Token Swap Fees')
  const dailyRevenue = options.createBalances()
  dailyRevenue.addUSDValue(revenue, 'Swap Fees To Protocol')
  const dailySupplySideRevenue = options.createBalances()
  dailySupplySideRevenue.addUSDValue(fees * 5 / 6, 'Swap Fees To LPs')
  const { dailyProtocolRevenue, dailyHoldersRevenue } = splitRevenue(options, revenue)

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};


const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HEDERA],
  start: '2023-11-04',
  methodology,
  breakdownMethodology,
};

export default adapter;
