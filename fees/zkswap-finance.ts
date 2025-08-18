import { CHAIN } from "../helpers/chains";
import volumeAdapter from "../dexs/zkSwap_Finance";
import { BaseAdapter, Adapter, ChainBlocks, FetchOptions, Fetch } from "../adapters/types";
import BigNumber from "bignumber.js";
import { Balances } from "@defillama/sdk";


const adapterObj = volumeAdapter.adapter;

const fetch = (chain: string, tf: number, rf: number) => {
  return async (timestamp: number, chainBlocks: ChainBlocks, options: FetchOptions) => {
    const fetchedResult = await ((adapterObj as BaseAdapter)[chain].fetch as Fetch)(timestamp, chainBlocks, options);
    const chainDailyVolume = (await (fetchedResult.dailyVolume as Balances).getUSDValue()).toString();

    const ssrFee = tf - rf
    const protocolFee =  rf

    return {
      timestamp,
      dailyUserFees: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(tf).toString() : undefined,
      dailyFees: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(tf).toString() : undefined,
      dailyRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(rf).toString() : undefined,
      dailyProtocolRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(protocolFee).toString() : undefined,
      dailySupplySideRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(ssrFee).toString() : undefined,
    };
  }
}

const methodology = {
  Fees: "A 0.2% trading fee is collected",
  UserFees: "Users pays 0.2% of each swap",
  Revenue: "A 0.067% fees goes to the protocol",
  ProtocolRevenue: "A 0.067% fees goes to the protocol",
  SupplySideRevenue:  "A 0.133% is distributed proportionally to liquidity providers (ZFLP token holders)"
}

const baseAdapter: BaseAdapter = {
  [CHAIN.ERA]: {
    ...(adapterObj as BaseAdapter)[CHAIN.ERA],
    fetch: fetch(CHAIN.ERA, 0.002, 0.00067),
    start: '2024-12-17',
  },
  [CHAIN.SONIC]: {
    ...(adapterObj as BaseAdapter)[CHAIN.SONIC],
    fetch: fetch(CHAIN.SONIC, 0.002, 0.00067),
    start: '2025-04-09',
  }
}

const adapter: Adapter = {
  methodology,
  adapter: baseAdapter
};

export default adapter;
