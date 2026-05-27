import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const OP_DEBT_MANAGER = '0x0078C5a459132e279056B2371fE8A8eC973A9553';
const APR = 0.04;
const USD_DECIMALS = 1e6;
const totalBorrowingAmountsAbi =
  'function totalBorrowingAmounts() view returns (tuple(address token, uint256 amount)[], uint256)';

async function fetchScroll(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const result = await queryDuneSql(options, `
    with

    target_day as (
        select cast(from_unixtime(${options.startOfDay}) as timestamp) as day
    ),

    hours as (
        select
            date_add('hour', h.hour, td.day) as hour
        from target_day td
        cross join unnest(sequence(0, 23)) as h(hour)
    ),

    events as (
        select
            date_trunc('hour', block_time) as hour,
            sum(case when event_type = 'borrow' then token_amount_usd else -token_amount_usd end) as amount
        from query_6819800
        where event_type in ('borrow', 'repay')
            and block_time < (select date_add('day', 1, day) from target_day)
        group by 1
    ),

    tokens_supply_cum as (
        select
            hour,
            sum(amount) over (order by hour) as token_supply,
            lead(hour, 1, current_timestamp) over (order by hour) as next_hour
        from events
    ),

    hourly_balance as (
        select
            h.hour,
            t.token_supply
        from tokens_supply_cum t
        inner join hours h
            on t.hour <= h.hour
            and h.hour < t.next_hour
    )

    select
        (cast(4 as double) / 100 * avg(token_supply)) / 365 as revenue_usd
    from hourly_balance
  `);
  const revenueUsd = Number(result?.[0]?.revenue_usd ?? 0);
  dailyFees.addUSDValue(revenueUsd, METRIC.BORROW_INTEREST);
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: 0 };
}

async function fetchOptimism(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const [startState, endState] = await Promise.all([
    options.fromApi.call({ target: OP_DEBT_MANAGER, abi: totalBorrowingAmountsAbi }),
    options.toApi.call({ target: OP_DEBT_MANAGER, abi: totalBorrowingAmountsAbi }),
  ]);
  const startDebtUsd = Number(startState[1]) / USD_DECIMALS;
  const endDebtUsd = Number(endState[1]) / USD_DECIMALS;
  const avgDebtUsd = (startDebtUsd + endDebtUsd) / 2;
  const dailyRevenueUsd = (avgDebtUsd * APR) / 365;

  dailyFees.addUSDValue(dailyRevenueUsd, METRIC.BORROW_INTEREST);
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyHoldersRevenue: 0 };
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  if (options.chain === CHAIN.SCROLL) return fetchScroll(options);
  else return fetchOptimism(options);
};

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.SCROLL]: { start: '2024-11-01', deadFrom: "2026-04-07" },
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