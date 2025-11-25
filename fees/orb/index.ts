import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()
  
  const duneQueryString = `
    SELECT
      SUM(CASE WHEN post_balance > pre_balance THEN (post_balance - pre_balance) / 1e9 ELSE 0 END) AS total_sol_inbound
    FROM solana.account_activity
    WHERE
      address = '6aAGoVq9jKywWXyvWwoUtZFxbjR5aLBtfjhQXP1xezA'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
      AND tx_success = true
  `;

  const results = await queryDuneSql(options, duneQueryString);
  if (results.length > 0) {
    const revenue = results[0].total_sol_inbound || 0;
    dailyFees.addCGToken("solana", revenue);
  }

  const dailyProtocolRevenue = dailyFees.clone(0.01);
  const dailyHoldersRevenue = dailyFees.clone(0.99);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailyHoldersRevenue: dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-11-16",
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Calculate the ore.blue tokens gathered from 10% of the total SOL allocated to ore.blue boards and sent to the protocol wallet 6aAGoVq9jKywWXyvWwoUtZFxbjR5aLBtfjhQXP1xezA.",
    Revenue: "All collected ore.blue fees count as revenue.",
    ProtocolRevenue: "1% of all ore.blue revenue is allocated to the protocol treasury.",
    HoldersRevenue: "The remaining 99% of ore.blue fees are used for ore.blue buybacks and burns, with value distributed to ore.blue stakers.",
  },
};

export default adapter;
