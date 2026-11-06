import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { AaveV4Hub, getAaveV4HubFee, METRICS } from "../../helpers/curators";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const OP_DEBT_MANAGER = '0x0078C5a459132e279056B2371fE8A8eC973A9553';
const APR = 0.04;
const USD_DECIMALS = 1e6;
const totalBorrowingAmountsAbi =
  'function totalBorrowingAmounts() view returns (tuple(address token, uint256 amount)[], uint256)';
// Since 2026-08-04 Cash borrows also sit on the Aave V4 instance ether.fi operates on OP Mainnet. Same Hub implementation
// bytecode as Aave's Ethereum Core hub, the Cash spoke 0xdffcc3536d932eb51df51a7f5fa407c4270d5308 is its only borrower, and
// the etherfi-cash-collateral-management TVL adapter already counts it. share: 80-20 ether.fi / Aave DAO on the instance's revenue, per
// https://governance.aave.com/t/arfc-deploy-a-dedicated-aave-v4-whitelabel-instance-fully-managed-by-etherfi-on-op-mainnet-to-power-ether-fi-cash/25314
const OP_CASH_HUBS: AaveV4Hub[] = [{ hub: '0x66753c4e3fC84f1eD0e3C267C927284E9d90C572', share: 0.8 }];

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
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const [startState, endState] = await Promise.all([
    options.fromApi.call({ target: OP_DEBT_MANAGER, abi: totalBorrowingAmountsAbi }),
    options.toApi.call({ target: OP_DEBT_MANAGER, abi: totalBorrowingAmountsAbi }),
  ]);
  const startDebtUsd = Number(startState[1]) / USD_DECIMALS;
  const endDebtUsd = Number(endState[1]) / USD_DECIMALS;
  const avgDebtUsd = (startDebtUsd + endDebtUsd) / 2;
  const dailyRevenueUsd = (avgDebtUsd * APR) / 365;

  dailyFees.addUSDValue(dailyRevenueUsd, METRIC.BORROW_INTEREST);
  dailyRevenue.addUSDValue(dailyRevenueUsd, METRIC.BORROW_INTEREST);

  await getAaveV4HubFee(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, OP_CASH_HUBS, true);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue: 0 };
}

const fetch = async (options: FetchOptions) => {
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
    Fees: "Total borrow interest generated from EtherFi Cash services on Scroll and OP Mainnet, including Cash borrows on the Aave V4 instance ether.fi operates, since 2026-08-04.",
    Revenue: "Protocol's share of fees from borrow interest: all of it on the DebtManager, 80% of the liquidity fee on the Aave V4 instance.",
    SupplySideRevenue: "Interest to suppliers of the Aave V4 instance after the liquidity fee, and the Aave DAO's 20% of that fee.",
    ProtocolRevenue: "Same as Revenue - all protocol earnings from EtherFi Cash on Scroll and OP Mainnet.",
    HoldersRevenue: "No revenue share to ETHFI holders",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Interest earned from EtherFi Cash lending operations on Scroll and OP Mainnet',
      [METRICS.AaveV4Yields]: 'Borrow interest on the Aave V4 instance ether.fi operates on OP Mainnet',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'Interest earned from EtherFi Cash lending operations on Scroll and OP Mainnet',
      [METRICS.AaveV4HubFee]: "ether.fi's 80% of the liquidity fee on its Aave V4 instance",
    },
    SupplySideRevenue: {
      [METRICS.AaveV4YieldsToSuppliers]: 'Interest paid to suppliers of the Aave V4 instance after the liquidity fee',
      [METRICS.AaveV4HubFeeToAave]: "The Aave DAO's 20% of the liquidity fee on the instance",
    },
  }
};

export default adapter;