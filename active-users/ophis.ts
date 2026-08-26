import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { fetchOphisChainDay, ophisChainConfig } from "../helpers/ophis";

const fetch = async (options: FetchOptions) => {
  const row = await fetchOphisChainDay(options);
  return {
    dailyActiveUsers: row?.users ?? 0,
    dailyTransactionsCount: row?.transactions ?? 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: ophisChainConfig,
  methodology: {
    ActiveUsers: "Unique Ophis-attributed user wallets with at least one successfully settled fill during the UTC day, sourced from Ophis' validated settlement-fill ledger.",
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
