// Fuci: fees from AI agents created on Arc through the Fuci agent factory (https://www.fuci.family).
// FuciAgentFactory: every agent created on-chain pays its fee (1 USDC) to the Fuci treasury and emits AgentCreated.
// FuciEscrow: every job paid out to its agent pays a fee (1% at launch, capped at 5%) to the treasury and emits Released.
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// FuciAgentFactory on Arc mainnet, verified source: https://explorer.arc.io/address/0x77fa3ae9604539fee8f199adc02f12f318c2bfbc?tab=contract
const FACTORY = "0x77fa3ae9604539fee8f199adc02f12f318c2bfbc"; // FuciAgentFactory on Arc, deployed at block 22474356
// USDC on Arc (ERC-20 interface of the native USDC, 6 decimals): https://docs.arc.io
const USDC = ADDRESSES.arc.USDC;

// FuciEscrow on Arc mainnet (jobs between AI agents, paid in USDC), verified source:
// https://explorer.arc.io/address/0xb30d1c83454260614ccf06ae0f3c1af8b47515b1?tab=contract
const ESCROW = "0xb30d1c83454260614ccf06ae0f3c1af8b47515b1"; // deployed 2026-09-29

// Emitted once per agent; feePaid is the USDC (6 decimals) sent to the treasury in the same call.
const AGENT_CREATED = "event AgentCreated(uint256 indexed agentId, address indexed owner, uint256 feePaid, string name, string agentURI)";
// Emitted once per job paid out; fee is the USDC (6 decimals) sent to the treasury in the same call (refunds pay no fee).
const RELEASED = "event Released(uint256 indexed jobId, address indexed provider, uint256 paid, uint256 fee, address by)";

// Breakdown labels: where the fee comes from, and where it goes.
const CREATION_FEES = "Agent Creation Fees";
const CREATION_FEES_TO_TREASURY = "Agent Creation Fees To Treasury";
const ESCROW_FEES = "Escrow Job Fees";
const ESCROW_FEES_TO_TREASURY = "Escrow Job Fees To Treasury";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const logs = await options.getLogs({ target: FACTORY, eventAbi: AGENT_CREATED });
  for (const log of logs) {
    dailyFees.add(USDC, log.feePaid, CREATION_FEES);
    // The factory sends the whole fee to the treasury in the same call: all of it is protocol revenue.
    dailyRevenue.add(USDC, log.feePaid, CREATION_FEES_TO_TREASURY);
  }
  const released = await options.getLogs({ target: ESCROW, eventAbi: RELEASED });
  for (const log of released) {
    dailyFees.add(USDC, log.fee, ESCROW_FEES);
    // The escrow sends the whole fee to the treasury in the same call.
    dailyRevenue.add(USDC, log.fee, ESCROW_FEES_TO_TREASURY);
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
};

const methodology = {
  Fees: "USDC creation fee paid by users to create an AI agent on Arc through the Fuci agent factory (1 USDC per agent at launch; read from each AgentCreated event), plus the fee on escrow jobs paid out to an agent (1% of the job at launch; read from each FuciEscrow Released event).",
  Revenue: "All creation and escrow fees go to the Fuci treasury (a Safe multisig).",
  ProtocolRevenue: "All creation and escrow fees go to the Fuci treasury (a Safe multisig).",
};

const breakdownMethodology = {
  Fees: {
    [CREATION_FEES]: "Agent creation fee, read from the feePaid field of AgentCreated events of the Fuci agent factory.",
    [ESCROW_FEES]: "Fee on escrow jobs paid out to the agent, read from the fee field of FuciEscrow Released events.",
  },
  Revenue: {
    [CREATION_FEES_TO_TREASURY]: "The full creation fee, transferred to the Fuci treasury in the same transaction.",
    [ESCROW_FEES_TO_TREASURY]: "The full escrow fee, transferred to the Fuci treasury in the same transaction.",
  },
  ProtocolRevenue: {
    [CREATION_FEES_TO_TREASURY]: "The full creation fee, transferred to the Fuci treasury in the same transaction.",
    [ESCROW_FEES_TO_TREASURY]: "The full escrow fee, transferred to the Fuci treasury in the same transaction.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-24", // factory deployed 2026-09-24 (block 22474356)
  methodology,
  breakdownMethodology,
};

export default adapter;
