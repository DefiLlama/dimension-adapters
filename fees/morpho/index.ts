import { request, } from 'graphql-request';
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";

const methodology = {
  Fees: 'Total borrow interest paid by borrowers.',
  SupplySideRevenue: 'Total interests are distributed to suppliers/lenders.',
  ProtocolRevenue: 'Total interests are distributed to Morpho.',
}

type MorphoMarket = {
  marketId: string;
  loanAsset: string;
};

type MorphoBlueAccrueInterestEvent = {
  token: string | undefined | null;
  interest: bigint;
}

const BLUE_API_ENDPOINT = "https://blue-api.morpho.org/graphql";

const query = `
  query GetMarketsData($chainId: Int!) {
    markets(where: { chainId_in: [$chainId] }) {
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
  [CHAIN.ETHEREUM] : {
    chainId: 1,
    blue: '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb',
  },
  [CHAIN.BASE] : {
    chainId: 8453,
    blue: '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb',
  },
}

const MorphoBlueAbis = {
  AccrueInterest: 'event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)',
}

const _fetchMarkets = async (chainId: number, url: string): Promise<Array<MorphoMarket>> => {
  const res = await request(url, query, { chainId });

  return res.markets.items.map((item: any) => {
    return {
      marketId: item.uniqueKey,
      loanAsset: item.loanAsset.address,
    }
  });
};

async function fetchMarkets(chainId: number, url: string): Promise<Array<MorphoMarket>> {
  return getConfig('morpho-blue/markets-'+chainId, '', {
    fetcher: async () => _fetchMarkets(chainId, url),
  })
}

const fetchEvents = async (options: FetchOptions): Promise<Array<MorphoBlueAccrueInterestEvent>> => {
  const markets = await fetchMarkets(MorphoBlues[options.chain].chainId, BLUE_API_ENDPOINT)
  const marketMap = {} as any
  markets.forEach((item) => {
    marketMap[item.marketId.toLowerCase()] = item.loanAsset
  })

  return (await options.getLogs({
    eventAbi: MorphoBlueAbis.AccrueInterest,
    target: MorphoBlues[options.chain].blue,
  })).map((log: any) => {
    return {
      token: marketMap[String(log.id).toLowerCase()],
      interest: BigInt(log.interest),
    }
  })
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const events = await fetchEvents(options)
  for (const event of events) {
    if (event.token) {
      dailyFees.add(event.token, event.interest)
    }
  }

  return {
    dailyFees: dailyFees,
    dailySupplySideRevenue: dailyFees,

    // Morpho gets no fees
    dailyProtocolRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    ethereum: {
      fetch: fetch,
      start: '2024-01-02',
      meta: {
        methodology,
      }
    },
    base: {
      fetch: fetch,
      start: '2024-05-03',
      meta: {
        methodology,
      }
    },
  },
  version: 2,
};

export default adapter;
