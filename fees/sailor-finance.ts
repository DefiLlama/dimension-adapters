import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import type { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

const methodology = {
  Fees: "Sailor-Finance protocol swap fee (0.3% per swap).",
  LPProvidersRevenue:
    "Fees distributed to the LP providers (84% of total accumulated fees).",
  ProtocolAccumulation:
    "Fees sent to the protocol wallet (16% of total accumulated fees), is used to provide benefits to users in custom ways.",
};

const graphs = async (_t: any, _b: any, options: FetchOptions) => {
  const res = await fetchURL(`https://asia-southeast1-ktx-finance-2.cloudfunctions.net/sailor_poolapi/getVolumeAndTvl`);
  const {fee24} = res.data;
  return {
    timestamp: options.startOfDay,
    dailyFees: fee24.toString(),
    // dailyLPProvidersRevenue: (dailyFee * 0.84).toString(),
    dailyRevenue: (fee24 * 0.16).toString(),
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.SEI]: {
      runAtCurrTime: true,
      fetch: graphs,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
