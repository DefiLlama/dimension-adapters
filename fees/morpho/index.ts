const { request, gql } = require("graphql-request");
import { Balances } from "@defillama/sdk";
import { FetchV2, SimpleAdapter } from "../../adapters/types";

type Market = {
  loanAsset: { address: string; decimals: number };
  state: {
    supplyApy: number;
    borrowApy: number;
    supplyAssets: number;
    borrowAssets: number;
  };
};

const BLUE_API_ENDPOINT = "https://blue-api.morpho.org/graphql";

const query = gql`
  query GetMarketsData($chainId: Int!) {
    markets(where: { chainId_in: [$chainId] }) {
      items {
        loanAsset {
          address
        }
        state {
          borrowAssets
          supplyAssets
          supplyApy
          borrowApy
        }
      }
    }
  }
`;

const apyToDaily = (apy: number): number =>
  (((apy / 100 + 1) ** (1 / 365) - 1) * 365) / (0.01 * 365);

const fetchMarkets = async (chainId: number, url: string) => {
  const res = await request(url, query, { chainId });

  let marketData: {
    dailySupplySideRevenue: Balances;
    dailyUserFees: Balances;
    dailyFees?: Balances;
  } = {
    dailySupplySideRevenue: new Balances({
      chain: chainId === 1 ? "ethereum" : "base",
    }),
    dailyUserFees: new Balances({ chain: chainId === 1 ? "ethereum" : "base" }),
  };

  res.markets.items.map((m: Market) => {
    const { address } = m.loanAsset;
    const { supplyApy, borrowApy, supplyAssets, borrowAssets } = m.state;

    const supply = supplyAssets * apyToDaily(supplyApy);
    const borrow = borrowAssets * apyToDaily(borrowApy);

    marketData.dailySupplySideRevenue.add(address, supply);
    marketData.dailyUserFees.add(address, borrow);
  });

  marketData.dailyFees = marketData.dailyUserFees;

  return marketData;
};

const fetchEthereum: FetchV2 = async (options) => {
  return fetchMarkets(1, BLUE_API_ENDPOINT);
};

const fetchBase: FetchV2 = async (options) => {
  return fetchMarkets(8453, BLUE_API_ENDPOINT);
};

const adapter: SimpleAdapter = {
  adapter: {
    ethereum: {
      fetch: fetchEthereum,
      start: '2024-01-02',
    },
    base: {
      fetch: fetchBase,
      start: '2024-05-03',
    },
  },
  version: 2,
};

export default adapter;
