import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";

const MAMO_MULTI_REWARDS = "0x7855B0821401Ab078f6Cf457dEAFae775fF6c7A3";
const MAMO_TOKEN = "0x7300B37DfdfAb110d83290A29DfB31B1740219fE";
const cbBTC = ADDRESSES.base.cbBTC;

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    targets: [MAMO_MULTI_REWARDS],
    tokens: [MAMO_TOKEN, cbBTC],
  });

  return {
    dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2025-09-01",
    },
  },
  methodology: {
    Fees: "Aerodrome LP trading fees collected by the Mamo protocol and distributed to MAMO stakers.",
    HoldersRevenue: "100% of fees distributed to MAMO token stakers via the multi-rewards contract.",
  },
};

export default adapter;
