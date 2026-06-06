import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// USDC on Base (Mycelia settles in USDC only)
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Standard ERC-20 Transfer event topic
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Mycelia's two revenue wallets:
//  1. Direct settlement — full gross USDC from the TypeScript x402 proxy
//  2. Orbis marketplace payouts — 80% net of Orbis-mediated revenue (Orbis
//     facilitator retains 20%); paid weekly to the configured payout address.
const RECEIVERS: Record<string, { address: string; label: string }> = {
  direct: {
    address: '0xD593832Ce9C2B13B192ba50B55dd9AF44e96700d',
    label: 'Direct settlement',
  },
  orbis_payouts: {
    address: '0xfF51E0339A17f5fcBa6eAf0E06518d0042ac84bf',
    label: 'Orbis marketplace payouts (80% net)',
  },
};

// Pad a 20-byte address into a 32-byte topic value
const padTopic = (addr: string) =>
  '0x' + addr.toLowerCase().slice(2).padStart(64, '0');

// Extract raw 20-byte address from a 32-byte topic value
const topicToAddress = (topic: string) =>
  '0x' + topic.slice(-40).toLowerCase();

// Mycelia-controlled wallets — used to exclude internal transfers
// (self-sends and cross-wallet transfers) from fee aggregation
const INTERNAL_ADDRESSES = new Set(
  Object.values(RECEIVERS).map(r => r.address.toLowerCase())
);

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  for (const receiver of Object.values(RECEIVERS)) {
    const logs = await options.getLogs({
      target: USDC_BASE,
      topics: [TRANSFER_TOPIC, null, padTopic(receiver.address)] as any,
    });

    for (const log of logs) {
      // Exclude internal transfers between Mycelia-controlled wallets
      // (self-sends or cross-wallet rebalancing) to prevent overstating fees
      const sender = topicToAddress(log.topics[1] as string);
      if (INTERNAL_ADDRESSES.has(sender)) continue;

      // ERC-20 Transfer 'value' lives in the data field as a 32-byte uint
      const amount = BigInt(log.data);
      dailyFees.add(USDC_BASE, amount, receiver.label);
    }
  }

  // No supply-side or holder splits — protocol keeps 100% of fees.
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyUserFees: dailyFees,
  };
};

const methodology = {
  Fees: "USDC payments received for Mycelia oracle API calls. Each Mycelia API request requires a per-call USDC payment on Base. The adapter tracks USDC Transfer events on Base to two protocol-controlled wallets: (1) the direct settlement wallet for payments via the Mycelia-operated x402 proxy (full gross), and (2) the Orbis marketplace payout wallet, which receives weekly payouts representing 80% of revenue from Orbis-mediated traffic (Orbis retains 20% as a facilitator fee). Transfers where the sender is one of the two Mycelia-controlled wallets are excluded (self-sends and cross-wallet internal transfers).",
  Revenue: "100% of fees accrue to the protocol treasury. There is no supply-side, LP, integrator, or token-holder revenue split.",
  ProtocolRevenue: "Same as Revenue — all USDC payments accumulate in the protocol-operated receiver wallets.",
  UserFees: "Same as Fees — every payment is made directly by an end user (human or autonomous agent) per API call.",
};

const breakdownMethodology = {
  Fees: {
    'Direct settlement': 'USDC received via the Mycelia-operated TypeScript x402 proxy (myceliasignal-x402-proxy.service), settling directly to 0xD593832Ce9C2B13B192ba50B55dd9AF44e96700d. Represents full gross fees for direct path traffic.',
    'Orbis marketplace payouts (80% net)': 'USDC received from the Orbis x402 marketplace facilitator at the configured payout address 0xfF51E0339A17f5fcBa6eAf0E06518d0042ac84bf. Represents 80% of customer payments routed through Orbis (the remaining 20% is retained by Orbis as a facilitator fee). Payouts are batched weekly.',
  },
};

const adapter: SimpleAdapter = {
  methodology,
  breakdownMethodology,
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2026-04-12',
    },
  },
};

export default adapter;
