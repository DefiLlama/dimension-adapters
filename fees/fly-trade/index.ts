import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const SWAP_FEE_ADDRESS = "0xd39B2A01D4dca42F32Ff52244a1b28811e40045F";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    targets: [SWAP_FEE_ADDRESS],
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Fly charges a conditional protocol-level swap fee (0.01%–0.1%) on selected long-tail assets and specific trading pairs. Fees are enforced at the router level and transferred to a Fly-controlled fee collector address.",
  Revenue: "All Fly swap fees are retained by the protocol.",
  ProtocolRevenue: "All Fly swap fees are retained by the protocol.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [
    CHAIN.ARBITRUM,
    CHAIN.ETHEREUM,
    CHAIN.OPTIMISM,
    CHAIN.BASE,
    CHAIN.BSC,
    CHAIN.POLYGON,
    CHAIN.AVAX,
    CHAIN.SCROLL,
    CHAIN.MANTA,
    CHAIN.METIS,
    CHAIN.FANTOM,
    CHAIN.LINEA,
  ],
  adapter: {
    [CHAIN.BERACHAIN]: {
      start: "2025-08-20",
    },
    [CHAIN.TAIKO]: {
      start: "2025-08-20",
    },
    [CHAIN.INK]: {
      start: "2025-11-01",
    },
  },
  methodology,
};

export default adapter;
