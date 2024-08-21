import { BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

const fetch =
  (chain: CHAIN | "avalanche" | "binance" | "gnosis", endTimestamp?: number) =>
  async (options: FetchOptions) => {
    try {
      const response = await queryDune("4003938", {
        chain,
        start: options.startTimestamp,
        end: endTimestamp
          ? Math.min(endTimestamp, options.endTimestamp)
          : options.endTimestamp,
      });

      return {
        dailyVolume: response[0].daily,
        totalVolume: response[0].total,
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
