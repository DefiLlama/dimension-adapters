import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const FLOCK_TOKEN = "0x5ab3d4c385b400f3abb49e80de2faf6a88a7b691";
const FEE_RECEIVER = "0x087d5833ba01c0b42cf54b369a120c40712e5162";

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    tokens: [FLOCK_TOKEN],
    targets: [FLOCK_TOKEN, FEE_RECEIVER],
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: "2024-12-31",
    },
  },
  methodology: {
    Fees: "All FLOCK token fees collected by the protocol.",
    Revenue: "All FLOCK token fees collected by the protocol.",
    ProtocolRevenue: "All FLOCK token fees collected by the protocol.",
  },
};

export default adapter;
