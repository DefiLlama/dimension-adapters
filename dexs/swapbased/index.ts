import { CHAIN } from "../../helpers/chains";
import type { BreakdownAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";


/* PERPS */

const endpointsPerps: { [key: string]: string } = {
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/67101/swapbased-perps-core/version/latest",
};

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      liquidation
      margin
    }
  }
`;

const historicalOI = gql`
  query get_trade_stats($period: String!, $id: String!) {
    tradingStats(where: { period: $period, id: $id }) {
      id
      longOpenInterest
      shortOpenInterest
    }
  }
`;

interface IGraphResponse {
  volumeStats: Array<{
    burn: string;
    liquidation: string;
    margin: string;
    mint: string;
    swap: string;
  }>;
}

interface IGraphResponseOI {
  tradingStats: Array<{
    id: string;
    longOpenInterest: string;
    shortOpenInterest: string;
  }>;
}

const getFetch =
  (query: string) =>
  (chain: string): any =>
  async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000),
    );
    const dailyData: IGraphResponse = await request(
      endpointsPerps[chain],
      query,
      {
        id: String(dayTimestamp) + ":daily",
        period: "daily",
      },
    );

    const tradingStats: IGraphResponseOI = await request(
      endpointsPerps[chain],
      historicalOI,
      {
        id: String(dayTimestamp) + ":daily",
        period: "daily",
      },
    );

    const openInterestAtEnd =
      Number(tradingStats.tradingStats[0]?.longOpenInterest || 0) +
      Number(tradingStats.tradingStats[0]?.shortOpenInterest || 0);
    const longOpenInterestAtEnd = Number(
      tradingStats.tradingStats[0]?.longOpenInterest || 0,
    );
    const shortOpenInterestAtEnd = Number(
      tradingStats.tradingStats[0]?.shortOpenInterest || 0,
    );

    return {
      timestamp: dayTimestamp,
      longOpenInterestAtEnd: longOpenInterestAtEnd
        ? String(longOpenInterestAtEnd * 10 ** -30)
        : undefined,
      shortOpenInterestAtEnd: shortOpenInterestAtEnd
        ? String(shortOpenInterestAtEnd * 10 ** -30)
        : undefined,
      openInterestAtEnd: openInterestAtEnd
        ? String(openInterestAtEnd * 10 ** -30)
        : undefined,
      dailyVolume:
        dailyData.volumeStats.length == 1
          ? String(
              Number(
                Object.values(dailyData.volumeStats[0]).reduce((sum, element) =>
                  String(Number(sum) + Number(element)),
                ),
              ) *
                10 ** -30,
            )
          : undefined
    };
  };

const adapter: BreakdownAdapter = {
  version: 1,
  breakdown: {
    v2: {
      [CHAIN.BASE]: {
        fetch: async (_a, _b, options) =>
          getUniV2LogAdapter({
            factory: "0x04C9f118d21e8B767D2e50C946f0cC9F6C367300",
          })(options),
        start: "2023-07-28",
      },
    },
    v3: {
      [CHAIN.BASE]: {
        fetch: async (_a, _b, options) =>
          getUniV3LogAdapter({
            factory: "0xb5620F90e803C7F957A9EF351B8DB3C746021BEa",
            swapEvent:
              "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)",
          })(options),
        start: "2023-07-27",
      },
    },
    perps: {
      [CHAIN.BASE]: {
        fetch: getFetch(historicalDataSwap)(CHAIN.BASE),
        start: "2023-07-09",
      },
    },
  },
};

export default adapter;
