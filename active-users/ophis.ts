import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchOphisChainDay, fetchOphisProtocolDay, OPHIS_START, ophisChainConfig } from "../helpers/ophis";

const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.CHAIN_GLOBAL) {
    const totals = await fetchOphisProtocolDay(options);
    return {
      dailyActiveUsers: totals.users,
      dailyTransactionsCount: totals.transactions,
    };
  }

  const row = await fetchOphisChainDay(options);
  return {
    dailyActiveUsers: row?.users ?? 0,
    dailyTransactionsCount: row?.transactions ?? 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  // Per-chain user counts are not additive when one wallet uses multiple chains.
  // chain_global supplies DefiLlama's aggregate while retaining chain breakdowns.
  adapter: {
    ...ophisChainConfig,
    [CHAIN.CHAIN_GLOBAL]: { start: OPHIS_START },
  },
  methodology: {
    ActiveUsers: "Unique Ophis-attributed user wallets with at least one successfully settled fill during the UTC day, deduplicated across all supported chains and sourced from Ophis' validated settlement-fill ledger.",
    Transactions: "Distinct onchain settlement transaction hashes containing successfully settled Ophis-attributed fills during the UTC day.",
  },
  breakdownMethodology: {
    ActiveUsers: {
      "Ophis traders": "Unique attributed user wallets across successfully settled Ophis fills.",
    },
    Transactions: {
      "Ophis settlements": "Distinct settlement transaction hashes; multiple fills in one transaction are counted once.",
    },
  },
};

export default adapter;
