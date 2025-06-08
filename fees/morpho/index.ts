import { request } from "graphql-request";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";

const methodology = {
  Fees: "Total borrow interest paid by borrowers.",
  SupplySideRevenue: "Total interests are distributed to suppliers/lenders.",
  ProtocolRevenue: "Total interests are distributed to Morpho.",
};

type MorphoMarket = {
  marketId: string;
  loanAsset: string;
};

type MorphoBlueAccrueInterestEvent = {
  token: string | undefined | null;
  interest: bigint;
};

const BLUE_API_ENDPOINT = "https://blue-api.morpho.org/graphql";

const query = `
  query GetMarketsData($chainId: Int!, $first: Int!, $skip: Int!) {
    markets(where: { chainId_in: [$chainId], whitelisted: true }, first: $first, skip: $skip) {
      items {
        uniqueKey
        loanAsset {
          address
        }
      }
    }
  }
`;

const MorphoBlues = {
  [CHAIN.ETHEREUM]: {
    chainId: 1,
    blue: "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb",
  },
  [CHAIN.BASE]: {
    chainId: 8453,
    blue: "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb",
  },
  [CHAIN.POLYGON]: {
    chainId: 137,
    blue: "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67",
  },
  [CHAIN.UNICHAIN]: {
    chainId: 130,
    blue: "0x8f5ae9cddb9f68de460c77730b018ae7e04a140a",
  },
};

const MorphoBlueAbis = {
  AccrueInterest:
    "event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)",
};

const _fetchMarkets = async (
  chainId: number,
  url: string
): Promise<Array<MorphoMarket>> => {
  let allMarkets: Array<MorphoMarket> = [];
  let skip = 0;
  const first = 300;
  let marketsBatch;
  do {
    const res = await request(url, query, { chainId, first, skip });
    marketsBatch = res.markets.items.map((item: any) => {
      return {
        marketId: item.uniqueKey,
        loanAsset: item.loanAsset.address,
      };
    });
    allMarkets = allMarkets.concat(marketsBatch);
    skip += first;
  } while (marketsBatch.length === first);

  return allMarkets;
};

async function fetchMarkets(
  chainId: number,
  url: string
): Promise<Array<MorphoMarket>> {
  return getConfig("morpho-blue/markets-" + chainId, "", {
    fetcher: async () => _fetchMarkets(chainId, url),
  });
}

const fetchEvents = async (
  options: FetchOptions
): Promise<Array<MorphoBlueAccrueInterestEvent>> => {
  const markets = await fetchMarkets(
    MorphoBlues[options.chain].chainId,
    BLUE_API_ENDPOINT
  );
  const marketMap = {} as any;
  markets.forEach((item) => {
    marketMap[item.marketId.toLowerCase()] = item.loanAsset;
  });

  return (
    await options.getLogs({
      eventAbi: MorphoBlueAbis.AccrueInterest,
      target: MorphoBlues[options.chain].blue,
    })
  ).map((log: any) => {
    return {
      token: marketMap[String(log.id).toLowerCase()],
      interest: BigInt(log.interest),
    };
  });
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const events = await fetchEvents(options);
  for (const event of events) {
    if (event.token) {
      dailyFees.add(event.token, event.interest);
    }
  }

  return {
    dailyFees: dailyFees,
    dailySupplySideRevenue: dailyFees,

    // Morpho gets no fees
    dailyProtocolRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    ethereum: {
      fetch: fetch,
      start: "2024-01-02",
      meta: {
        methodology,
      },
    },
    base: {
      fetch: fetch,
      start: "2024-05-03",
      meta: {
        methodology,
      },
    },
    polygon: {
      fetch: fetch,
      start: "2025-01-20",
      meta: {
        methodology,
      },
    },
    unichain: {
      fetch: fetch,
      start: "2025-02-18",
      meta: {
        methodology,
      },
    },
  },
  version: 2,
};

export default adapter;
