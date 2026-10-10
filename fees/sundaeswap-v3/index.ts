import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { breakdownMethodology, getFetch, methodology } from "../../helpers/sundaeswap";

// V3 constant-product pools plus Stableswaps pools (launched 2026-02)
const adapter: Adapter = {
  version: 1,
  chains: [CHAIN.CARDANO],
  fetch: getFetch(["V3", "Stableswaps"]),
  start: "2024-05-09",
  methodology,
  breakdownMethodology,
};

export default adapter;
