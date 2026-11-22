import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { METRIC } from "../helpers/metrics";

// ASER (https://aser.trade) is a non-custodial memecoin trading terminal. Every swap made through it
// pays a fixed 1% fee, inside the same transaction, to this wallet.
const FEE_WALLET = '5VmZHp6GwbLBHsp4f1CRogWV7RcfSk2KdSuxdyMe8LqD'
const LABEL_TO_ASER = 'Trading Fees to ASER'

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const res = await queryAllium(`
    SELECT t.mint as token, SUM(t.raw_amount) as amount
    FROM solana.assets.transfers t
    WHERE t.to_address IN ('${FEE_WALLET}')
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND t.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND NOT EXISTS (
        SELECT 1
        FROM solana.assets.transfers o
        WHERE o.txn_id = t.txn_id
          AND o.from_address IN ('${FEE_WALLET}')
          AND o.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
          AND o.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      )
    GROUP BY t.mint
  `)

  res.forEach((row: any) => {
    dailyFees.add(row.token, row.amount, METRIC.TRADING_FEES)
    dailyRevenue.add(row.token, row.amount, LABEL_TO_ASER)
  })

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fixed 1% fee on every swap made through ASER, paid by the user inside the swap transaction.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Fixed 1% fee on every swap made through ASER, paid by the user inside the swap transaction.",
  },
  Revenue: {
    [LABEL_TO_ASER]: "The full 1% trading fee is received by ASER's fee wallet.",
  },
  ProtocolRevenue: {
    [LABEL_TO_ASER]: "The full 1% trading fee is received by ASER's fee wallet.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2026-11-01',
    },
  },
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Trading fees paid by users: a fixed 1% of every swap made through ASER, received by ASER's fee wallet.",
    UserFees: "Trading fees paid by users: a fixed 1% of every swap made through ASER.",
    Revenue: "All trading fees received by the fee wallet are collected by ASER.",
    ProtocolRevenue: "All trading fees received by the fee wallet are collected by ASER.",
  },
  breakdownMethodology,
};

export default adapter;
