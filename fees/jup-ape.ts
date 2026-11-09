import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";
import { CHAIN } from "../helpers/chains";
import { JUPITER_METRICS, jupTreasuryShare } from "./jupiter";

const JUP_FEE_RECEIVER = '5YET3YapxD6to6rqPqTWB3R9pSbURy6yduuUtoZkzoPX';

const fetch = async (options: FetchOptions) => {
  const query = `
    SELECT
      COALESCE(SUM(balance_change/1e9), 0) AS total_fees
    FROM solana.account_activity
    WHERE address = '${JUP_FEE_RECEIVER}'
      AND balance_change > 0
      AND tx_success = true
      AND TIME_RANGE
  `;
  const res = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  dailyFees.addCGToken("solana", res[0].total_fees, JUPITER_METRICS.JupApeFees);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees.clone(jupTreasuryShare(options.startOfDay)),
    dailyHoldersRevenue: 0, // JUP buybacks are counted on the Jupiter Aggregator listing
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.SOLANA],
  fetch,
  start: '2024-07-10',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Token trading and launching fees.',
    Revenue: 'All fees collected by protocol.',
    ProtocolRevenue: 'Half of fees, kept by the treasury. The other half buys back JUP, counted on the Jupiter Aggregator listing.',
    HoldersRevenue: 'No holders revenue on this listing: JUP buybacks are counted once, on the Jupiter Aggregator listing.',
  },
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.JupApeFees]: 'Token trading and launching fees',
    },
    Revenue: {
      [JUPITER_METRICS.JupApeFees]: 'All token trading and launching fees are revenue.',
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupApeFees]: 'Half of fees, kept by the treasury.',
    },
  }
};

export default adapter;
