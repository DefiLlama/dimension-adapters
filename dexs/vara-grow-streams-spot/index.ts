import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getSpotTrades, plancksToVara, SPOT_FEE_BPS, SPOT_MAKER_REBATE_BPS } from "../../helpers/growstreams";

// GrowStreams Spot CLOB Orderbook on Vara Mainnet (`GROWSTREAMS_ORDERBOOK` 0x2c1dd078... in helpers/growstreams.ts).
// Perps live in dexs/vara-grow-streams-perps; StreamCore/BountyAdapter fees live in fees/vara-grow-streams.

const SWAP_FEES_TO_MAKERS = "Swap Fees To Makers";
const SWAP_FEES_TO_PROTOCOL = "Swap Fees To Protocol";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  let volumePlancks = 0n;
  let feesPlancks = 0n;
  let makerRebatePlancks = 0n;
  for (const t of await getSpotTrades(options)) {
    volumePlancks += t.amountVara;
    feesPlancks += t.feeVara;
    // 25 of the 30 bps fee recorded on each fill goes to the maker, the remaining 5 bps to the protocol treasury.
    makerRebatePlancks += (t.feeVara * SPOT_MAKER_REBATE_BPS) / SPOT_FEE_BPS;
  }

  dailyVolume.addCGToken("vara-network", plancksToVara(volumePlancks));
  dailyFees.addCGToken("vara-network", plancksToVara(feesPlancks), METRIC.SWAP_FEES);
  dailySupplySideRevenue.addCGToken("vara-network", plancksToVara(makerRebatePlancks), SWAP_FEES_TO_MAKERS);
  dailyRevenue.addCGToken("vara-network", plancksToVara(feesPlancks - makerRebatePlancks), SWAP_FEES_TO_PROTOCOL);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Matched maker/taker fills on the GrowStreams spot order book on Vara, excluding self-trades.",
  Fees: "0.30% fee paid by takers on every spot order book fill.",
  UserFees: "0.30% fee paid by takers on every spot order book fill.",
  Revenue: "0.05% of spot fill value, the part of the 0.30% taker fee kept by the protocol treasury.",
  ProtocolRevenue: "0.05% of spot fill value, the part of the 0.30% taker fee sent to the protocol treasury.",
  SupplySideRevenue: "0.25% of spot fill value, the part of the 0.30% taker fee rebated to the maker.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "0.30% (30 bps) taker fee recorded on each matched spot order book fill.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "0.30% (30 bps) taker fee recorded on each matched spot order book fill.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "5/30 of the recorded spot fill fee (0.05% of fill value) kept by the protocol treasury.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "5/30 of the recorded spot fill fee (0.05% of fill value) sent to the protocol treasury.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_MAKERS]: "25/30 of the recorded spot fill fee (0.25% of fill value) rebated to the maker.",
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
