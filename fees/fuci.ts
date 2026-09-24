// Fuci: fees from AI agents created on Arc through the Fuci agent factory (https://www.fuci.family).
// FuciAgentFactory: every agent created on-chain pays its fee (1 USDC) to the Fuci treasury and emits AgentCreated.
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// FuciAgentFactory on Arc mainnet, verified source: https://explorer.arc.io/address/0x77fa3ae9604539fee8f199adc02f12f318c2bfbc?tab=contract
const FACTORY = "0x77fa3ae9604539fee8f199adc02f12f318c2bfbc"; // FuciAgentFactory on Arc, deployed at block 22474356
// USDC on Arc (ERC-20 interface of the native USDC, 6 decimals): https://docs.arc.io
const USDC = ADDRESSES.arc.USDC;

// Emitted once per agent; feePaid is the USDC (6 decimals) sent to the treasury in the same call.
const AGENT_CREATED = "event AgentCreated(uint256 indexed agentId, address indexed owner, uint256 feePaid, string name, string agentURI)";

// Breakdown labels: where the fee comes from, and where it goes.
const CREATION_FEES = "Agent Creation Fees";
const CREATION_FEES_TO_TREASURY = "Agent Creation Fees To Treasury";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const logs = await options.getLogs({ target: FACTORY, eventAbi: AGENT_CREATED });
  for (const log of logs) {
    dailyFees.add(USDC, log.feePaid, CREATION_FEES);
    // The factory sends the whole fee to the treasury in the same call: all of it is protocol revenue.
    dailyRevenue.add(USDC, log.feePaid, CREATION_FEES_TO_TREASURY);
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
};

const methodology = {
  Fees: "USDC creation fee paid by users to create an AI agent on Arc through the Fuci agent factory (1 USDC per agent at launch; read from each AgentCreated event).",
  Revenue: "All creation fees go to the Fuci treasury (a Safe multisig).",
  ProtocolRevenue: "All creation fees go to the Fuci treasury (a Safe multisig).",
};

const breakdownMethodology = {
  Fees: { [CREATION_FEES]: "Agent creation fee, read from the feePaid field of AgentCreated events of the Fuci agent factory." },
  Revenue: { [CREATION_FEES_TO_TREASURY]: "The full creation fee, transferred to the Fuci treasury in the same transaction." },
  ProtocolRevenue: { [CREATION_FEES_TO_TREASURY]: "The full creation fee, transferred to the Fuci treasury in the same transaction." },
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
