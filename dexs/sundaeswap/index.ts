import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getVolumeFetch, volumeMethodology } from "../../helpers/sundaeswap";

// Listed as SundaeSwap V2 on DefiLlama; the Sundae API calls these pools V1
const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.CARDANO],
  fetch: getVolumeFetch(["V1"]),
  start: "2022-01-20",
  methodology: volumeMethodology,
};

export default adapter;
