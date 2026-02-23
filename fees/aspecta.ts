// Aspecta BuildKey fee vault (multisig)
// This vault receives the 2.5% fee from every BuildKey trade
// Ref: https://docs.aspecta.ai/buildkey/fees-and-benefits

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addGasTokensReceived } from "../helpers/token";

const ASPECTA_FEE_COLLECTOR = "0x38799Ce388a9b65EC6bA7A47c1efb9cF1A7068e4";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addGasTokensReceived({
    options,
    multisig: ASPECTA_FEE_COLLECTOR,
  })

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: '2023-07-17',
  methodology: {
    Fees: "2.5% BuildKey trading fees paid in BNB by users.",
    Revenue: "All BuildKey trading fees collected by the protocol.",
    ProtocolRevenue: "Protocol-controlled revenue from BuildKey trades.",
  },
};

export default adapter;
