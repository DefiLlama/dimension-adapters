import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { addTokensReceived } from "../helpers/token";

const ARC_VIRTUAL = '0x8c4252c87081c88c6ad57d6dd97e1cafebf842b7'
const ARC_FEE_RECEIVERS = [
  '0x79f156c614ee6b68cd161366903f27af0f61ef8f',
  '0x86cbac9d9ac726f729eef6627dc4817bcbb03a9c',
]

const fetchArc = async (options: FetchOptions) => {
  const received = await addTokensReceived({
    options,
    tokens: [ARC_VIRTUAL],
    targets: ARC_FEE_RECEIVERS,
  })

  const dailyFees = options.createBalances()
  const taxed = received.getBalances()[`${CHAIN.ARC}:${ARC_VIRTUAL}`] ?? '0'
  dailyFees.addCGToken('virtual-protocol', Number(taxed) / 1e18)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const prefetch = async (options: FetchOptions) => {
  const sql_query = getSqlFromFile('helpers/queries/virtual-protocol.sql', { startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp })
  return await queryDuneSql(options, sql_query);
}

const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.ARC) return fetchArc(options);

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
  Fees: 'Revenue from Virtual Protocol across several streams: 1) Base Virtual-fun (legacy buy/sell transactions), 2) Base Virtual-app (legacy non-trading), 3) Base CBBTC-prototype (direct transfers to prototype wallet), 4) Base CBBTC-sentient (outflows from tax manager representing agent treasury distributions), 5) the new 1% platform fee collected in USD stablecoins (USDC on Base, USDG on Robinhood) to the platform tax wallet, 6) Arc, where the current-generation bonding stack went live 2026-09-14 and the FRouter pushes its 1% buy/sell tax into the FFactory tax vault as VIRTUAL, accrued at trade time and read from chain logs rather than Dune, together with the flat launch fee paid in VIRTUAL to the same Virtuals fee wallet Base uses, and 7) Solana, in two parts: the pre-DBC bonding tax collected as VIRTUAL from 2025-02, and from 2026-08-21 the trading tax distributed in JupUSD, the Solana analogue of the USDC and USDG legs and likewise covering bonding and post-graduation trading alike. Also includes Ethereum VIRTUAL transfers to the protocol dev/ecosystem wallet. Individual ecosystem and treasury transfers are replaced by the tax manager outflow method to avoid double counting.',
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
    [CHAIN.SOLANA]: { start: "2025-02-11", },
    [CHAIN.ARC]: { start: "2026-09-15", },
  },
  prefetch,
  dependencies: [Dependencies.DUNE],
  methodology,
  isExpensiveAdapter: true,
}

export default adapter;
