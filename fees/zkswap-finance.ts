import { CHAIN } from "../helpers/chains";
import volumeAdapter from "../dexs/zkSwap_Finance";
import { BaseAdapter, Adapter, ChainBlocks, FetchOptions, Fetch } from "../adapters/types";
import BigNumber from "bignumber.js";
import { Balances } from "@defillama/sdk";


const adapterObj = volumeAdapter.adapter;

const fetch = (chain: string, totalFees: number, revenueFee: number) => {
  return async (timestamp: number, chainBlocks: ChainBlocks, options: FetchOptions) => {
    const FEE_COLLECTED_START_TIME = 1696118400

    const fetchedResult = await (adapterObj[chain].fetch as Fetch)(timestamp, chainBlocks, options);
    const fetchedResultStartTime = await (adapterObj[chain].fetch as Fetch)(FEE_COLLECTED_START_TIME, chainBlocks, options);

    const chainDailyVolume = (await (fetchedResult.dailyVolume as Balances).getUSDValue()).toString();
    const chainTotalVolumeFromFeeCollectedDate = (Number(fetchedResult.totalVolume) - Number(fetchedResultStartTime.totalVolume))
    const chainTotalVolume = chainTotalVolumeFromFeeCollectedDate  || '0';

    const ssrFee = totalFees - revenueFee
    const protocolFee =  revenueFee

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
      totalSupplySideRevenue: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(ssrFee).toString() : undefined,
      dailySupplySideRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(ssrFee).toString() : undefined,
    };
  }
}

const methodology = {
  Fees: "A 0.1% trading fee is collected",
  UserFees: "Users pays 0.1% of each swap",
  Revenue: "A 0.05% fees goes to the protocol",
  ProtocolRevenue: "A 0.05% fees goes to the protocol",
  SupplySideRevenue:  "A 0.05% is distributed proportionally to liquidity providers (ZFLP token holders)"
}

const baseAdapter: BaseAdapter = {
  [CHAIN.ERA]: {
    ...adapterObj[CHAIN.ERA],
    fetch: fetch(CHAIN.ERA, 0.001, 0.0005),
    customBackfill: fetch(CHAIN.ERA, 0.001, 0.0005),
    start: '2024-12-17',
    meta: {
      methodology
    }
  },
}

const adapter: Adapter = {
  adapter: baseAdapter
};

export default adapter;
