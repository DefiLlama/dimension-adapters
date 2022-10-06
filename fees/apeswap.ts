import { BSC } from "../helpers/chains";
import volumeAdapter from "@defillama/adapters/volumes/adapters/apeswap";
import { BaseAdapter, Adapter } from "../adapters/types";
import BigNumber from "bignumber.js";
import { ChainBlocks } from "@defillama/adapters/volumes/dexVolume.type";

const adapterObj = volumeAdapter.volume;

const fetchFeesBSC = async (timestamp: number, chainBlocks: ChainBlocks) => {
  const TOTAL_FEES_BSC = 0.002;
  const PROTOCOL_FEES_BSC = 0.0005;
  const fetchedResult = await adapterObj[BSC].fetch(timestamp, chainBlocks)
  const chainDailyVolume = fetchedResult.dailyVolume ? fetchedResult.dailyVolume : "0";
  const chainTotalVolume = fetchedResult.totalVolume ? fetchedResult.totalVolume : "0";

  return {
    timestamp,
    totalFees: new BigNumber(chainTotalVolume).multipliedBy(TOTAL_FEES_BSC).toString(),
    dailyFees: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(TOTAL_FEES_BSC).toString() : undefined,
    totalRevenue: new BigNumber(chainTotalVolume).multipliedBy(PROTOCOL_FEES_BSC).toString(),
    dailyRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(PROTOCOL_FEES_BSC).toString() : undefined
  };
}


const baseAdapter: BaseAdapter = {
  [BSC]: {
    ...adapterObj[BSC],
    fetch: fetchFeesBSC,
    customBackfill: fetchFeesBSC,
  }
}

const adapter: Adapter = {
  adapter: baseAdapter
};


export default adapter;