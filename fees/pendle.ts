import {
  ChainBlocks,
  FetchOptions,
  FetchResultFees,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import request from "graphql-request";
import { addTokensReceived } from "../helpers/token";
import { StringNumber } from "@defillama/sdk/build/types";
import BigNumber from "bignumber.js";

type IConfig = {
  [s: string | Chain]: {
    endpoint: string;
    treasury: string;
  };
};

const gqlQuery = `
{
  assets(first: 1000, where: {
    type_in: ["SY"]
  }) {
    id,
    type
    accountingAssetType
    accountingAsset {
      id
    }
  }
}
`;

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
    asset: WETH_ETHEREUM
  },
];

const chainConfig: IConfig = {
  [CHAIN.ETHEREUM]: {
    endpoint:
      "https://api.thegraph.com/subgraphs/name/pendle-finance/core-mainnet-23-dec-18",
    treasury: "0x8270400d528c34e1596ef367eedec99080a1b592",
  },
  [CHAIN.ARBITRUM]: {
    endpoint:
      "https://api.thegraph.com/subgraphs/name/pendle-finance/core-arbitrum-23-dec-18",
    treasury: "0xcbcb48e22622a3778b6f14c2f5d258ba026b05e6",
  },
  [CHAIN.BSC]: {
    endpoint:
      "https://api.thegraph.com/subgraphs/name/pendle-finance/core-bsc-23-dec-18",
    treasury: "0xd77e9062c6df3f2d1cb5bf45855fa1e7712a059e",
  },
  [CHAIN.OPTIMISM]: {
    endpoint:
      "https://api.thegraph.com/subgraphs/name/pendle-finance/core-optimism-23-dec-18",
    treasury: "0xe972d450ec5b11b99d97760422e0e054afbc8042",
  },
};

const fetch = (chain: Chain) => {
  return async (
    timestamp: number,
    _: ChainBlocks,
    options: FetchOptions
  ): Promise<FetchResultFees> => {
    const { api } = options;
    const allSyDatas: {
      id: string;
      type: string;
      accountingAssetType: number;
      accountingAsset: {
        id: string;
      };
    }[] = (await request(chainConfig[chain].endpoint, gqlQuery)).assets;

    const allSy: string[] = allSyDatas
      .filter((token: any) => token.type === "SY")
      .map((token: any) => token.id.toLowerCase());

    const rewardTokens: string[] = (
      await api.multiCall({
        permitFailure: true,
        abi: getRewardTokensABI,
        calls: allSy,
      })
    ).flat();

    const exchangeRates: String | null[] = [];
    for (const sy of allSy) {
      try {
        const exchangeRate = await api.call({ target: sy, abi: exchangeRateABI, });
        exchangeRates.push(exchangeRate)
      } catch (e) {
        console.error(e)
        exchangeRates.push(null)
      }
    }

    const dailyFees = await addTokensReceived({
      options,
      target: chainConfig[chain].treasury,
      tokens: rewardTokens.concat(allSy),
    });

    const allTokenList = dailyFees.getBalances();
    for (const token in allTokenList) {
      const tokenAddr = token.split(":")[1];
      const index = allSyDatas.findIndex(
        (syData) => syData.id.toLowerCase() === tokenAddr.toLowerCase()
      );

      if (index == -1) continue;

      const rawAmount = allTokenList[token];
      dailyFees.removeTokenBalance(token);

      let underlyingAsset = allSyDatas[index].accountingAsset.id;

      let isBridged = false;
      for (const bridge of BRIDGED_ASSETS) {
        if (bridge.sy.toLowerCase() === tokenAddr.toLowerCase()) {
          underlyingAsset = bridge.asset;
          isBridged = true;
          break;
        }
      }

      let assetAmount = new BigNumber(rawAmount)
      if (allSyDatas[index].accountingAssetType === 0) {
        assetAmount = assetAmount.times(exchangeRates[index] ?? 0)
          .dividedToIntegerBy(1e18);
      }


      dailyFees.addToken(
        underlyingAsset,
        assetAmount,
        isBridged
          ? {
            skipChain: true,
          }
          : undefined
      );
    }

    const dailyRevenue = dailyFees.clone();
    const dailySupplySideRevenue = dailyFees.clone();

    return {
      dailyFees: dailyFees,
      dailyRevenue: dailyFees,
      dailyHoldersRevenue: dailyRevenue,
      dailySupplySideRevenue: dailySupplySideRevenue,
      timestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: 1686268800,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1686268800,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: 1686268800,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: 1691733600,
    }
  },
};

const getRewardTokensABI = "address[]:getRewardTokens";
const exchangeRateABI = "uint256:exchangeRate";

export default adapter;
