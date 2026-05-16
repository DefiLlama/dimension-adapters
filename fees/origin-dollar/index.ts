import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchOriginFees, OriginProduct } from "../../helpers/origin-protocol";

const PRODUCTS: OriginProduct[] = [
  { apiKey: "ousd", vault: "0xE75D77B1865Ae93c7eaa3040B038D7aA7BC02F70", feeAbi: "uint256:trusteeFeeBps" },
];

const methodology = {
  Fees: "Yield earned by OUSD vault strategies (Curve, Convex, Morpho, etc.) before Origin's performance fee.",
  Revenue: "OUSD yield × trusteeFeeBps read on-chain from the OUSD vault (currently 20%).",
  HoldersRevenue: "Performance fee distributed to OGN stakers.",
  SupplySideRevenue: "Yield (net of performance fee) received by OUSD holders via rebase.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch: fetchOriginFees(PRODUCTS),
  chains: [CHAIN.ETHEREUM],
  start: '2021-11-02',
  methodology,
};

export default adapter;
