import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.XDC]: {
      fetch: async (options: FetchOptions) => {
        const dateStr = new Date((options.startTimestamp + 43200) * 1000).toISOString().slice(0, 10);
        const fees = await httpGet(
          `https://xdc.blocksscan.io/api?module=stats&action=totalfees&date=${dateStr}`
        );
        if (!fees?.result && fees?.result !== "0")
          throw new Error(`XDC: no fee data for ${dateStr} (status=${fees?.status}, message=${fees?.message})`);
        const dailyFees = options.createBalances();
        dailyFees.addGasToken(fees.result);
        return { dailyFees };
      },
      start: "2019-06-01",
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
