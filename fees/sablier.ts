import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request } from "graphql-request";

const ENVIO_ENDPOINTS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "https://indexer.hyperindex.xyz/53b7e25/v1/graphql",
  [CHAIN.OPTIMISM]: "https://indexer.hyperindex.xyz/53b7e25/v1/graphql",
  [CHAIN.ARBITRUM]: "https://indexer.hyperindex.xyz/53b7e25/v1/graphql",
  [CHAIN.BASE]: "https://indexer.hyperindex.xyz/53b7e25/v1/graphql",
};

const CHAIN_IDS: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.BASE]: 8453,
};

// Fetch only fee-enabled contracts (exclude legacy)
const CONTRACT_QUERY = `
query getContracts($chainId: numeric!) {
  Contract(where: {
    chainId: { _eq: $chainId }
    category: { _nin: ["LEGACY"] }
  }) {
    address
    category
  }
}
`;

async function getFeeContracts(chain: string) {
  const endpoint = ENVIO_ENDPOINTS[chain];
  const chainId = CHAIN_IDS[chain];
  if (!endpoint || !chainId) return [];

  const res = await request(endpoint, CONTRACT_QUERY, { chainId });
  if (!res?.Contract) return [];

  return res.Contract.map((c: any) => c.address);
}

const fetch = async ({ chain, createBalances, getLogs }: FetchOptions) => {
  const dailyFees = createBalances();

  const targets = await getFeeContracts(chain);
  if (!targets.length) return {};

  const airdropLogs = await getLogs({
    topics: ["0x1dcd2362ae467d43bf31cbcac0526c0958b23eb063e011ab49a5179c839ed9a9"],
    targets,
  });

  const streamLogs = await getLogs({
    topics: ["0x1a7b0d6c8f96b874563b711cf97793fe3be5dc42dbd1e0720ce40f326918e817"],
    targets,
  });

  const lockupLogs = await getLogs({
    topics: ["0x40b88e5c41c5a97ffb7b6ef88a0a2d505aa0c634cf8a0275cb236ea7dd87ed4d"],
    targets,
  });

  dailyFees.addUSDValue(
    airdropLogs.length * 3 +
    streamLogs.length +
    lockupLogs.length
  );

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: [CHAIN.ETHEREUM, CHAIN.OPTIMISM, CHAIN.ARBITRUM, CHAIN.BASE].reduce(
    (acc, chain) => ({
      ...acc,
      [chain]: { fetch },
    }),
    {}
  ),
  methodology: {
    Fees: "Interface and contract fees paid by users for Lockup, Flow, and Airdrop products.",
    Revenue: "Portion of collected fees attributed to Sablier.",
  },
};

export default adapter;