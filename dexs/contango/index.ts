import request from "graphql-request";
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
import { wrapGraphError } from "../../helpers/getUniSubgraph";
import { Chain } from "@defillama/sdk/build/general";

type IEndpoint = {
  [chain: string]: string;
}

const endpoint: IEndpoint = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/contango-xyz/v2-arbitrum",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/contango-xyz/v2-optimism",
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/contango-xyz/v2-mainnet",
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/contango-xyz/v2-polygon",
  [CHAIN.BASE]: "https://graph.contango.xyz:18000/subgraphs/name/contango-xyz/v2-base",
  [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/contango-xyz/v2-gnosis",
}

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
  fees: number;
}
const fetchVolume = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { getFromBlock, getToBlock, createBalances, api, }: FetchOptions) => {
    const query = `
    {
      today:assetTotals(where: {totalVolume_not: "0"}, block: {number: ${await getToBlock()}}) {
        id
        symbol
        totalVolume
        openInterest
        totalFees
      },
      yesterday:assetTotals(where: {totalVolume_not: "0"}, block: {number: ${await getFromBlock()}}) {
        id
        symbol
        totalVolume
        openInterest
        totalFees
      }
    }
    `;
    let response: IResponse
    try {
      response = await request(endpoint[chain], query)
    } catch (error) {
      console.error('Error fetching contango data', wrapGraphError(error as Error).message);
      return { timestamp };
    }

    const dailyOpenInterest = createBalances();
    const dailyFees = createBalances();
    const dailyVolume = createBalances();
    const totalFees = createBalances();
    const totalVolume = createBalances();

    const tokens = response.today.map((asset) => asset.id);
    const decimals = await api.multiCall({  abi: 'erc20:decimals', calls: tokens})

    const data: IAsset[] = response.today.map((asset, index: number) => {
      const yesterday = response.yesterday.find((e: IAssetTotals) => e.id === asset.id);
      const totalVolume = Number(asset.totalVolume) - Number(yesterday?.totalVolume || 0);
      const totalFees = Number(asset.totalFees) - Number(yesterday?.totalFees || 0);
      const openInterest = Math.abs(Number(asset.openInterest));
      const multipliedBy = 10 ** Number(decimals[index]);
      return {
        id: asset.id,
        openInterest: openInterest * multipliedBy,
        fees: totalFees * multipliedBy,
        volume: totalVolume * multipliedBy,
      } as IAsset
    })
    data.map(({ volume, id, openInterest, fees }) => {
      dailyVolume.add(id, +volume)
      dailyOpenInterest.add(id, +openInterest)
      dailyFees.add(id, +fees)
    });
    response.today.map(({ totalFees: tf, id, totalVolume: tv, }, index) => {
      const multipliedBy = 10 ** Number(decimals[index]);
      totalFees.add(id, +tf * multipliedBy)
      totalVolume.add(id, +tv * multipliedBy)
    });

    return {
      dailyOpenInterest, dailyFees, dailyVolume,
      // totalFees, totalVolume,
      timestamp
    };
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume(CHAIN.ARBITRUM),
      start: 1696291200,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchVolume(CHAIN.OPTIMISM),
      start: 1696204800,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchVolume(CHAIN.ETHEREUM),
      start: 1696291200,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchVolume(CHAIN.POLYGON),
      start: 1697155200,
    },
    [CHAIN.BASE]: {
      fetch: fetchVolume(CHAIN.BASE),
      start: 1696809600,
    },
    [CHAIN.XDAI]: {
      fetch: fetchVolume(CHAIN.XDAI),
      start: 1696550400,
    },
  }
};
export default adapter;
