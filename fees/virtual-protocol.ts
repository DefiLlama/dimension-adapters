import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";


const prefetch = async (options: FetchOptions) => {
  const sql_query = getSqlFromFile('helpers/queries/virtual-protocol.sql', { startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp })
  return await queryDuneSql(options, sql_query);
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const results = options.preFetchedResults || [];
  const chainData = results.find((item: any) => item.chain === options.chain);
  if (chainData) {
    dailyFees.addCGToken('virtual-protocol', chainData.virtual_fees);
    dailyFees.addCGToken('coinbase-wrapped-btc', chainData.cbbtc_fees);
    // New 1% platform fee, collected in USD stablecoins (USDC on Base, USDG on Robinhood).
    dailyFees.addUSDValue(chainData.usd_fees);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: 'Revenue from Virtual Protocol across several streams: 1) Base Virtual-fun (legacy buy/sell transactions), 2) Base Virtual-app (legacy non-trading), 3) Base CBBTC-prototype (direct transfers to prototype wallet), 4) Base CBBTC-sentient (outflows from tax manager representing agent treasury distributions), 5) the new 1% platform fee collected in USD stablecoins (USDC on Base, USDG on Robinhood) to the platform tax wallet. Also includes Ethereum VIRTUAL transfers to the protocol dev/ecosystem wallet. Individual ecosystem and treasury transfers are replaced by the tax manager outflow method to avoid double counting.',
  Revenue: 'Fees collected by the Protocol.',
  ProtocolRevenue: 'Revenue from all sources to the Protocol.',
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.BASE]: { start: "2024-10-15", },
    [CHAIN.ETHEREUM]: { start: "2025-06-11", },
    [CHAIN.ROBINHOOD]: { start: "2026-07-02", },
  },
  prefetch,
  dependencies: [Dependencies.DUNE],
  methodology,
  isExpensiveAdapter: true,
}

export default adapter;
