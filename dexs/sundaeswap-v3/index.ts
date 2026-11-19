import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getVolumeFetch, volumeMethodology } from "../../helpers/sundaeswap";

// V3 constant-product pools plus Stableswaps pools (launched 2026-02)
const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.CARDANO],
  fetch: getVolumeFetch(["V3", "Stableswaps"]),
  start: "2024-05-09",
  methodology: volumeMethodology,
};

export default adapter;
