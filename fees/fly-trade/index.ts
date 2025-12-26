import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const SWAP_FEE_ADDRESS = "0xd39B2A01D4dca42F32Ff52244a1b28811e40045F";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Fly protocol swap fees collected by router
  const fees = await addTokensReceived({
    options,
    targets: [SWAP_FEE_ADDRESS],
  });

  dailyFees.addBalances(fees);
  dailyRevenue.addBalances(fees);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Fly charges a conditional protocol-level swap fee (0.01%–0.1%) on selected long-tail assets and specific trading pairs. Fees are enforced at the router level and transferred to a Fly-controlled fee collector address.",
  Revenue: "All Fly swap fees are retained by the protocol.",
  ProtocolRevenue: "100% of Fly swap fees are protocol revenue.",
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
    CHAIN.TAIKO,
    CHAIN.METIS,
    CHAIN.FANTOM,
    CHAIN.LINEA,
    CHAIN.INK,
    CHAIN.BERACHAIN,
  ],
  start: "2024-01-01",
  methodology,
};

export default adapter;
