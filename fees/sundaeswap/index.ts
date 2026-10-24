import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { breakdownMethodology, getFetch, methodology } from "../../helpers/sundaeswap";

const adapter: Adapter = {
  version: 1,
  chains: [CHAIN.CARDANO],
  fetch: getFetch(["V1"]),
  start: "2022-01-20",
  methodology,
  breakdownMethodology,
};

export default adapter;
