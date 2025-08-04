import ADDRESSES from '../helpers/coreAssets.json'
import {
  ChainBlocks,
  FetchOptions,
  FetchResultFees,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";
import { addTokensReceived } from "../helpers/token";
import BigNumber from "bignumber.js";
import { getConfig } from "../helpers/cache";
import { ChainApi } from "@defillama/sdk";

const ABI = {
  assetInfo: "function assetInfo() view returns (uint8,address,uint8)",
  getRewardTokens: "function getRewardTokens() view returns (address[])",
  exchangeRate: "function exchangeRate() view returns (uint256)",
  marketSwapEvent:
    "event Swap(address indexed caller, address indexed receiver, int256 netPtOut, int256 netSyOut, uint256 netSyFee, uint256 netSyToReserve)",
};

type IConfig = {
  [s: string | Chain]: {
    treasury: string;
  };
};

const STETH_ETHEREUM = "ethereum:" + ADDRESSES.ethereum.STETH;
const EETH_ETHEREUM = "ethereum:" + ADDRESSES.ethereum.EETH;
const WETH_ETHEREUM = "ethereum:" + ADDRESSES.ethereum.WETH;

const AIRDROP_DISTRIBUTOR = '0x3942F7B55094250644cFfDa7160226Caa349A38E'

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
    treasury: "0x5c30d3578a4d07a340650a76b9ae5df20d5bdf55"
  },
  [CHAIN.BASE]: {
    treasury: "0xcbcb48e22622a3778b6f14c2f5d258ba026b05e6"
  },
  [CHAIN.SONIC]: {
    treasury: "0xC328dFcD2C8450e2487a91daa9B75629075b7A43"
  },
  [CHAIN.BERACHAIN]: {
    treasury: "0xC328dFcD2C8450e2487a91daa9B75629075b7A43"
  }
};

const fetch = (chain: Chain) => {
  return async (
    timestamp: number,
    _: ChainBlocks,
    options: FetchOptions
  ): Promise<FetchResultFees> => {
    await getWhitelistedAssets(options.api);
    const { api, getLogs, createBalances } = options;

    const { markets, sys, marketToSy } = await getWhitelistedAssets(api);

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
    const allSwapEvents = await getLogs({
      targets: markets,
      eventAbi: ABI.marketSwapEvent,
      flatten: false,
    });

    markets.forEach((market, i) => {
      const token = marketToSy.get(market);
      const logs = allSwapEvents[i]
      logs.forEach((log: any) => {
        const netSyFee = log.netSyFee;
        const netSyToReserve = log.netSyToReserve;
        dailySupplySideFees.add(token!, netSyFee - netSyToReserve); // excluding revenue fee
      })
    })


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
          : undefined
      );

      if (rawAmountSupplySide !== undefined) {
        dailySupplySideFees.addToken(
          underlyingAsset,
          assetAmountSupplySide,
          isBridged
            ? {
              skipChain: true,
            }
            : undefined
        );
      }
    }

    // these revenue should be counted in fees too
    dailyRevenue.addBalances(
      await addTokensReceived({
        options,
        target: AIRDROP_DISTRIBUTOR,
      })
    )

    const dailyFees = dailyRevenue.clone();
    dailyFees.addBalances(dailySupplySideFees);

    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue: dailyRevenue,
      dailySupplySideRevenue: dailySupplySideFees,
      timestamp,
    };
  };
};

const meta = {
  methodology: {
    Fees: 'Total yield from deposited assets + trading fees paid by yield traders.',
    Revenue: 'Share of yields and trading fees collected by protocol',
    ProtocolRevenue: 'Share of yields and trading fees collected by protocol',
    HoldersRevenue: 'Share of yields and trading fees distributed to vePENDLE',
    SupplySideRevenue: 'Yields and trading fees diestibuted to depositors and liqudiity providers',
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: '2023-06-09',
      meta,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: '2023-06-09',
      meta,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: '2023-06-09',
      meta,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: '2023-08-11',
      meta,
    },
    [CHAIN.MANTLE]: {
      fetch: fetch(CHAIN.MANTLE),
      start: '2024-03-27',
      meta,
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: '2024-11-12',
      meta,
    },
    [CHAIN.SONIC]: {
      fetch: fetch(CHAIN.SONIC),
      start: '2025-02-14',
      meta,
    },
    [CHAIN.BERACHAIN]: {
      fetch: fetch(CHAIN.BERACHAIN),
      start: '2025-02-07',
      meta,
    }
  },
};

async function getWhitelistedAssets(api: ChainApi): Promise<{
  markets: string[];
  sys: string[];
  marketToSy: Map<string, string>;
}> {
  // Should only cache api by week
  const weekId = Math.floor(Date.now() / 1000 / 60 / 60 / 24 / 7);

  let results: any[] = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const { results: newResults } = await getConfig(
      `pendle/v2/revenue-${api.chainId!}-${skip}-${weekId}`,
      `https://api-v2.pendle.finance/core/v1/${api.chainId!}/markets?order_by=name%3A1&skip=${skip}&limit=100&select=all`
    );
    results = results.concat(newResults);
    skip += 100;
    hasMore = newResults.length === 100;
  }

  const markets = results.map((d: any) => d.lp.address);
  const sySet: Set<string> = new Set(results.map((d: any) => d.sy.address));
  const sys = Array.from(sySet);

  const marketToSy = new Map<string, string>();
  for (const result of results) {
    marketToSy.set(result.lp.address, result.sy.address);
  }

  return { markets, sys, marketToSy };
}

export default adapter;
