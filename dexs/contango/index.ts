import request from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";

const url = "https://api.thegraph.com/subgraphs/name/contango-xyz/v2-arbitrum";
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
const fetchVolume = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const toBlock = (await getBlock(toTimestamp, CHAIN.ARBITRUM, {}));
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
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
  const response: IResponse = (await request(url, query));
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
  const coins = data.map((e: IAsset) => `${CHAIN.ARBITRUM}:${e.id}`);
  const prices = await getPrices(coins, timestamp);
  const dailyVolume = data.reduce((acc, { volume, id }) => {
    const price = prices[`${CHAIN.ARBITRUM}:${id}`]?.price || 0;
    return acc + Number(volume) * price;
  }, 0);
  const dailyFees = data.reduce((acc, { fees, id }) => {
    const price = prices[`${CHAIN.ARBITRUM}:${id}`]?.price || 0;
    return acc + Number(fees) * price;
  },0);
  const dailyOpenInterest = data.reduce((acc, { openInterest, id }) => {
    const price = prices[`${CHAIN.ARBITRUM}:${id}`]?.price || 0;
    return acc + Number(openInterest) * price;
  },0);
  const totalFees = response.today.reduce((acc , { totalFees, id }) => {
    const price  = prices[`${CHAIN.ARBITRUM}:${id}`]?.price || 0;
    return acc + Number(totalFees) * price;
  }, 0);
  const totalVolume  = response.today.reduce((acc , { totalVolume, id }) => {
    const price  = prices[`${CHAIN.ARBITRUM}:${id}`]?.price || 0;
    return acc + Number(totalVolume) * price;
  }, 0);

  return {
    dailyOpenInterest: dailyOpenInterest ? `${dailyOpenInterest}` : undefined,
    dailyFees: dailyFees ? `${dailyFees}` : undefined,
    // dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    totalFees: totalFees ? `${totalFees}` : undefined,
    totalVolume: totalVolume ? `${totalVolume}` : undefined,
    timestamp
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume,
      start: async () => 1696291200,
    },
  }
};
export default adapter;
