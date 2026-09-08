import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { createFactoryExports } from "./registry";

// Registry of chain active-users adapters that all read a per-chain
// `<duneTable>.transactions` table on Dune, counting distinct `"from"` senders
// and total transactions over the requested time range. To add a chain, append
// one row here — no new file needed.
const CHAINS: { protocol: string; chain: string; duneTable: string; start: string }[] = [
  { protocol: "cronos", chain: CHAIN.CRONOS, duneTable: "cronos", start: "2021-11-08" },
  { protocol: "hyperevm", chain: CHAIN.HYPERLIQUID, duneTable: "hyperevm", start: "2025-02-18" },
  { protocol: "kaia", chain: CHAIN.KLAYTN, duneTable: "kaia", start: "2019-06-25" },
  { protocol: "mezo", chain: CHAIN.MEZO, duneTable: "mezo", start: "2025-05-06" },
  { protocol: "opbnb", chain: CHAIN.OP_BNB, duneTable: "opbnb", start: "2023-08-11" },
  { protocol: "sophon", chain: CHAIN.SOPHON, duneTable: "sophon", start: "2024-12-18" },
  { protocol: "taiko", chain: CHAIN.TAIKO, duneTable: "taiko", start: "2024-05-25" },
];

function buildAdapter(chain: string, duneTable: string, start: string): SimpleAdapter {
  const fetch = async (options: FetchOptions) => {
    const query = `
      SELECT
        COALESCE(COUNT(DISTINCT "from"), 0) AS user_count,
        COALESCE(COUNT(*), 0) AS transaction_count
      FROM ${duneTable}.transactions
      WHERE TIME_RANGE
    `;

    const result = await queryDuneSql(options, query);

    return {
      dailyActiveUsers: result[0].user_count,
      dailyTransactionsCount: result[0].transaction_count,
    };
  };

  return {
    version: 1,
    fetch,
    chains: [chain],
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    protocolType: ProtocolType.CHAIN,
    start,
  };
}

const protocols: Record<string, SimpleAdapter> = {};
for (const { protocol, chain, duneTable, start } of CHAINS) {
  protocols[protocol] = buildAdapter(chain, duneTable, start);
}

export const { protocolList, getAdapter } = createFactoryExports(protocols);
