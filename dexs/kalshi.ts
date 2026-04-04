import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

async function fetch(_a: any, _b: any, options: FetchOptions) {
  // const data = await fetchURL(`https://kalshi-public-docs.s3.amazonaws.com/reporting/market_data_${options.dateString}.json`)
  const dateString = new Date((options.startOfDay - (24 * 3600)) * 1000).toISOString().split('T')[0]
  
  const query = `
  WITH trade_report_agg AS (
    SELECT 
      SUM(price * contracts_traded / 100) AS cash_volume
    FROM kalshi.trade_report
    WHERE date = date('${dateString}')
  ),
  market_report_agg AS (
    SELECT 
      SUM(CASE WHEN status = 'active' THEN open_interest ELSE 0 END) AS open_interest,
      SUM(daily_volume) AS notional_volume
    FROM kalshi.market_report 
    WHERE date = '${dateString}'
  )
  SELECT 
    tr.cash_volume,
    mr.open_interest,
    mr.notional_volume
  FROM trade_report_agg tr
  CROSS JOIN market_report_agg mr
  `
  const data: { 
    cash_volume: string,
    open_interest: string,
    notional_volume: string,
  }[] = await queryDuneSql(options, query)
  
  const dailyVolume = Number(data[0]?.cash_volume) || 0
  const openInterestAtEnd = Number(data[0]?.open_interest) || 0
  const dailyNotionalVolume = Number(data[0]?.notional_volume) || 0

  return { dailyVolume, openInterestAtEnd, dailyNotionalVolume }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: '2021-06-30',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
}

export default adapter;
