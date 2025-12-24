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
    Fees: 'Count ORE tokens collected from 10% of total SOL deployed on ORE boards by protocol wallet 45db2FSR4mcXdSVVZbKbwojU6uYDpMyhpEi7cC8nHaWG.',
    Revenue: 'All ORE fees are revenue.',
    ProtocolRevenue: '1% of ORE revenue goes to the protocol treasury.',
    HoldersRevenue: '99% of ORE fees are used to buyback and burn ORE and distributed to ORE stakers.',
  },
};

export default adapter;
