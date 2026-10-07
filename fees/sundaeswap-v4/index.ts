import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { breakdownMethodology, getFetch, methodology } from "../../helpers/sundaeswap";

const adapter: Adapter = {
  version: 1,
  chains: [CHAIN.CARDANO],
  fetch: getFetch(["V4"]),
  start: "2026-10-01",
  deadFrom: "2026-10-01", // disabled: V4 protocol fees reported by the Sundae API are currently incorrect
  methodology,
  breakdownMethodology,
};

export default adapter;
