import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const endpoints: { [key: string]: string } = {
  [CHAIN.SONEIUM]: "https://wavex-indexer-serve-mainnet.up.railway.app/",
};

const historicalDataDerivatives = gql`
  query get_volume($id: String!) {
    volumeStat(id: $id) {
      liquidation
      margin
    }
  }
`;

const historicalOI = gql`
  query get_trade_stats($id: String!) {
    tradingStat(id: $id) {
      longOpenInterest
      shortOpenInterest
    }
  }
`;

const fetch = async (options: FetchOptions) => {
  const chain = CHAIN.SONEIUM;
  const dailyData = await request(endpoints[chain], historicalDataDerivatives, {
    id: options.startOfDay.toString(),
  });

  let openInterestAtEnd = 0;
  let longOpenInterestAtEnd = 0;
  let shortOpenInterestAtEnd = 0;

  const tradingStats = await request(endpoints[chain], historicalOI, {
    id: options.startOfDay.toString(),
  });

  if (tradingStats.tradingStat) {
    longOpenInterestAtEnd = Number(
      tradingStats.tradingStat.longOpenInterest || 0
    );
    shortOpenInterestAtEnd = Number(
      tradingStats.tradingStat.shortOpenInterest || 0
    );
    openInterestAtEnd = longOpenInterestAtEnd + shortOpenInterestAtEnd;
  }

  const DECIMALS = 30;

  return {
    longOpenInterestAtEnd: longOpenInterestAtEnd
      ? String(longOpenInterestAtEnd * 10 ** -DECIMALS)
      : undefined,
    shortOpenInterestAtEnd: shortOpenInterestAtEnd
      ? String(shortOpenInterestAtEnd * 10 ** -DECIMALS)
      : undefined,
    openInterestAtEnd: openInterestAtEnd
      ? String(openInterestAtEnd * 10 ** -DECIMALS)
      : undefined,
    dailyVolume: dailyData.volumeStat
      ? String(
          Number(
            Object.values(dailyData.volumeStat).reduce((sum, element) =>
              String(Number(sum) + Number(element))
            )
          ) *
            10 ** -DECIMALS
        )
      : undefined,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SONEIUM],
  start: '2024-12-27',
};

export default adapter;
