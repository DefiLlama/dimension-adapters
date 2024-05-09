import { CHAIN } from "../helpers/chains";
import volumeAdapter from "../dexs/apeswap";
import { BaseAdapter, Adapter, ChainBlocks, FetchOptions, Fetch } from "../adapters/types";
import BigNumber from "bignumber.js";


const adapterObj = volumeAdapter.adapter;

const fetch = (chain: string, totalFees: number, revenueFee: number) => {
  return async (timestamp: number, chainBlocks: ChainBlocks, options: FetchOptions) => {
    const fetchedResult = await (adapterObj[chain].fetch as Fetch)(timestamp, chainBlocks, options);
    const chainDailyVolume = fetchedResult.dailyVolume as number || '0';
    const chainTotalVolume = fetchedResult.totalVolume as number || '0';
    const ssrFee = totalFees - revenueFee
    const protocolFee = chain === CHAIN.TELOS ? 0.000375 : revenueFee / 2
    const buybackFee = revenueFee / 2
    return {
      timestamp,
      totalUserFees: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(totalFees).toString() : undefined,
      dailyUserFees: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(totalFees).toString() : undefined,
      totalFees: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(totalFees).toString() : undefined,
      dailyFees: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(totalFees).toString() : undefined,
      totalRevenue: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(revenueFee).toString() : undefined,
      dailyRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(revenueFee).toString() : undefined,
      totalProtocolRevenue: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(protocolFee).toString() : undefined,
      dailyProtocolRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(protocolFee).toString() : undefined,
      totalHoldersRevenue: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(buybackFee).toString() : undefined,
      dailyHoldersRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(buybackFee).toString() : undefined,
      totalSupplySideRevenue: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(ssrFee).toString() : undefined,
      dailySupplySideRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(ssrFee).toString() : undefined,
    };
  }
}

const methodology = {
  UserFees: "Users pays 0.2% of each swap",
  Fees: "A 0.2% trading fee is collected",
  Revenue: "A 0.05% (bsc and ethereum) or 0.15% (polygon and telos) of the fees goes to treasury, 50% of that fee is used to buyback and burn BANANA, on Telos 25% of the collected fees goes to Telos",
  ProtocolRevenue: "A 0.05% (bsc and ethereum) or 0.15% (polygon) or 0.0375% (telos) of the fees goes to treasury",
  HoldersRevenue: "Of all DEX trading fees earned by ApeSwap, 50% are used to buy back and burn BANANA on a quarterly basis",
  SupplySideRevenue: "A 0.15% (bsc and ethereum) or 0.05% (polygon and telos) is distributed proportionally to all APE-LP token holders"
}

const baseAdapter: BaseAdapter = {
  [CHAIN.BSC]: {
    ...adapterObj[CHAIN.BSC],
    fetch: fetch(CHAIN.BSC, 0.002, 0.0005),
    customBackfill: fetch(CHAIN.BSC, 0.002, 0.0005),
    meta: {
      methodology
    }
  },
  [CHAIN.ETHEREUM]: {
    ...adapterObj[CHAIN.ETHEREUM],
    fetch: fetch(CHAIN.ETHEREUM, 0.002, 0.0005),
    customBackfill: fetch(CHAIN.ETHEREUM, 0.002, 0.0005),
    meta: {
      methodology
    }
  },
  [CHAIN.POLYGON]: {
    ...adapterObj[CHAIN.POLYGON],
    fetch: fetch(CHAIN.POLYGON, 0.002, 0.0015),
    customBackfill: fetch(CHAIN.POLYGON, 0.002, 0.0015),
    meta: {
      methodology
    }
  },
  // [CHAIN.TELOS]: {
  //   ...adapterObj[CHAIN.TELOS],
  //   fetch: fetch(CHAIN.TELOS, 0.002, 0.0015),
  //   customBackfill: fetch(CHAIN.TELOS, 0.002, 0.0015),
  //   meta: {
  //     methodology
  //   }
  // }
  [CHAIN.ARBITRUM]: {
    ...adapterObj[CHAIN.ARBITRUM],
    fetch: fetch(CHAIN.ARBITRUM, 0.002, 0.0005),
    customBackfill: fetch(CHAIN.ARBITRUM, 0.002, 0.0005),
    meta: {
      methodology
    }
  }
}

const adapter: Adapter = {
  adapter: baseAdapter
};


export default adapter;
