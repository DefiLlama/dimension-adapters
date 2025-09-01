export default adapter

import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const v3Endpoints: { [key: string]: string } = {
  [CHAIN.BERACHAIN]: "https://api.goldsky.com/api/public/project_cmesjqx64lbfh01wc6z2q9tb0/subgraphs/winnieswap3/3.0.0/gn"
}
const fetch = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 25,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 75, // 75% of fees are going to LPs
    Revenue: 25 // Revenue is 100% of collected fees
  }
});

const methodology = {
  Fees: "Total swap fees paid by users.",
  Revenue: "25% protocol revenue share and 75% holders revenue share.",
  ProtocolRevenue: "25% of fees collected by the protocol.",
  SupplySideRevenue: "75% of fees distributed to LPs.",
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
