import { Balances } from '@defillama/sdk';
import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

export async function oreHelperCountSolBalanceDiff(options: FetchOptions, target: string): Promise<Balances> {
  // Query for ORE protocol revenue
  const duneQueryString = `
      SELECT
        SUM(CASE WHEN post_balance > pre_balance THEN (post_balance - pre_balance) / 1e9 ELSE 0 END) AS total_sol_inbound
      FROM solana.account_activity
      WHERE
        address = '${target}'
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
        AND tx_success = true
  `;

  const results = await queryDuneSql(options, duneQueryString);
  
  const dailyFees = options.createBalances();
  if (results.length > 0) {
    const revenue = results[0].total_sol_inbound || 0;
    dailyFees.addCGToken("solana",revenue);
  }
  
  return dailyFees;
}

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await oreHelperCountSolBalanceDiff(options, '45db2FSR4mcXdSVVZbKbwojU6uYDpMyhpEi7cC8nHaWG')

  const dailyProtocolRevenue = dailyFees.clone(0.01);
  const dailyHoldersRevenue = dailyFees.clone(0.99);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyProtocolRevenue, dailyHoldersRevenue: dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-10-19',
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Calculate the zorb.supply tokens gathered from 10% of the total SOL allocated to zorb.supply boards and sent to the protocol wallet 6aAGoVq9jKywWXyvWwoUtZFxbjR5aLBtfjhQXP1xezA.",
    Revenue: "All collected zorb.supply fees count as revenue.",
    ProtocolRevenue: "1% of all zorb.supply revenue is allocated to the protocol treasury.",
    HoldersRevenue: "The remaining 99% of zorb.supply fees are used for zorb.supply buybacks and burns, with value distributed to zorb.supply stakers.",
  },
};

export default adapter;
