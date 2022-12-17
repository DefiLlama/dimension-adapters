import { CHAIN } from "../helpers/chains";
import volumeAdapter from "../dexs/apeswap";
import { BaseAdapter, Adapter, ChainBlocks } from "../adapters/types";
import BigNumber from "bignumber.js";


const adapterObj = volumeAdapter.adapter;

const fetch = (chain: string, totalFees: number, protocolFees: number) => {
  return async (timestamp: number, chainBlocks: ChainBlocks) => {
    const fetchedResult = await adapterObj[chain].fetch(timestamp, chainBlocks);
    const chainDailyVolume = fetchedResult.dailyVolume;
    const chainTotalVolume = fetchedResult.totalVolume;

    return {
      timestamp,
      totalFees: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(totalFees).toString() : undefined,
      dailyFees: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(totalFees).toString() : undefined,
      totalRevenue: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(protocolFees).toString() : undefined,
      dailyRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(protocolFees).toString() : undefined
    };
  }
}



const baseAdapter: BaseAdapter = {
  [CHAIN.BSC]: {
    ...adapterObj[CHAIN.BSC],
    fetch: fetch(CHAIN.BSC, 0.002, 0.0005),
    customBackfill: fetch(CHAIN.BSC, 0.002, 0.0005)
  },
  [CHAIN.ETHEREUM]: {
    ...adapterObj[CHAIN.ETHEREUM],
    fetch: fetch(CHAIN.ETHEREUM, 0.002, 0.0005),
    customBackfill: fetch(CHAIN.ETHEREUM, 0.002, 0.0005)
  },
  [CHAIN.POLYGON]: {
    ...adapterObj[CHAIN.POLYGON],
    fetch: fetch(CHAIN.POLYGON, 0.002, 0.0015),
    customBackfill: fetch(CHAIN.POLYGON, 0.002, 0.0015)
  },
  [CHAIN.TELOS]: {
    ...adapterObj[CHAIN.TELOS],
    fetch: fetch(CHAIN.TELOS, 0.002, 0.001125),
    customBackfill: fetch(CHAIN.TELOS, 0.002, 0.001125)
  }
}

const adapter: Adapter = {
  adapter: baseAdapter
};


export default adapter;
