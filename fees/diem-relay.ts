import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// DIEM Relay — Base.
// Venice AI inference is sold for USDC via cheaptokens.ai. That USDC revenue lands
// on a RevenueSplitter, which on distribute() splits it into a platform cut retained
// by the protocol and a staker cut streamed to sDIEM stakers via notifyRewardAmount.
const USDC = ADDRESSES.base.USDC;

const REVENUE_SPLITTERS = [
  "0xd185138CEA135E60CA6E567BE53DEC81D89Ce7D6", // v1 — feeds sDIEM v1 (legacy)
  "0x96DAE834f7276D50a09149D938e998b1766AFCDa", // v2 — fed sDIEM v2 (retired)
  "0x213c8d7434E2ae7AA1C392767c5120778D413215", // v3 — feeds sDIEM v2 (live)
];

const DISTRIBUTED_EVENT = "event Distributed(address indexed caller, uint256 platformCut, uint256 stakerCut, uint256 timestamp)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const logs = await options.getLogs({
    targets: REVENUE_SPLITTERS,
    eventAbi: DISTRIBUTED_EVENT,
  });

  for (const log of logs) {
    dailyFees.add(USDC, log.platformCut + log.stakerCut, "Compute Distribution Fees");

    dailyRevenue.add(USDC, log.platformCut, "Compute Distribution Fees to Protocol");
    dailyRevenue.add(USDC, log.stakerCut, "Compute Distribution Fees to DIEM stakers");

    dailyProtocolRevenue.add(USDC, log.platformCut, "Compute Distribution Fees to Protocol");

    dailyHoldersRevenue.add(USDC, log.stakerCut, "Compute Distribution Fees to DIEM stakers");
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "USDC compute revenue (Venice AI inference sold via cheaptokens.ai) distributed by the DIEM Relay RevenueSplitter contracts.",
  Revenue: "All the compute revenue (Venice AI inference sold via cheaptokens.ai) either retained by the protocol (currently 10%, historically 20%) or streamed to sDIEM stakers.",
  ProtocolRevenue: "Platform cut retained by the DIEM Relay platform (currently 10%, historically 20%).",
  HoldersRevenue: "Staker cut (currently 90%, historically 80%) streamed to sDIEM stakers via notifyRewardAmount.",
}

const breakdownMethodology = {
  Fees: {
    "Compute Distribution Fees": "USDC compute revenue (Venice AI inference sold via cheaptokens.ai) distributed by the DIEM Relay RevenueSplitter contracts.",
  },
  Revenue: {
    "Compute Distribution Fees to Protocol": "Platform cut retained by the DIEM Relay platform (currently 10%, historically 20%).",
    "Compute Distribution Fees to DIEM stakers": "Staker cut (currently 90%, historically 80%) streamed to sDIEM stakers via notifyRewardAmount.",
  },
  ProtocolRevenue: {
    "Compute Distribution Fees to Protocol": "Platform cut retained by the DIEM Relay platform (currently 10%, historically 20%).",
  },
  HoldersRevenue: {
    "Compute Distribution Fees to DIEM stakers": "Staker cut (currently 90%, historically 80%) streamed to sDIEM stakers via notifyRewardAmount.",
  },
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  start: "2026-04-14", // RevenueSplitter v1 deployment
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
