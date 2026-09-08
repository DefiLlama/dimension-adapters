import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const FEE_WALLET = 'AVUCZyuT35YSuj4RH7fwiyPu82Djn2Hfg7y2ND2XcnZH'

// https://dune.com/adam_tehc/photon
const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
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
    dailyFees.add(row.token, row.amount)
  })

  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "All trading fees paid by users.",
    Revenue: "Trading fees are collected by Photon protocol."
  }
};

export default adapter;
