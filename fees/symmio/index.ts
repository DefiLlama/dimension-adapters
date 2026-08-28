import request from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { config as symmioConfig } from "../../helpers/symmio";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

type DailyHistory = {
  platformFee: string
  symmioShare: string
}

const methodology = {
  Fees: 'Total fees generated through Symmio.',
  Revenue: 'Portion of the fees retained by Symmio.',
  SupplySideRevenue: 'Portion of the fees retained by builders'
}

const start = '2025-09-30'

const query = `
  query ($day: String!) {
    dailyHistories(where: { day: $day }) {
      platformFee
      symmioShare
    }
  }
`

const fetch = async ({ chain, toTimestamp }: FetchOptions) => {
  const endpoint = symmioConfig[chain]
  if (!endpoint) return {}

  const startOfDay = getTimestampAtStartOfDayUTC(toTimestamp);
  const day = String(Math.floor(startOfDay / 86400));
  const { dailyHistories = [] } = await request(endpoint, query, { day })
    .catch((error) => {
      console.error(`Symmio fees graph request failed on ${chain} (${endpoint})`, error)
      return { dailyHistories: [] };
    }) as { dailyHistories: DailyHistory[] };

  let dailyFees = 0;
  let dailyRevenue = 0;
  let dailySupplySideRevenue = 0;

  dailyHistories.forEach(({ platformFee, symmioShare } ) => {
    const fee = Number(platformFee) / 1e18
    const share = Number(symmioShare) / 1e18

    dailyFees += fee;
    dailyRevenue += share;
    dailySupplySideRevenue += (fee - share);
  })

  return {
    dailyFees: dailyFees.toString(),
    dailyRevenue: dailyRevenue.toString(),
    dailySupplySideRevenue: dailySupplySideRevenue.toString(),
  };
}

const adapters: Adapter = {
  version: 1,
  adapter: Object.fromEntries(Object.keys(symmioConfig).map((chain) => [chain, { fetch, methodology, start }])),
  start
}

export default adapters
