import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const PONS_FEE_ESCROW = "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e";
const WIF_TREASURY = "0x311B0Cd65dc9b492b2A2Ae9b351d96614eb7eb8a"; // indexed recipient filter (topic1)

const CLAIMED_EVENT =
  "event Claimed(address indexed recipient, uint256 amount)";
// Claimed(address,uint256) — recipient is topic1
const CLAIMED_TOPIC =
  "0xd8138f8a3f377c5259ca548e70e4c2de94f129f5a11036a15b69513cba2b426a";
const WIF_TREASURY_TOPIC = `0x000000000000000000000000${WIF_TREASURY.slice(2).toLowerCase()}`;

const LABEL = "Pons Creator Rewards";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: PONS_FEE_ESCROW,
    eventAbi: CLAIMED_EVENT,
    topics: [CLAIMED_TOPIC, WIF_TREASURY_TOPIC],
  });

  for (const log of logs) {
    dailyFees.addGasToken(log.amount, LABEL);
    dailyRevenue.addGasToken(log.amount, LABEL);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Native ETH creator rewards claimed from PonsV2FeeEscrow for World is Flat ($WIF).",
  Revenue: "100% of claimed Pons creator rewards are retained by the WIF treasury.",
  ProtocolRevenue: "All claimed Pons creator rewards flow to the WIF treasury.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL]:
      "Creator share of Pons swap fees on the $WIF pool, claimed from PonsV2FeeEscrow.",
  },
  Revenue: {
    [LABEL]: "Claimed Pons creator rewards retained by the WIF treasury.",
  },
  ProtocolRevenue: {
    [LABEL]: "Claimed Pons creator rewards retained by the WIF treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-22",
  methodology,
  breakdownMethodology,
  doublecounted: true, // ponsdotfamily
};

export default adapter;
