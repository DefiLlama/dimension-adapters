import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { BPS_DENOMINATOR, getPerpPositions, PERPS_FEE_BPS, plancksToVara } from "../../helpers/growstreams";

// GrowStreams 1x-5x RWA Perps Desk on Vara Mainnet (`GROWSTREAMS_PERPS_DESK` 0x8073da7a... in helpers/growstreams.ts).
// Open interest lives in open-interest/vara-grow-streams-perps (snapshot metric, must not be summed across hourly runs).

const OPEN_CLOSE_FEES_TO_PROTOCOL = "Open/Close Fees To Protocol";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Each open and each close is a separate trade against the desk, so both legs count once as taker volume.
  let volumePlancks = 0n;
  for (const p of await getPerpPositions(options)) {
    if (p.openedAt >= options.fromTimestamp && p.openedAt < options.toTimestamp) {
      volumePlancks += p.notionalGvara;
    }
    if (!p.isOpen && p.closedAt >= options.fromTimestamp && p.closedAt < options.toTimestamp) {
      volumePlancks += p.notionalGvara;
    }
  }
  // Positions carry no fee field; the desk charges a fixed PERPS_FEE_BPS (contract constant) on notional at open and at close.
  const feesPlancks = (volumePlancks * PERPS_FEE_BPS) / BPS_DENOMINATOR;

  dailyVolume.addCGToken("vara-network", plancksToVara(volumePlancks));
  dailyFees.addCGToken("vara-network", plancksToVara(feesPlancks), METRIC.OPEN_CLOSE_FEES);
  dailyRevenue.addCGToken("vara-network", plancksToVara(feesPlancks), OPEN_CLOSE_FEES_TO_PROTOCOL);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Volume: "Notional of leveraged RWA perpetual positions opened and closed on the GrowStreams perps desk on Vara; each open and each close counts once.",
  Fees: "0.10% execution fee paid by traders on the notional of every perpetual open and close.",
  UserFees: "0.10% execution fee paid by traders on the notional of every perpetual open and close.",
  Revenue: "All of the 0.10% perpetual execution fee, kept by the protocol.",
  ProtocolRevenue: "All of the 0.10% perpetual execution fee, sent to the protocol treasury.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.OPEN_CLOSE_FEES]: "0.10% (10 bps) execution fee on the notional of each perpetual open and close.",
  },
  UserFees: {
    [METRIC.OPEN_CLOSE_FEES]: "0.10% (10 bps) execution fee on the notional of each perpetual open and close.",
  },
  Revenue: {
    [OPEN_CLOSE_FEES_TO_PROTOCOL]: "100% of the 0.10% perpetual execution fee, kept by the protocol.",
  },
  ProtocolRevenue: {
    [OPEN_CLOSE_FEES_TO_PROTOCOL]: "100% of the 0.10% perpetual execution fee, sent to the protocol treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.VARA],
  start: "2026-11-10",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
