import request from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";
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
  volume: string;
  openInterest: string;
  fees: string;
}
const fetchVolume = (chain: Chain) =>  {
  return async (timestamp: number) => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const toBlock = (await getBlock(toTimestamp, chain, {}));
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const query = `
    {
      today:assetTotals(where: {totalVolume_not: "0"}, block: {number: ${toBlock}}) {
        id
        symbol
        totalVolume
        openInterest
        totalFees
      },
      yesterday:assetTotals(where: {totalVolume_not: "0"}, block: {number: ${fromBlock}}) {
        id
        symbol
        totalVolume
        openInterest
        totalFees
      }
    }
    `;
    const response: IResponse = (await request(endpoint[chain], query));
    const data: IAsset[] = response.today.map((asset) => {
      const yesterday = response.yesterday.find((e: IAssetTotals) => e.id === asset.id);
      const totalVolume = Number(asset.totalVolume) - Number(yesterday?.totalVolume || 0);
      const totalFees = Number(asset.totalFees) - Number(yesterday?.totalFees || 0);
      const openInterest = Math.abs(Number(asset.openInterest));
      return {
        id: asset.id,
        openInterest: openInterest ? `${openInterest}` : 0,
        fees: totalFees ? `${totalFees}` : 0,
        volume: totalVolume ? `${totalVolume}` : 0,
      } as IAsset
    })
    const coins = data.map((e: IAsset) => `${chain}:${e.id}`);
    const prices = await getPrices(coins, timestamp);
    const dailyVolume = data.reduce((acc, { volume, id }) => {
      const price = prices[`${chain}:${id}`]?.price || 0;
      return acc + Number(volume) * price;
    }, 0);
    const dailyFees = data.reduce((acc, { fees, id }) => {
      const price = prices[`${chain}:${id}`]?.price || 0;
      return acc + Number(fees) * price;
    },0);
    const dailyOpenInterest = data.reduce((acc, { openInterest, id }) => {
      const price = prices[`${chain}:${id}`]?.price || 0;
      return acc + Number(openInterest) * price;
    },0);
    const totalFees = response.today.reduce((acc , { totalFees, id }) => {
      const price  = prices[`${chain}:${id}`]?.price || 0;
      return acc + Number(totalFees) * price;
    }, 0);
    const totalVolume  = response.today.reduce((acc , { totalVolume, id }) => {
      const price  = prices[`${chain}:${id}`]?.price || 0;
      return acc + Number(totalVolume) * price;
    }, 0);

    return {
      dailyOpenInterest: dailyOpenInterest ? `${dailyOpenInterest}` : undefined,
      dailyFees: `${dailyFees}`,
      dailyVolume: `${dailyVolume}`,
      totalFees: totalFees ? `${totalFees}` : undefined,
      totalVolume: totalVolume ? `${totalVolume}` : undefined,
      timestamp
    };
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume(CHAIN.ARBITRUM),
      start: async () => 1696291200,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchVolume(CHAIN.OPTIMISM),
      start: async () => 1696204800,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchVolume(CHAIN.ETHEREUM),
      start: async () => 1696291200,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchVolume(CHAIN.POLYGON),
      start: async () => 1697155200,
    },
    [CHAIN.BASE]: {
      fetch: fetchVolume(CHAIN.BASE),
      start: async () => 1696809600,
    },
    [CHAIN.XDAI]: {
      fetch: fetchVolume(CHAIN.XDAI),
      start: async () => 1696550400,
    },
  }
};
export default adapter;
