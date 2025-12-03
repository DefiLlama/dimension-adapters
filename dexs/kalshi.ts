import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

async function fetch(_a: any, _b: any, options: FetchOptions) {
  // const data = await fetchURL(`https://kalshi-public-docs.s3.amazonaws.com/reporting/market_data_${options.dateString}.json`)
  const dateString = new Date((options.startOfDay - (24 * 3600)) * 1000).toISOString().split('T')[0]
  const query = `
  select 
    SUM(daily_volume) AS volume,
    SUM(CASE WHEN status = 'active' THEN open_interest ELSE 0 END) AS open_interest
  from kalshi.market_report 
    where date = '${dateString}'
  `
  const data: { volume: string, open_interest: string }[] = await queryDuneSql(options, query)
  const dailyVolume = Number(data[0]?.volume) || 0
  const openInterestAtEnd = Number(data[0]?.open_interest) || 0

  return { dailyVolume, openInterestAtEnd }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: '2021-06-30',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
}

export default adapter;
