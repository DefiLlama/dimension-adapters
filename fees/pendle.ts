import {
  FetchGetLogsOptions,
  FetchOptions,
  FetchResultV2,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { addTokensReceived } from "../helpers/token";
import BigNumber from "bignumber.js";
import { getConfig } from "../helpers/cache";
import { Balances, ChainApi } from "@defillama/sdk";

const ABI = {
  assetInfo: "function assetInfo() view returns (uint8,address,uint8)",
  getRewardTokens: "function getRewardTokens() view returns (address[])",
  exchangeRate: "function exchangeRate() view returns (uint256)",
  orderFilledV2:
    "event OrderFilledV2(bytes32 indexed orderHash, uint8 indexed orderType, address indexed YT, address token, uint256 netInputFromMaker, uint256 netOutputToMaker, uint256 feeAmount, uint256 notionalVolume, address maker, address taker)",
  marketSwapEvent:
    "event Swap(address indexed caller, address indexed receiver, int256 netPtOut, int256 netSyOut, uint256 netSyFee, uint256 netSyToReserve)",
};

type IConfig = {
  [s: string | Chain]: {
    treasury: string;
  };
};

type MarketData = {
  address: string;
  sy: {
    address: string;
  };
  yt: {
    address: string;
  };
};

const chains: { [chain: string]: { id: number; start: number } } = {
  [CHAIN.ETHEREUM]: { id: 1, start: 1686268800 },
  [CHAIN.ARBITRUM]: { id: 42161, start: 1686268800 },
  [CHAIN.MANTLE]: { id: 5000, start: 1711506087 },
  [CHAIN.BSC]: { id: 56, start: 1686268800 },
  [CHAIN.OPTIMISM]: { id: 10, start: 1691733600 },
};

const STETH_ETHEREUM = "ethereum:0xae7ab96520de3a18e5e111b5eaab095312d7fe84";
const EETH_ETHEREUM = "ethereum:0x35fa164735182de50811e8e2e824cfb9b6118ac2";
const WETH_ETHEREUM = "ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

const BRIDGED_ASSETS = [
  {
    sy: "0x80c12d5b6cc494632bf11b03f09436c8b61cc5df",
    asset: STETH_ETHEREUM,
  },
  {
    sy: "0x96a528f4414ac3ccd21342996c93f2ecdec24286",
    asset: STETH_ETHEREUM,
  },
  {
    sy: "0xa6c895eb332e91c5b3d00b7baeeaae478cc502da",
    asset: EETH_ETHEREUM,
  },
  {
    sy: "0x9d6d509c0354aca187aac6bea7d063d3ef68e2a0",
    asset: WETH_ETHEREUM,
  },
];

const chainConfig: IConfig = {
  [CHAIN.ETHEREUM]: {
    treasury: "0x8270400d528c34e1596ef367eedec99080a1b592",
  },
  [CHAIN.ARBITRUM]: {
    treasury: "0xcbcb48e22622a3778b6f14c2f5d258ba026b05e6",
  },
  [CHAIN.BSC]: {
    treasury: "0xd77e9062c6df3f2d1cb5bf45855fa1e7712a059e",
  },
  [CHAIN.OPTIMISM]: {
    treasury: "0xe972d450ec5b11b99d97760422e0e054afbc8042",
  },
  [CHAIN.MANTLE]: {
    treasury: "0x5c30d3578a4d07a340650a76b9ae5df20d5bdf55",
  },
};

async function amm(
  marketToSy: Map<string, string>,
  getLogs: (params: FetchGetLogsOptions) => Promise<any[]>,
  balances: Balances,
): Promise<void> {
  const swapEvents: { [address: string]: any[] } = {};
  await Promise.all(
    Object.keys(marketToSy).map(
      async (target: string) =>
        await getLogs({
          eventAbi: ABI.marketSwapEvent,
          target,
        }).then((e) => {
          swapEvents[target] = e;
        }),
    ),
  );

  Object.keys(swapEvents).map((market) => {
    swapEvents[market].map((swap) => {
      balances.add(marketToSy.get(market)!, Math.abs(Number(swap.netSyOut)));
    });
  });
}

async function limitOrder(
  ytToSy: Map<string, string>,
  getLogs: (params: FetchGetLogsOptions) => Promise<any[]>,
  balances: Balances,
): Promise<void> {
  const fills = await getLogs({
    target: "0x000000000000c9b3e2c3ec88b1b4c0cd853f4321",
    eventAbi: ABI.orderFilledV2,
  });

  fills.map((fill) => {
    const sy = ytToSy.get(fill.YT.toLowerCase());
    if (!sy) return;
    balances.add(sy, fill.notionalVolume);
  });
}

const fetch = (chain: Chain) => {
  return async (options: FetchOptions): Promise<FetchResultV2> => {
    const { markets, sys, marketToSy, ytToSy } = await getWhitelistedAssets(
      options.api,
    );
    const dailyVolume: Balances = options.createBalances();

    const volumePromises = [
      await amm(marketToSy, options.getLogs, dailyVolume),
      await limitOrder(ytToSy, options.getLogs, dailyVolume),
    ];
    const { api, getLogs, createBalances } = options;

    const rewardTokens: string[] = (
      await api.multiCall({
        permitFailure: true,
        abi: ABI.getRewardTokens,
        calls: sys,
      })
    ).flat();

    const exchangeRates: String | null[] = [];
    const assetInfos: (string[] | null)[] = [];
    for (const sy of sys) {
      try {
        const exchangeRate = await api.call({
          target: sy,
          abi: ABI.exchangeRate,
        });
        const assetInfo = await api.call({ target: sy, abi: ABI.assetInfo });
        exchangeRates.push(exchangeRate);
        assetInfos.push(assetInfo);
      } catch (e) {
        exchangeRates.push(null);
        assetInfos.push(null);
      }
    }

    const dailySupplySideFees = createBalances();
    await Promise.all(
      markets.map(async (market) => {
        const allSwapEvent = await getLogs({
          target: market,
          eventAbi: ABI.marketSwapEvent,
        });

        for (const swapEvent of allSwapEvent) {
          const netSyFee = swapEvent.netSyFee;
          const netSyToReserve = swapEvent.netSyToReserve;
          dailySupplySideFees.add(
            marketToSy.get(market)!,
            netSyFee - netSyToReserve,
          ); // excluding revenue fee
        }
      }),
    );

    const dailyRevenue = await addTokensReceived({
      options,
      target: chainConfig[chain].treasury,
      tokens: rewardTokens.concat(sys),
    });

    const allRevenueTokenList = dailyRevenue.getBalances();
    const allSupplySideTokenList = dailySupplySideFees.getBalances();

    for (const token in allRevenueTokenList) {
      const tokenAddr = token.split(":")[1];
      const index = sys.indexOf(tokenAddr);

      if (index == -1 || !assetInfos[index]) continue;

      const assetInfo = assetInfos[index]!;

      const rawAmountRevenue = allRevenueTokenList[token];
      const rawAmountSupplySide = allSupplySideTokenList[token];

      dailyRevenue.removeTokenBalance(token);
      dailySupplySideFees.removeTokenBalance(token);

      let underlyingAsset = assetInfo[1]!;

      let isBridged = false;
      for (const bridge of BRIDGED_ASSETS) {
        if (bridge.sy === tokenAddr) {
          underlyingAsset = bridge.asset;
          isBridged = true;
          break;
        }
      }

      let assetAmountRevenue = new BigNumber(rawAmountRevenue);
      let assetAmountSupplySide = new BigNumber(rawAmountSupplySide);
      if (assetInfo[0] === "0") {
        const rate = exchangeRates[index] ?? 0;
        assetAmountRevenue = assetAmountRevenue
          .times(rate)
          .dividedToIntegerBy(1e18);
        assetAmountSupplySide = assetAmountSupplySide
          .times(rate)
          .dividedToIntegerBy(1e18);
      }

      dailyRevenue.addToken(
        underlyingAsset,
        assetAmountRevenue,
        isBridged
          ? {
              skipChain: true,
            }
          : undefined,
      );

      if (rawAmountSupplySide !== undefined) {
        dailySupplySideFees.addToken(
          underlyingAsset,
          assetAmountSupplySide,
          isBridged
            ? {
                skipChain: true,
              }
            : undefined,
        );
      }
    }

    const dailyFees = dailyRevenue.clone();
    dailyFees.addBalances(dailySupplySideFees);

    await Promise.all(volumePromises);

    return {
      dailyVolume,
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue: dailyRevenue,
      dailySupplySideRevenue: dailySupplySideFees,
    };
  };
};

async function getWhitelistedAssets(api: ChainApi): Promise<{
  markets: string[];
  sys: string[];
  marketToSy: Map<string, string>;
  ytToSy: Map<string, string>;
}> {
  const { results } = await getConfig(
    "pendle/v2/revenue-" + api.chain,
    `https://api-v2.pendle.finance/core/v1/${api.chainId!}/markets?order_by=name%3A1&skip=0&limit=100&select=all`,
  );
  const markets = results.map((d: any) => d.lp.address);
  const sySet: Set<string> = new Set(results.map((d: any) => d.sy.address));
  const sys = Array.from(sySet);

  const marketToSy = new Map<string, string>();
  for (const result of results) {
    marketToSy.set(result.lp.address, result.sy.address);
  }

  const ytToSy = new Map<string, string>();
  results.map((market: MarketData) => {
    ytToSy.set(market.yt.address.toLowerCase(), market.sy.address);
  });

  return { markets, sys, marketToSy, ytToSy };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {},
};

Object.keys(chains).map((chain) => {
  adapter.adapter[chain] = {
    fetch: fetch(chain),
    start: chains[chain].start,
  };
});

export default adapter;
