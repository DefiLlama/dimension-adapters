import { CHAIN } from "../../helpers/chains";
import type { Adapter, FetchResult } from "../../adapters/types";
import { request, gql } from "graphql-request";
import BigNumber from "bignumber.js";

import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { getEnv } from "../../helpers/env";

const SMARDEX_SUBGRAPH_API_KEY = getEnv('SMARDEX_SUBGRAPH_API_KEY')
const SMARDEX_SUBGRAPH_GATEWAY = "https://subgraph.smardex.io/defillama";

// Headers for GraphQL requests that require an API key
const defaultHeaders = {
  "x-api-key": SMARDEX_SUBGRAPH_API_KEY,
};

// Default fees for each chain
const FEES = {
  [CHAIN.ETHEREUM]: { LP_FEES: 0.0005, POOL_FEES: 0.0002 },
  [CHAIN.BSC]: { LP_FEES: 0.0007, POOL_FEES: 0.0003 },
  [CHAIN.POLYGON]: { LP_FEES: 0.0007, POOL_FEES: 0.0003 },
  [CHAIN.ARBITRUM]: { LP_FEES: 0.0007, POOL_FEES: 0.0003 },
  [CHAIN.BASE]: { LP_FEES: 0.0007, POOL_FEES: 0.0003 },
} as { [chain: string]: { LP_FEES: number; POOL_FEES: number } };

// SDEX contract creation timestamps for each chain
const CHAIN_STARTS = {
  [CHAIN.ETHEREUM]: 1678404995,
  [CHAIN.BSC]: 1688978540,
  [CHAIN.POLYGON]: 1682085480,
  [CHAIN.ARBITRUM]: 1688976153,
  [CHAIN.BASE]: 1691491872,
} as { [chain: string]: number };

// Methodology descriptions
const FEES_METHODOLOGY = `
A minor fee is collected on each swap, functioning as trading fees.
The fees are set at 0.07% on Ethereum and 0.1% on other chains.
On other networks, fees may vary between different pairs and chains.
Refer to https://docs.smardex.io/overview/what-is-smardex/fees for detailed information.
`;

const methodology = {
  UserFees: FEES_METHODOLOGY,
  Fees: FEES_METHODOLOGY,
  Revenue: `0.02% of each swap on Ethereum is collected for staking pool (SDEX holders that staked). On other chains, fees are collected for liquidity providers and fees may vary between different pairs and chains. Refer to https://docs.smardex.io/overview/what-is-smardex/fees for detailed information.`,
  ProtocolRevenue: `Protocol has no revenue.`,
  SupplySideRevenue: `0.05% of each swap on Ethereum is collected for liquidity providers. On other chains, fees collected for liquidity providers and fees may vary between different pairs and chains. Refer to https://docs.smardex.io/overview/what-is-smardex/fees for detailed information.`,
  HoldersRevenue: `0.02% of each swap on Ethereum is collected for staking pool (SDEX holders that staked). On other chains staking is not available and fees are collected for buybacks SDEX and burns.`,
};

// Define the adapter
const adapter: Adapter = { version: 1, adapter: {}, methodology, };
for (let chain in FEES) {
  adapter.adapter![chain] = {
    fetch: (timestamp: number) =>
      feesFromSubgraph(timestamp, chain.toLocaleLowerCase()),
    start: CHAIN_STARTS[chain],
  };
}

/**
 * Fetch fees from the subgraph for a given timestamp and chain.
 *
 * @param time - the timestamp to fetch fees at.
 * @param chain - the blockchain tag.
 * @returns Promise containing fetch results.
 */
export async function feesFromSubgraph(
  time: number,
  chain: string
): Promise<FetchResult> {
  const dayId = Math.floor(time / 86400);
  const timestamp = getTimestampAtStartOfDayUTC(time);
  const graphQuery = gql`
    {
      feeDayData(id: ${dayId}) {
        dailyFeesPoolUSD
        dailyFeesLpUSD
        totalFeesPoolUSD
        totalFeesLpUSD
      }
    }
  `;

  const url = `${SMARDEX_SUBGRAPH_GATEWAY}/${chain}`;
  const graphRes = await request(url, graphQuery, undefined, defaultHeaders);
  const fees = graphRes["feeDayData"];

  // If the day is not available, fees are 0
  if (!fees) return { timestamp };

  const dailyFees = new BigNumber(fees.dailyFeesPoolUSD)
    .plus(new BigNumber(fees.dailyFeesLpUSD))
    .toString();
  const totalFees = new BigNumber(fees.totalFeesPoolUSD)
    .plus(new BigNumber(fees.totalFeesLpUSD))
    .toString();
  const dailyRevenue = new BigNumber(fees.dailyFeesLpUSD).toString();
  const totalRevenue = new BigNumber(fees.totalFeesLpUSD).toString();

  return {
    timestamp,
    dailyFees,
    totalFees,
    dailyRevenue,
    totalRevenue,
  };
}

export default adapter;
