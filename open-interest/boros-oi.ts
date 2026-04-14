import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchUrl from "../utils/fetchURL";
import { queryDuneSql } from '../helpers/dune';

const BOROS_API = "https://api.boros.finance/core/v1/markets";

async function fetch(_a: any, _b: any, options: FetchOptions) {
  let openInterestAtEnd = 0;
  const today = Math.floor(new Date().getTime() / 1000)
  if (options.startOfDay <= today - 48 * 3600) {
    const query = `with token_meta as (
          select tokenId as token_id, tokenAddress as token_contract_address, erc20.symbol as token_symbol
          from boros_arbitrum.markethubentry_evt_tokenadded t
          join tokens.erc20
          on erc20.blockchain = 'arbitrum' and erc20.contract_address = t.tokenAddress
      ), 

      raw_trades AS (
      SELECT block_time, "user", trade_size, contract_address FROM query_5624999
      UNION ALL
      SELECT block_time, "user", trade_size, contract_address FROM query_5625119
      UNION ALL
      SELECT block_time, "user", trade_size, contract_address FROM query_5628754
      UNION ALL
      SELECT block_time, "user", trade_size, contract_address FROM query_5637678
      UNION ALL
      SELECT block_time, "user", trade_size, contract_address FROM query_5669629
      ),
      trades_by_day AS (
      SELECT
          CAST(date_trunc('day', d.block_time) AS date) AS day,
          d."user",
          d.trade_size,
          d.contract_address
      FROM raw_trades d
      ),
      daily AS (
      SELECT
          day,
          "user",
          contract_address,
          SUM(trade_size) AS daily_net_flow
      FROM trades_by_day
      GROUP BY 1,2,3
      ),
      date_bounds AS (
      SELECT
          LEAST(
          MIN(day),
          COALESCE((SELECT MIN(day) FROM daily), DATE '2999-12-31')
          ) AS start_day,
          CURRENT_DATE AS end_day
      FROM daily
      ),
      calendar AS (
      SELECT d AS day
      FROM date_bounds,
          unnest(sequence(start_day, end_day, interval '1' day)) AS t(d)
      ),
      users AS (
      SELECT DISTINCT "user", contract_address FROM daily
      ),
      grid AS (
      SELECT c.day, u."user", u.contract_address
      FROM calendar c
      CROSS JOIN users u
      ),
      positions AS (
      SELECT
          day,
          "user",
          contract_address,
          COALESCE(daily_net_flow, 0) AS daily_net_flow,
          SUM(COALESCE(daily_net_flow, 0)) OVER (
          PARTITION BY "user", contract_address
          ORDER BY day
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cum_net_position
      FROM grid
      LEFT JOIN daily USING (day, "user", contract_address)  
      ),
      market_oi AS (
      SELECT
          day,
          contract_address,
          (SUM(ABS(cum_net_position))) / 2 AS notional_oi
      FROM positions
      GROUP BY 1,2
      ),
      market_info AS (
      SELECT
          m.day,
          m.contract_address,
          m.notional_oi,
          json_extract_scalar(b.immData, '$.k_marketId') as market_id,
          json_extract_scalar(b.immData, '$.name') as market_name,
          tm.token_symbol,  -- hardcoded for now
          tm.token_contract_address,  -- hardcoded for now
          from_unixtime(cast(json_extract_scalar(b.immData, '$.k_maturity') as integer)) as maturity
      FROM market_oi m
      JOIN boros_arbitrum.marketfactory_evt_marketcreated b
          ON m.contract_address = b.market
      JOIN token_meta tm
          ON cast(json_extract_scalar(b.immData, '$.k_tokenId') as int) = tm.token_id
      ),

      stats_per_market as (
      SELECT
      i.day,
      i.market_id,
      i.market_name,
      i.token_symbol,
      concat(i.market_id, '-', i.market_name, '-', i.token_symbol) as name,
      i.maturity,
      CASE 
          WHEN i.day > CAST(i.maturity AS date) THEN 0 
          ELSE i.notional_oi 
      END AS notional_oi,
      CASE 
          WHEN i.day > CAST(i.maturity AS date) THEN 0 
          ELSE i.notional_oi * price.price 
      END AS notional_oi_in_usd
      FROM market_info i
      LEFT JOIN prices.day price
      ON i.day = price.timestamp 
      AND i.token_contract_address = price.contract_address 
      AND price.blockchain = 'arbitrum'
      ORDER BY 1 DESC)

      SELECT
      day,
      SUM(notional_oi_in_usd) as open_interest
      FROM stats_per_market
      group by day`;
    const queryResults = await queryDuneSql(options, query);
    const today = new Date(options.fromTimestamp * 1000).toISOString().split('T')[0];
    openInterestAtEnd = queryResults.find((entry: any) => entry.day === today)?.open_interest ?? 0;
  } else {
    const borosTradeData = (await fetchUrl(BOROS_API)).results;
    openInterestAtEnd = borosTradeData.reduce((acc: number, market: any) => {
        const markPrice = market.tokenId === 3 ? 1 : (market?.data?.assetMarkPrice ?? 0);
        acc += (markPrice * (market?.data?.notionalOI ?? 0));
        return acc;
    }, 0);
  }

  return {
    openInterestAtEnd,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  // runAtCurrTime: true,
  chains: [CHAIN.ARBITRUM],
};

export default adapter;
