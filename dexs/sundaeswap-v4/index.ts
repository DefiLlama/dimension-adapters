import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getVolumeFetch, volumeMethodology } from "../../helpers/sundaeswap";

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.CARDANO],
  fetch: getVolumeFetch(["V4"]),
  start: "2026-10-01",
  methodology: volumeMethodology,
};

export default adapter;
