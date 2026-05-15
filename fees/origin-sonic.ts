import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchOriginFees } from "../helpers/origin-protocol";

const methodology = {
  Fees: "Yield earned by Origin Sonic (OS) vault strategies before Origin's performance fee.",
  Revenue: "Origin's performance-fee share of OS yield, apportioned from the protocol-wide revenue figure by OS's share of total Origin fees.",
  HoldersRevenue: "Performance fee distributed to OGN stakers.",
  SupplySideRevenue: "Yield (net of performance fee) received by OS holders via rebase.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch: fetchOriginFees(["os"]),
  chains: [CHAIN.SONIC],
  start: '2024-12-17',
  methodology,
};

export default adapter;
