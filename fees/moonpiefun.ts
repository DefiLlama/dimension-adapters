import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";

const TREASURY = "0x86039dc5084358863d3D69C0c24C40b0b6Cf9130".toLowerCase();
const USDT = '0x26E490d30e73c36800788DC6d6315946C4BbEa24'; // or the USDT address for your chain


const methodology = {
  Fees: "Protocol collects fees from trading in USDT.",
  Revenue: "All fees collected are considered revenue."
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ASSETCHAIN]: {
      fetch: async (_t, _a, options: FetchOptions) => {
        const dailyFees = options.createBalances();
        await addTokensReceived({
          options,
          tokens: [USDT],
          target: TREASURY,
          balances: dailyFees,
        });
        return {
          dailyFees,
          dailyRevenue: dailyFees,
          timestamp: options.startOfDay,
        };
      },
      start: '2025-05-12',
    },
  },
  methodology,
};

export default adapter;