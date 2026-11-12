import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPerpPositions, plancksToVara } from "../helpers/growstreams";

// GrowStreams 1x-5x RWA Perps Desk on Vara Mainnet (`GROWSTREAMS_PERPS_DESK` 0x8073da7a... in helpers/growstreams.ts).
// Volume and fees live in dexs/vara-grow-streams-perps.

const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();

  // A position counts if it was opened before the window end and was still open at it (still open now, or closed at/after the window end).
  // Uses each position's recorded openedAt/closedAt, so past days refill to the same value.
  let oiPlancks = 0n;
  for (const p of await getPerpPositions(options)) {
    if (p.openedAt < options.toTimestamp && (p.isOpen || p.closedAt >= options.toTimestamp)) {
      oiPlancks += p.notionalGvara;
    }
  }
  openInterestAtEnd.addCGToken("vara-network", plancksToVara(oiPlancks));

  return { openInterestAtEnd };
};

const methodology = {
  OpenInterest: "Notional of leveraged RWA perpetual positions on the GrowStreams perps desk on Vara that are still open at the end of the period.",
};

const adapter: SimpleAdapter = {
  version: 2,
  // OI is a snapshot read at the window end; hourly records would be summed into the daily value.
  pullHourly: false,
  chains: [CHAIN.VARA],
  start: "2026-11-10",
  fetch,
  methodology,
};

export default adapter;
