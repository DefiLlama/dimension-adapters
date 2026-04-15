import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

async function prefetch(options: FetchOptions) {
  const duneQuery = `
    with 
    
    time_seq AS (
        select 
            sequence(
            cast('2024-01-01' as timestamp),
            date_trunc('day', cast(now() as timestamp)),
            interval '1' day
            ) as time 
    ),
    
    days AS (
        select
            time.time as day
        from 
        time_seq
        cross join unnest(time) AS time(time)
    ),
    
    hours as (
        select 
            * 
        from (
            select 
                date_add('hour', hour, day) as hour
            from (
                select 
                    day 
                from 
                days 
            ) cross join unnest(sequence(0, 23)) as h(hour)
        )
    ),
    
    events as (
        select 
            blockchain,
            date_trunc('hour', block_time) as hour, 
            sum(case when event_type = 'borrow' then token_amount_usd else -token_amount_usd end) as amount 
        from 
        (
            select 
            *, 
            cast(now() as timestamp) as last_updated 
            from 
                "query_6819705(start_date='date_trunc(\\'day\\', now() - interval \\'1\\' day)')"
            
            union all 
            
            select 
                * 
            from 
                dune.ether_fi.result_etherfi_cash_events
            where block_date < date_trunc('day', now() - interval '1' day)
        )
        where event_type in ('borrow', 'repay')
        and blockchain in ('scroll', 'optimism')
        group by 1, 2
    ),
    
    tokens_supply_cum as (
        select 
            blockchain,
            hour,
            sum(amount) over (partition by blockchain order by hour) as token_supply,
            lead(hour, 1, current_timestamp) over (partition by blockchain order by hour) as next_hour
        from
        events
    ),
    
    hourly_balance as (
        select 
            t.blockchain,
            h.hour, 
            t.token_supply
        from 
        tokens_supply_cum t
        inner join
        hours h 
            on t.hour <= h.hour 
            and h.hour < t.next_hour
    ),
    
    get_values as (
        select 
            gv.blockchain,
            gv.hour,
            4 as platform_fee, 
            gv.token_supply,
            gv.token_supply * 1 as token_supply_type,
            gv.token_supply * 1 as token_supply_usd, 
            1 as base_asset_type_price 
        from 
        hourly_balance gv 
    )
    
    select 
        blockchain,
        day,
        sum((cast(platform_fee as double)/100 * token_supply_type * base_asset_type_price)/365) as revenue_usd
    from (
        select 
            blockchain,
            date_trunc('day', hour) as day, 
            avg(platform_fee) as platform_fee, 
            avg(token_supply) as token_supply,
            avg(token_supply_type) as token_supply_type,
            max_by(base_asset_type_price, hour) as base_asset_type_price
        from 
            get_values 
        where date_trunc('day', hour) = date(from_unixtime(${options.startOfDay}))
        group by 1, 2
    )
    group by 1, 2
  `

  return await queryDuneSql(options, duneQuery)
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const results = options.preFetchedResults;
  
  const chainResult = results.find((r: any) => r.blockchain === options.chain);
  if (chainResult) {
    // Borrow interest from cash lending - protocol revenue
    dailyFees.addUSDValue(chainResult.revenue_usd, METRIC.BORROW_INTEREST);
  }
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: 0,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  prefetch,
  adapter: {
    [CHAIN.SCROLL]: { start: '2024-11-01' },
    [CHAIN.OPTIMISM]: { start: '2026-04-08' },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Total borrow interest generated from EtherFi Cash services on Scroll and OP Mainnet.",
    Revenue: "Protocol's share of fees from borrow interest.",
    ProtocolRevenue: "Same as Revenue - all protocol earnings from EtherFi Cash on Scroll and OP Mainnet.",
    HoldersRevenue: "No revenue share to ETHFI holders",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Interest earned from EtherFi Cash lending operations on Scroll and OP Mainnet',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'Interest earned from EtherFi Cash lending operations on Scroll and OP Mainnet',
    },
  }
};

export default adapter;