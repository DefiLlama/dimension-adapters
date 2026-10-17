import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { breakdownMethodology, getFetch, methodology } from "../../helpers/sundaeswap";

const adapter: Adapter = {
  version: 1,
  chains: [CHAIN.CARDANO],
  fetch: getFetch(["V4"]),
  start: "2026-10-01",
  methodology,
  breakdownMethodology,
};

export default adapter;
