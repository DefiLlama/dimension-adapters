import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const VSP_TOKEN = "0x1b40183EFB4Dd766f11bda7a7c3ad8982e998421";
const DISTRIBUTOR = "0xd31f42cf356e02689d1720b5ffaa6fc7229d255b";

const fetch = async (options: FetchOptions) => {

    const dailyFees = await addTokensReceived({ options, tokens: [VSP_TOKEN], targets: [DISTRIBUTOR], });

  return {
    dailyRevenue: dailyFees,
    dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 1691558400, // Aug 9, 2023
      meta: {
        methodology: {
          Fees: "Tracks VSP deposited into the distributor contract.",
          Revenue: "Tracks VSP deposited into the distributor contract for esVSP lockers.",
          Holders: "Assumes all VSP sent to distributor is for holders.",
        },
      },
    },
  },
};

export default adapter;