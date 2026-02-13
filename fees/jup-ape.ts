import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";
import { CHAIN } from "../helpers/chains";
import { JUPITER_METRICS, jupBuybackRatioFromRevenue } from "./jupiter";

const JUP_FEE_RECEIVER = '5YET3YapxD6to6rqPqTWB3R9pSbURy6yduuUtoZkzoPX';

const fetch = async (_as: any, _b: any, options: FetchOptions) => {
  const query = `
    SELECT
      SUM(balance_change/1e9) AS total_fees
    FROM solana.account_activity
    WHERE address = '${JUP_FEE_RECEIVER}'
      AND balance_change > 0
      AND tx_success = true
      AND TIME_RANGE
  `;
  const res = await queryDuneSql(options, query);
  const apeFees = options.createBalances();

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addCGToken("solana", res[0].total_fees, JUPITER_METRICS.JupApeFees);
  dailyRevenue.addCGToken("solana", res[0].total_fees, JUPITER_METRICS.JupApeFees);
  
  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);
  const revenueHolders = dailyRevenue.clone(buybackRatio);
  const revenueProtocol = dailyRevenue.clone(1 - buybackRatio);
  dailyProtocolRevenue.add(revenueProtocol, JUPITER_METRICS.JupApeFees);
  dailyHoldersRevenue.add(revenueHolders, JUPITER_METRICS.TokenBuyBack);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
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
    ProtocolRevenue: 'Share of 50% fees collected by protocol, it was 100% before 2025-02-17.',
    HoldersRevenue: 'From 2025-02-17, share of 50% fees to buy back JUP tokens.',
  },
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.JupApeFees]: 'Token trading and launching fees',
    },
    Revenue: {
      [JUPITER_METRICS.JupApeFees]: 'All token trading and launching fees are revenue.',
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupApeFees]: 'Share of 50% fees collected by protocol, it was 100% before 205-02-17.',
    },
    HoldersRevenue: {
      [JUPITER_METRICS.TokenBuyBack]: 'From 2025-02-17, share of 50% fees to buy back JUP tokens.',
    },
  }
};

export default adapter;
