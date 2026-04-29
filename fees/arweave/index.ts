import type { FetchOptions, } from "../../adapters/types";
import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";
import { httpGet, httpPost } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const ARWEAVE_GATEWAY = 'https://arweave.net';
const ARWEAVE_GRAPHQL_ENDPOINT = `${ARWEAVE_GATEWAY}/graphql`;
const WINSTON_PER_AR = 1e12;
const TRANSACTIONS_PAGE_SIZE = 1000;
const GRAPHQL_PAGE_DELAY_MS = 250;

type ArweaveInfo = {
  height: number;
};

type ArweaveBlock = {
  height: number;
  timestamp: number;
};

type ArweaveTransactionsResponse = {
  data?: {
    transactions?: {
      pageInfo: {
        hasNextPage: boolean;
      };
      edges: Array<{
        cursor: string;
        node: {
          fee?: {
            winston?: string;
          };
        };
      }>;
    };
  };
  errors?: unknown[];
};

// `bundledIn: null` keeps the sum to base-layer transactions and excludes
// indexed bundle data items that do not pay separate L1 fees.
const TRANSACTIONS_QUERY = `
  query Transactions($first: Int!, $after: String, $minBlock: Int!, $maxBlock: Int!) {
    transactions(
      first: $first
      after: $after
      sort: HEIGHT_ASC
      block: { min: $minBlock, max: $maxBlock }
      bundledIn: null
    ) {
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

const arweaveGraphQL = async <T>(query: string, variables: Record<string, unknown>) => withRetry<T>(() => httpPost(ARWEAVE_GRAPHQL_ENDPOINT, {
  query,
  variables,
}, {
  headers: {
    'content-type': 'application/json',
  },
}));

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

const fetchTransactionFees = async (minBlock: number, maxBlock: number) => {
  if (maxBlock < minBlock) return 0n;

  let after: string | undefined;
  let totalWinston = 0n;

  do {
    const response = await arweaveGraphQL<ArweaveTransactionsResponse>(TRANSACTIONS_QUERY, {
      first: TRANSACTIONS_PAGE_SIZE,
      after,
      minBlock,
      maxBlock,
    });

    if (response.errors?.length) throw new Error(`Arweave GraphQL returned ${response.errors.length} error(s)`);

    const transactions = response.data?.transactions;
    if (!transactions) throw new Error('Arweave GraphQL response did not include transactions');

    transactions.edges.forEach(({ node }) => {
      totalWinston += BigInt(node.fee?.winston ?? '0');
    });

    if (transactions.pageInfo.hasNextPage) {
      const nextCursor = transactions.edges[transactions.edges.length - 1]?.cursor;
      if (!nextCursor) {
        throw new Error(`Arweave GraphQL returned hasNextPage=true with ${transactions.edges.length} edge(s)`);
      }
      after = nextCursor;
    } else {
      after = undefined;
    }

    if (after) await sleep(GRAPHQL_PAGE_DELAY_MS);
  } while (after);

  return totalWinston;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const latestHeight = await getLatestHeight();
  const startHeight = await findFirstBlockAtOrAfter(options.startOfDay, latestHeight);
  const nextDayHeight = await findFirstBlockAtOrAfter(options.startOfDay + 24 * 60 * 60, latestHeight);
  const totalWinston = await fetchTransactionFees(startHeight, nextDayHeight - 1);

  const tokenAmount = new BigNumber(totalWinston.toString()).div(WINSTON_PER_AR).toNumber();

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('arweave', tokenAmount)

  return {
    dailyFees
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
  skipBreakdownValidation: true,
  methodology: {
    Fees: 'Transaction fees paid by users in AR. Fees are sourced directly from the Arweave gateway by locating the daily block range and summing fee.winston values for base-layer transactions returned by Arweave GraphQL.'
  }
}

export default adapter;
