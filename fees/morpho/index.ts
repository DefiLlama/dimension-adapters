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

const query = gql`
  query {
    markets {
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

const fetch: FetchV2 = async (options) => {
  const chain = "ethereum";
  const res = await request("https://blue-api.morpho.org/graphql", query);

  let marketData: {
    dailySupplySideRevenue: Balances;
    dailyUserFees: Balances;
    dailyFees?: Balances;
  } = {
    dailySupplySideRevenue: new Balances({ chain }),
    dailyUserFees: new Balances({ chain }),
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

const adapter: SimpleAdapter = {
  adapter: {
    ethereum: {
      fetch,
      start: 1704197610,
    },
  },
  version: 2,
};

export default adapter;
