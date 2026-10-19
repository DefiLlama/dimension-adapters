import { FetchOptions } from "../adapters/types";
import { queryDuneSql } from "./dune";

// Shared reader for the JupLend Dune materialized view, used by both the
// jupiter-lend adapter and the solana leg of the fluid adapter (Fluid earns 50%
// of JupLend revenue).
//
// The MV refreshes with a lag, so the row for a given day keeps growing until
// the view is refreshed after that day has ended. If the adapter runs before
// that refresh, it stores a partial day and never revisits it. To avoid that we
// only accept a day once the MV already holds revenue for a later day; until
// then we throw so the day is retried instead of being saved short.
export async function fetchJupLendDailyRows(options: FetchOptions): Promise<any[]> {
  const sql = `
    with mv as (
      select * from dune."jupiter".result_juplend_historical_tvl_by_token_mv
    ),
    latest as (
      select max(day) as latest_day from mv where day_revenue_usd is not null
    )
    select
        mv.day
      , mv.instance_name
      , sum(mv.borrow_fees_usd) as daily_fees_usd
      , sum(mv.supply_side_fees_usd) as daily_supply_side_revenue_usd
      , sum(mv.day_revenue_usd) as daily_revenue_usd
      , max(latest.latest_day) >= FROM_UNIXTIME(${options.endTimestamp}) as is_final
    from mv
    cross join latest
    where mv.day >= FROM_UNIXTIME(${options.startTimestamp})
        and mv.day < FROM_UNIXTIME(${options.endTimestamp})
    group by 1, 2
    order by 1 desc
  `
  const data: any[] = await queryDuneSql(options, sql);
  const day = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);

  if (!data || data.length === 0) {
    throw new Error(`No JupLend data returned from Dune for ${day}`);
  }

  if (!data.every((row) => row.is_final === true)) {
    throw new Error(`JupLend Dune data for ${day} is not final yet (MV not refreshed past this day)`);
  }

  return data;
}
