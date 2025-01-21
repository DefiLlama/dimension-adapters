import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import v1Fetch from "./y2k-finance";
import v2Fetch from "./y2k-finance-v2";

const methodology = {
  Fees: "5% of Hedge Vault deposits, 5% of Risk Vault deposits upon a depeg event and withdraw fees",
  Revenue: "5% of Hedge Vault deposits, 5% of Risk Vault deposits upon a depeg event and withdraw fees",
};

const adapter: Adapter = {
  version: 2,
  breakdown: {
    v1: {
      [CHAIN.ARBITRUM]: {
        fetch: v1Fetch as any,
        start: '2022-10-30',
        meta: {
          methodology,
        },
      },
    },
    v2: {
      [CHAIN.ARBITRUM]: {
        fetch: v2Fetch as any,
        start: '2023-05-30',
      },
    },
  },
};

export default adapter;
