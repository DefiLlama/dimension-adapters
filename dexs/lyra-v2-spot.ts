import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetch } from "./derive-v3-spot";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.LYRA],
  start: "2024-07-12",
  deadFrom: "2026-10-06", // Derive moved to v3, see dexs/derive-v3-spot.ts
  methodology: { Volume: "Spot trading volume on Derive v2." },
};

export default adapter;
