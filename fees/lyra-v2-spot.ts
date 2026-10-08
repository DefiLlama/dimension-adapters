import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { deriveFeesMethodology } from "../helpers/derive";
import { fetch } from "./derive-v3-spot";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.LYRA],
  start: "2024-07-12",
  deadFrom: "2026-10-06", // Derive moved to v3, see fees/derive-v3-spot.ts
  ...deriveFeesMethodology("spot"),
};

export default adapter;
