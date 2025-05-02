import { BreakdownAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { getUniV2LogAdapter, } from "../../helpers/uniswap";

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.0225% of each swap.",
  SupplySideRevenue: "LPs receive 0.17% of the fees.",
  HoldersRevenue: "0.0575% is used to facilitate SELF buyback and burn.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [CHAIN.BSC]: disabledAdapter
    },
    v2: {
      [CHAIN.BSC]: {
        fetch: getUniV2LogAdapter({ factory: '0x2Af5c23798FEc8E433E11cce4A8822d95cD90565'}),
        meta: {
          methodology
        }
      }
    },
    v3: {
      [CHAIN.BSC]: {
        fetch: () => ({} as any),
      }
    },
    stableswap: {
      [CHAIN.BSC]: {
        fetch: () => ({} as any),
        meta: {
          methodology : {
            UserFees: "User pays 0.25% fees on each swap.",
            ProtocolRevenue: "Treasury receives 10% of the fees.",
            SupplySideRevenue: "LPs receive 50% of the fees.",
            HoldersRevenue: "A 40% of the fees is used to facilitate SELF buyback and burn.",
            Revenue: "Revenue is 50% of the fees paid by users.",
            Fees: "All fees comes from the user fees, which is 025% of each trade."
          }
        }
      }
    },
  },
};

export default adapter;
