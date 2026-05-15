import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchOriginFees } from "../../helpers/origin-protocol";

const methodology = {
  Fees: "Yield earned by OUSD vault strategies (Curve, Convex, Morpho, etc.) before Origin's performance fee.",
  Revenue: "Origin's performance-fee share of OUSD yield, apportioned from the protocol-wide revenue figure by OUSD's share of total Origin fees.",
  HoldersRevenue: "Performance fee distributed to OGN stakers.",
  SupplySideRevenue: "Yield (net of performance fee) received by OUSD holders via rebase.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch: fetchOriginFees(["ousd"]),
  chains: [CHAIN.ETHEREUM],
  start: '2021-11-02',
  methodology,
};

export default adapter;
