import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const v3Endpoints: { [key: string]: string } = {
  [CHAIN.BERACHAIN]: "https://api.goldsky.com/api/public/project_cmesjqx64lbfh01wc6z2q9tb0/subgraphs/winnieswap/0.0.1/gn"
}
const fetch = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0, // 25 later
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 75 later - 100% of fees are going to LPs
    Revenue: 0 // 25 later - Revenue is 100% of collected fees
  }
});

const methodology = {
  Fees: "Total swap fees paid by users.",
  Revenue: "0% protocol revenue share and 75% holders revenue share.", // 25% protocol revenue share and 75% holders revenue share.
  ProtocolRevenue: "0% of fees collected by the protocol.", // 25% of fees collected by the protocol.
  SupplySideRevenue: "100% of fees distributed to LPs.", // 75% of fees distributed to LPs.
  HoldersRevenue: "0% of fees used for buy-back and burn.",
  UserFees: "Total swap fees paid by users."
}

// https://docs.henlo-winnie.dev/winnieswap/introduction#trading-fees-split
const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: '2025-07-07',
  chains: [CHAIN.BERACHAIN],
  methodology
}

export default adapter;
