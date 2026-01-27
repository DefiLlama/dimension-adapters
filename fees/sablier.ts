import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request } from "graphql-request";

const chainConfig: Record<string, { endpoint: string; chainId: number }> = {
  [CHAIN.ETHEREUM]: {
    endpoint: "https://indexer.hyperindex.xyz/53b7e25/v1/graphql",
    chainId: 1,
  },
  [CHAIN.OPTIMISM]: {
    endpoint: "https://indexer.hyperindex.xyz/53b7e25/v1/graphql",
    chainId: 10,
  },
  [CHAIN.ARBITRUM]: {
    endpoint: "https://indexer.hyperindex.xyz/53b7e25/v1/graphql",
    chainId: 42161,
  },
  [CHAIN.BASE]: {
    endpoint: "https://indexer.hyperindex.xyz/53b7e25/v1/graphql",
    chainId: 8453,
  },
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
  const endpoint = chainConfig[chain].endpoint;
  const chainId = chainConfig[chain].chainId;
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
  fetch,
  adapter: chainConfig as any,
  methodology: {
    Fees: "Interface and contract fees paid by users for Lockup, Flow, and Airdrop products.",
    Revenue: "Portion of collected fees attributed to Sablier.",
  },
};

export default adapter;