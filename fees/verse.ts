import { CHAIN } from "../helpers/chains";
import { BaseAdapter, Adapter, FetchOptions, } from "../adapters/types";
import volumeAdapter from "../dexs/verse";

const adapterObj = volumeAdapter.adapter as BaseAdapter;

const fetch = (chain: string, tf: number, rf: number, ssr: number) => {
  return async (options: FetchOptions) => {
    const { dailyVolume } = await (adapterObj[chain].fetch as any)(options);

    return {
      dailyUserFees: dailyVolume.clone(tf),
      dailyFees: dailyVolume.clone(tf),
      dailyRevenue: dailyVolume.clone(rf),
      dailySupplySideRevenue: dailyVolume.clone(ssr),
    };
  }
}

const methodology = {
  UserFees: "Fees paid by traders, 0.3% on each swap",
  Fees: "0.3% trading fee",
  Revenue: "Percentage of swap fees (sbch and ethereum) going to treasury, 0.05% on each swap",
  SupplySideRevenue: "User fees (sbch and ethereum) distributed among LPs, 0.25% on each swap"
}

const baseAdapter: BaseAdapter = {
  [CHAIN.ETHEREUM]: {
    fetch: fetch(CHAIN.ETHEREUM, 0.003, 0.0005, 0.0025),
  },
  [CHAIN.SMARTBCH]: {
    fetch: fetch(CHAIN.SMARTBCH, 0.003, 0.0005, 0.0025),
  },
}

const adapter: Adapter = {
  methodology,
  adapter: baseAdapter,
  version: 2
};

export default adapter;
