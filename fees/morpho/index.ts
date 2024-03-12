const { request, gql } = require("graphql-request");
import { FetchV2, SimpleAdapter } from "../../adapters/types";
import { getPrices } from "../../utils/prices";

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
        creationTimestamp
        collateralAsset {
          address
          decimals
        }
        loanAsset {
          address
          decimals
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
  const res = await request("https://blue-api.morpho.org/graphql", query);

  let marketData: {
    [asset: string]: {
      dailyLendFee: number;
      dailyBorrowFee: number;
    };
  } = {};

  res.markets.items.map((m: Market) => {
    const { address } = m.loanAsset;
    const { supplyApy, borrowApy, supplyAssets, borrowAssets } = m.state;
    if (!(address in marketData))
      marketData[address] = {
        dailyLendFee: 0,
        dailyBorrowFee: 0,
      };

    marketData[address].dailyLendFee += supplyAssets * apyToDaily(supplyApy);
    marketData[address].dailyBorrowFee += borrowAssets * apyToDaily(borrowApy);
  });

  const prices = await getPrices(
    Object.keys(marketData).map((t: string) => `ethereum:${t}`),
    options.endTimestamp,
  );

  let aggregateData: {
    dailyRevenue: number;
    dailySupplySideRevenue: number;
    dailyUserFees: number;
    dailyFees?: number;
  } = {
    dailyRevenue: 0,
    dailySupplySideRevenue: 0,
    dailyUserFees: 0,
  };

  Object.keys(marketData).map((token: string) => {
    const priceData = prices[`ethereum:${token}`];
    const supplySide =
      (priceData.price * marketData[token].dailyLendFee) /
      10 ** priceData.decimals;
    const userFees =
      (priceData.price * marketData[token].dailyBorrowFee) /
      10 ** priceData.decimals;

    aggregateData.dailySupplySideRevenue += supplySide;
    aggregateData.dailyUserFees += userFees;
    aggregateData.dailyRevenue += userFees - supplySide;
  });

  aggregateData.dailyFees = aggregateData.dailyUserFees;

  return aggregateData;
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
