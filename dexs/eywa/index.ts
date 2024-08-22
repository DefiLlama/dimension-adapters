import { BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getLatestData } from "../../helpers/dune";

type DuneChain =
  | CHAIN.ETHEREUM
  | CHAIN.FANTOM
  | CHAIN.ETHEREUM
  | CHAIN.POLYGON
  | CHAIN.ARBITRUM
  | CHAIN.OPTIMISM
  | CHAIN.BASE
  | "avalanche"
  | "binance"
  | "gnosis";

interface Data {
  time: number;
  day: string;
  type: "daily" | "total";
  blockchain: DuneChain;
  amount: number;
}

const fetch =
  (chain: DuneChain, endTimestamp?: number) =>
  async (options: FetchOptions) => {
    try {
      const response = await getLatestData<Data[]>("4009605");

      if (!response) {
        return {
          dailyVolume: 0,
        };
      }

      if (endTimestamp && endTimestamp < options.endTimestamp) {
        const total = response.find(
          (e) =>
            e.time === endTimestamp &&
            e.blockchain === chain &&
            e.type === "total"
        );
        return {
          dailyVolume: 0,
          totalVolume: total?.amount || 0,
        };
      }

      const volumes = response.filter(
        (e) => e.time === options.startTimestamp && e.blockchain === chain
      );
      const daily = volumes.find((e) => e.type === "daily");
      const total = volumes.find((e) => e.type === "total");

      return {
        dailyVolume: daily?.amount || 0,
        totalVolume: total?.amount || 0,
      };
    } catch (e) {
      console.error(e);
      return { dailyVolume: 0 };
    }
  };

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM, 1702166400),
        start: 1686009600,
        runAtCurrTime: false,
      },
      [CHAIN.AVAX]: {
        fetch: fetch("avalanche", 1702166400),
        start: 1686009600,
        runAtCurrTime: false,
      },
      [CHAIN.FANTOM]: {
        fetch: fetch(CHAIN.FANTOM, 1702166400),
        start: 1686009600,
        runAtCurrTime: false,
      },
      [CHAIN.POLYGON]: {
        fetch: fetch(CHAIN.POLYGON, 1702166400),
        start: 1686009600,
        runAtCurrTime: false,
      },
      [CHAIN.BSC]: {
        fetch: fetch("binance", 1702166400),
        start: 1686009600,
        runAtCurrTime: false,
      },
      [CHAIN.ARBITRUM]: {
        fetch: fetch(CHAIN.ARBITRUM, 1702166400),
        start: 1686009600,
        runAtCurrTime: false,
      },
      [CHAIN.OPTIMISM]: {
        fetch: fetch(CHAIN.OPTIMISM, 1702166400),
        start: 1686009600,
        runAtCurrTime: false,
      },
    },
    "v1.5": {
      [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM, 1711584000),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.AVAX]: {
        fetch: fetch("avalanche", 1711584000),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.FANTOM]: {
        fetch: fetch(CHAIN.FANTOM, 1711584000),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.POLYGON]: {
        fetch: fetch(CHAIN.POLYGON, 1711584000),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.BSC]: {
        fetch: fetch("binance", 1711584000),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.ARBITRUM]: {
        fetch: fetch(CHAIN.ARBITRUM, 1711584000),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.OPTIMISM]: {
        fetch: fetch(CHAIN.OPTIMISM, 1711584000),
        start: 1702166400,
        runAtCurrTime: false,
      },
    },
    v2: {
      [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.AVAX]: {
        fetch: fetch("avalanche"),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.FANTOM]: {
        fetch: fetch(CHAIN.FANTOM),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.POLYGON]: {
        fetch: fetch(CHAIN.POLYGON),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.BSC]: {
        fetch: fetch("binance"),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.ARBITRUM]: {
        fetch: fetch(CHAIN.ARBITRUM),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.OPTIMISM]: {
        fetch: fetch(CHAIN.OPTIMISM),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.BASE]: {
        fetch: fetch(CHAIN.BASE),
        start: 1702166400,
        runAtCurrTime: false,
      },
      [CHAIN.XDAI]: {
        fetch: fetch("gnosis"),
        start: 1702166400,
        runAtCurrTime: false,
      },
    },
  },
};

export default adapter;
