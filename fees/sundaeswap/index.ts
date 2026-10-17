import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { breakdownMethodology, getFetch, methodology } from "../../helpers/sundaeswap";

// Listed as SundaeSwap V2 on DefiLlama; the Sundae API calls these pools V1
const adapter: Adapter = {
  version: 1,
  chains: [CHAIN.CARDANO],
  fetch: getFetch(["V1"]),
  start: "2022-01-20",
  deadFrom: "2026-10-01", // protocol fees reported by the Sundae API are currently incorrect
  methodology,
  breakdownMethodology,
};

export default adapter;
