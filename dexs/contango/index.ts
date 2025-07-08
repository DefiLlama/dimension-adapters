import * as sdk from "@defillama/sdk";
import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type IEndpoint = {
  [chain: string]: string;
};

const alchemyGraphUrl = (chain) => `https://subgraph.satsuma-prod.com/773bd6dfe1c6/egills-team/v2-${chain}/api`;

const endpoint: IEndpoint = {
  [CHAIN.ARBITRUM]: alchemyGraphUrl("arbitrum"),
  [CHAIN.OPTIMISM]: alchemyGraphUrl("optimism"),
  [CHAIN.ETHEREUM]: alchemyGraphUrl("mainnet"),
  [CHAIN.POLYGON]: alchemyGraphUrl("polygon"),
  [CHAIN.BASE]: alchemyGraphUrl("base"),
  [CHAIN.XDAI]: alchemyGraphUrl("gnosis"),
  [CHAIN.AVAX]: alchemyGraphUrl("avalanche"),
  [CHAIN.LINEA]: alchemyGraphUrl("linea"),
  [CHAIN.BSC]: alchemyGraphUrl("bsc"),
  [CHAIN.SCROLL]: alchemyGraphUrl("scroll"),
};

interface IAssetTotals {
  id: string;
  symbol: string;
  totalVolume: string;
  openInterest: string;
  totalFees: string;
}

interface IResponse {
  today: IAssetTotals[];
  yesterday: IAssetTotals[];
}

interface IAsset {
  id: string;
  volume: number;
  openInterest: number;
}

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const { getFromBlock, getToBlock, createBalances, api } = options;
  const query = `
    {
      today:assetTotals(where: {totalVolume_not: "0"}, block: {number: ${await getToBlock()}}) {
        id
        symbol
        totalVolume
        openInterest
      },
      yesterday:assetTotals(where: {totalVolume_not: "0"}, block: {number: ${await getFromBlock()}}) {
        id
        symbol
        totalVolume
        openInterest
      }
    }
    `;
  const response: IResponse = await request(endpoint[options.chain], query);

  const dailyOpenInterest = createBalances();
  const dailyVolume = createBalances();

  const tokens = response.today.map((asset) => asset.id);
  const decimals = await api.multiCall({
    abi: "erc20:decimals",
    calls: tokens,
  });

  const data: IAsset[] = response.today.map((asset, index: number) => {
    const yesterday = response.yesterday.find(
      (e: IAssetTotals) => e.id === asset.id
    );
    const totalVolume =
      Number(asset.totalVolume) - Number(yesterday?.totalVolume || 0);
    const openInterest = Math.abs(Number(asset.openInterest));
    const multipliedBy = 10 ** Number(decimals[index]);

    return {
      id: asset.id,
      openInterest: openInterest * multipliedBy,
      volume: totalVolume * multipliedBy,
    } as IAsset;
  });

  data.map(({ volume, id, openInterest }) => {
    dailyVolume.add(id, +volume);
    dailyOpenInterest.add(id, +openInterest);
  });

  return {
    dailyOpenInterest,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2023-10-03",
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2023-10-02",
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2023-10-03",
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: "2023-10-13",
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2023-10-09",
    },
    [CHAIN.XDAI]: {
      fetch,
      start: "2023-10-06",
    },
    [CHAIN.AVAX]: {
      fetch,
      start: "2024-08-11",
    },
    [CHAIN.LINEA]: {
      fetch,
      start: "2024-08-11",
    },
    [CHAIN.BSC]: {
      fetch,
      start: "2024-06-07",
    },
    [CHAIN.SCROLL]: {
      fetch,
      start: "2024-08-11",
    },
  },
};
export default adapter;
