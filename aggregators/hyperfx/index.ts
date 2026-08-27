import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Hyperbridge IntentGateway, same address on every chain (CREATE2).
// https://docs.hyperbridge.network/developers/evm/contract-addresses/mainnet
const INTENT_GATEWAY = "0xAe041F7B0CB581876832830baeB6a2Aa2a3C9716";

const TOKEN_INFO = "(bytes32 token, uint256 amount)[]";
const ORDER_PLACED = `event OrderPlaced(bytes32 user, string source, string destination, uint256 deadline, uint256 nonce, uint256 fees, address session, bytes32 beneficiary, ${TOKEN_INFO} predispatch, ${TOKEN_INFO} inputs, ${TOKEN_INFO} outputs, bytes predispatchCall, bytes outputCall, bytes32 graffiti)`;
// Emitted by the same proxy before the 2026-08-08 implementation upgrade.
const ORDER_PLACED_LEGACY = `event OrderPlaced(bytes32 user, string source, string destination, uint256 deadline, uint256 nonce, uint256 fees, address session, bytes32 beneficiary, ${TOKEN_INFO} predispatch, ${TOKEN_INFO} inputs, ${TOKEN_INFO} outputs)`;
// Protocol fee (5 bps) deducted from each input at placement and retained by the gateway.
const DUST_COLLECTED = "event DustCollected(address token, uint256 amount)";

const PROTOCOL_FEES_TO_TREASURY = "Protocol Fees To Treasury";

const bytes32ToAddress = (b: string) => "0x" + b.slice(-40);

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  const placed = await getLogs({ targets: [INTENT_GATEWAY], eventAbi: ORDER_PLACED, entireLog: true });
  const legacy = await getLogs({ targets: [INTENT_GATEWAY], eventAbi: ORDER_PLACED_LEGACY, entireLog: true });
  const dust = await getLogs({ targets: [INTENT_GATEWAY], eventAbi: DUST_COLLECTED, entireLog: true });

  const orders = [...placed, ...legacy];
  for (const log of orders) {
    for (const { token, amount } of log.args.inputs) dailyVolume.add(bytes32ToAddress(token), amount);
  }

  // DustCollected is also emitted on fills (surplus share); only count the ones in placement txs.
  const placementTxs = new Set(orders.map((log) => log.transactionHash));
  for (const log of dust) {
    if (!placementTxs.has(log.transactionHash)) continue;
    // Inputs are emitted net of the protocol fee; volume is what the user sent.
    dailyVolume.add(log.args.token, log.args.amount);
    dailyFees.add(log.args.token, log.args.amount, METRIC.PROTOCOL_FEES);
    dailyRevenue.add(log.args.token, log.args.amount, PROTOCOL_FEES_TO_TREASURY);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Volume: "Input value of every order placed on the Hyperbridge IntentGateway (same-chain and cross-chain), counted on the source chain.",
  Fees: "0.05% protocol fee deducted from order inputs at placement.",
  Revenue: "The 0.05% protocol fee, retained by the gateway.",
  ProtocolRevenue: "The 0.05% protocol fee, retained by the gateway.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "0.05% of each order input, deducted at placement (DustCollected events in placement txs).",
  },
  Revenue: {
    [PROTOCOL_FEES_TO_TREASURY]: "Protocol fee retained by the gateway, swept by governance.",
  },
  ProtocolRevenue: {
    [PROTOCOL_FEES_TO_TREASURY]: "Protocol fee retained by the gateway, swept by governance.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.OPTIMISM, CHAIN.BASE, CHAIN.BSC, CHAIN.POLYGON],
  start: "2026-05-25",
  methodology,
  breakdownMethodology,
};

export default adapter;
