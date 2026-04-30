import type { FetchOptions, } from "../../adapters/types";
import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import PromisePool from '@supercharge/promise-pool';
import BigNumber from "bignumber.js";
import { httpGet, httpPost } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const ARWEAVE_GATEWAY = 'https://arweave.net';
const ARWEAVE_GRAPHQL = `${ARWEAVE_GATEWAY}/graphql`;
const VIEWBLOCK_FEES_URL = 'https://api.viewblock.io/arweave/stats/advanced/charts/txFees?network=mainnet';
const DAY_SECONDS = 24 * 60 * 60;
const WINSTON_PER_AR = 1e12;
const GRAPHQL_BLOCK_CHUNK_SIZE = 3;
const GRAPHQL_CONCURRENCY = 24;
const GRAPHQL_PAGE_SIZE = 100;
const GRAPHQL_REQUEST_TIMEOUT_MS = 1000;
const GRAPHQL_TOTAL_BUDGET_MS = 3000;
const ARWEAVE_FEES_LABEL = 'Transaction Fees';

type ArweaveInfo = {
  height: number;
};

type ArweaveBlock = {
  height: number;
  timestamp: number;
  txs?: string[];
};

type ViewBlockFeesResponse = {
  day?: {
    data?: [number[], string[]];
  };
};

type ArweaveGraphqlTransactionEdge = {
  cursor?: string;
  node?: {
    fee?: {
      winston?: string;
    };
  };
};

type ArweaveGraphqlResponse = {
  data?: {
    transactions?: {
      pageInfo?: {
        hasNextPage?: boolean;
      };
      edges?: ArweaveGraphqlTransactionEdge[];
    };
  };
  errors?: { message?: string }[];
};

class ArweaveGraphqlBudgetExceededError extends Error {
  constructor() {
    super(`Arweave GraphQL fee aggregation exceeded ${GRAPHQL_TOTAL_BUDGET_MS}ms budget`);
  }
}

const withRetry = async <T>(action: () => Promise<T>, retries = 3): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep((attempt + 1) * 1000);
    }
  }

  throw lastError;
}

const arweaveGet = async <T>(path: string) => withRetry<T>(() => httpGet(`${ARWEAVE_GATEWAY}${path}`));

const getLatestHeight = async () => {
  const info = await arweaveGet<ArweaveInfo>('/info');
  if (!Number.isInteger(info.height)) throw new Error('Could not read latest Arweave block height');
  return info.height;
}

const getBlockTimestamp = async (height: number) => {
  const block = await arweaveGet<ArweaveBlock>(`/block/height/${height}`);
  if (!Number.isInteger(block.timestamp)) throw new Error(`Could not read timestamp for Arweave block ${height}`);
  return block.timestamp;
}

const findFirstBlockAtOrAfter = async (timestamp: number, latestHeight: number) => {
  let low = 0;
  let high = latestHeight + 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const blockTimestamp = await getBlockTimestamp(mid);

    if (blockTimestamp < timestamp) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

const fetchViewBlockFees = async (startOfDay: number) => {
  const data = await withRetry<ViewBlockFeesResponse>(() => httpGet(VIEWBLOCK_FEES_URL, {
    headers: {
      origin: 'https://arscan.io'
    }
  }));

  const timestamps = data.day?.data?.[0];
  const fees = data.day?.data?.[1];
  if (!Array.isArray(timestamps) || !Array.isArray(fees)) throw new Error('ViewBlock did not return Arweave fee chart data');

  const dayTimestamp = startOfDay * 1000;
  const index = timestamps.findIndex((timestamp) => timestamp === dayTimestamp);
  if (index === -1) return undefined;

  const fee = new BigNumber(fees[index]);
  if (!fee.isFinite()) throw new Error(`Invalid ViewBlock Arweave fee value for ${new Date(dayTimestamp).toISOString()}`);

  return fee;
}

const fetchGraphqlFeePage = async (minBlock: number, maxBlock: number, after?: string) => {
  const query = `
    query ArweaveTransactionFees($minBlock: Int!, $maxBlock: Int!, $first: Int!, $after: String) {
      transactions(first: $first, after: $after, block: { min: $minBlock, max: $maxBlock }) {
        pageInfo {
          hasNextPage
        }
        edges {
          cursor
          node {
            fee {
              winston
            }
          }
        }
      }
    }
  `;

  const response = await withRetry<ArweaveGraphqlResponse>(() => httpPost(
    ARWEAVE_GRAPHQL,
    {
      query,
      variables: {
        minBlock,
        maxBlock,
        first: GRAPHQL_PAGE_SIZE,
        after,
      },
    },
    { timeout: GRAPHQL_REQUEST_TIMEOUT_MS },
  ));

  if (response.errors?.length) {
    throw new Error(`Arweave GraphQL fee query failed: ${response.errors.map(error => error.message).join('; ')}`);
  }

  const transactions = response.data?.transactions;
  if (!transactions || !Array.isArray(transactions.edges)) {
    throw new Error(`Arweave GraphQL did not return transactions for blocks ${minBlock}-${maxBlock}`);
  }

  return transactions;
}

const assertWithinGraphqlBudget = (deadline: number) => {
  if (Date.now() > deadline) throw new ArweaveGraphqlBudgetExceededError();
}

const sumGraphqlFeeRange = async ({ minBlock, maxBlock }: { minBlock: number, maxBlock: number }, deadline: number) => {
  let after: string | undefined;
  let totalWinston = 0n;

  do {
    assertWithinGraphqlBudget(deadline);
    const transactions = await fetchGraphqlFeePage(minBlock, maxBlock, after);
    const edges = transactions.edges;

    for (const edge of edges) {
      const winston = edge.node?.fee?.winston;
      if (!winston || !/^\d+$/.test(winston)) throw new Error(`Invalid Arweave fee value in blocks ${minBlock}-${maxBlock}`);
      totalWinston += BigInt(winston);
    }

    after = transactions.pageInfo?.hasNextPage
      ? edges[edges.length - 1]?.cursor
      : undefined;

    if (transactions.pageInfo?.hasNextPage && !after) {
      throw new Error(`Arweave GraphQL pagination inconsistency for blocks ${minBlock}-${maxBlock}: hasNextPage=true without cursor`);
    }
  } while (after);

  return totalWinston;
}

const chunkBlockRange = (startHeight: number, endHeight: number) => {
  const chunks = [];
  for (let minBlock = startHeight; minBlock <= endHeight; minBlock += GRAPHQL_BLOCK_CHUNK_SIZE) {
    chunks.push({
      minBlock,
      maxBlock: Math.min(minBlock + GRAPHQL_BLOCK_CHUNK_SIZE - 1, endHeight),
    });
  }
  return chunks;
}

const fetchGatewayFees = async (options: FetchOptions) => {
  const latestHeight = await getLatestHeight();
  const startHeight = await findFirstBlockAtOrAfter(options.startOfDay, latestHeight);
  const nextDayHeight = await findFirstBlockAtOrAfter(options.startOfDay + DAY_SECONDS, latestHeight);
  if (nextDayHeight <= startHeight) return new BigNumber(0);

  const deadline = Date.now() + GRAPHQL_TOTAL_BUDGET_MS;
  let graphQLError: unknown;
  const chunks = chunkBlockRange(startHeight, nextDayHeight - 1);
  const { results, errors } = await PromisePool
    .withConcurrency(GRAPHQL_CONCURRENCY)
    .for(chunks)
    .handleError((error, _chunk, pool) => {
      graphQLError = error;
      pool.stop();
    })
    .process(async (chunk) => {
      assertWithinGraphqlBudget(deadline);
      return sumGraphqlFeeRange(chunk, deadline);
    });
  if (graphQLError) throw graphQLError;
  if (errors.length) throw errors[0];

  const totalWinston = results.reduce((total, reward) => total + reward, 0n);
  return new BigNumber(totalWinston.toString()).div(WINSTON_PER_AR);
}

const getDailyFees = async (options: FetchOptions) => {
  try {
    return await fetchGatewayFees(options);
  } catch (error) {
    console.error(`Failed to fetch Arweave fees from gateway GraphQL, falling back to ViewBlock: ${error instanceof Error ? error.message : error}`);
  }

  const viewBlockFees = await fetchViewBlockFees(options.startOfDay);
  if (viewBlockFees !== undefined) return viewBlockFees;
  throw new Error(`ViewBlock did not return Arweave fees for ${new Date(options.startOfDay * 1000).toISOString()}`);
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const tokenAmount = (await getDailyFees(options)).toNumber();

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('arweave', tokenAmount, ARWEAVE_FEES_LABEL)

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
  }
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ARWEAVE]: {
      fetch,
      start: '2018-06-08',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users in AR. Daily totals are sourced from Arweave gateway GraphQL by locating the UTC day block range and summing each transaction fee.winston value. ViewBlock/Arscan is kept only as a recovery fallback if the gateway is unavailable.',
    SupplySideRevenue: 'Transaction fees are paid to Arweave miners/storage providers.',
    Revenue: 'No protocol revenue is reported for Arweave transaction fees.',
  },
  breakdownMethodology: {
    [ARWEAVE_FEES_LABEL]: 'Base-layer AR transaction fees summed from Arweave gateway GraphQL fee.winston values for transactions confirmed in the UTC day block range.',
  },
}

export default adapter;
