import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const v3Endpoints: { [key: string]: string } = {
  [CHAIN.BERACHAIN]: "https://api.goldsky.com/api/public/project_clpx84oel0al201r78jsl0r3i/subgraphs/kodiak-v3-berachain-mainnet/latest/gn"
}
const fetch = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 35,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 65, // 65% of fees are going to LPs
    Revenue: 35 // Revenue is 100% of collected fees
  }
});

const methodology = {
  Fees: "Total swap fees paid by users.",
  Revenue: "35% protocol revenue share and 65% holders revenue share.",
  ProtocolRevenue: "35% of fees collected by the protocol.",
  SupplySideRevenue: "65% of fees distributed to LPs.",
  HoldersRevenue: "0% of fees used for buy-back and burn.",
  UserFees: "Total swap fees paid by users."
}

// https://documentation.kodiak.finance/protocol/dex/trading-fees
const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BERACHAIN],
  methodology
}

export default adapter;
