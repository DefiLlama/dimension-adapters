import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// flowr (https://flowrhood.app) — an on-chain garden game on Robinhood Chain. Four flower
// plots are always live; anyone can take a plot over by paying its current ETH price into
// the FlowrGarden contract. 75% of that payment goes straight back to the gardener being
// replaced, and the plot mines FLOWR for its new holder until it wilts or is taken again.
// The remaining 25% powers FLOWR buybacks, staking rewards and the treasury.
const FLOWR_GARDEN = "0x0bD039335a08f9b143ecBD0d29CdC89083697B96";

const PLANTED_EVENT = "event Planted(uint8 indexed flowerId,address indexed newHolder,address indexed prevHolder,uint256 price,uint256 prevHolderPayout,uint256 tokensAccrued)";

// The previous-gardener share (75%) is immutable, so the protocol envelope is always the
// remaining 25% of each payment. Inside the envelope, the staking distribution (6.25%)
// went live on 2026-07-11; on launch day the full envelope accrued to the protocol.
const STAKING_SHARE_BPS = 625n;
const BUYBACKS_SHARE_BPS = 1050n;
const BPS = 10_000n;
const STAKING_LIVE_FROM = 1783728000; // 2026-07-11T00:00:00Z

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: FLOWR_GARDEN,
    eventAbi: PLANTED_EVENT,
  });

  const stakingLive = options.startTimestamp >= STAKING_LIVE_FROM;

  for (const log of logs) {
    const price = BigInt(log.price);
    const payout = BigInt(log.prevHolderPayout);

    if (payout > price) {
      throw new Error(`flowr: Planted payout ${payout} is larger than its price ${price}`);
    }

    // Derived from the event rather than assumed: envelope = price minus the 75% payout.
    const envelope = price - payout;
    const toStakers = stakingLive ? (price * STAKING_SHARE_BPS) / BPS : 0n;
    const toBuybacks = (price * BUYBACKS_SHARE_BPS) / BPS;
    if (toStakers > envelope) {
      throw new Error(`flowr: staking share ${toStakers} cannot exceed the envelope ${envelope}`);
    }

    dailyVolume.addGasToken(price);
    dailyFees.addGasToken(envelope, "Protocol Envelope Fees");
    dailyRevenue.addGasToken(envelope, "Protocol Envelope Fees");

    dailyHoldersRevenue.addGasToken(toStakers, "Envelope Fees to $FLOWR Stakers");
    dailyHoldersRevenue.addGasToken(toBuybacks, "Envelope Fees to $FLOWR Buybacks");

    dailyProtocolRevenue.addGasToken(envelope - toStakers - toBuybacks, "Envelope Fees to Treasury");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
}

const methodology = {
  Volume: "ETH paid into FlowrGarden to take over flower plots (Planted.price).",
  Fees: "25% of each takeover, paid by players to the protocol envelope.",
  Revenue: "The protocol envelope of each takeover — Planted.price minus the previous-gardener payout — which is 25% of the payment by construction.",
  ProtocolRevenue: "8.25% of each takeover goes to the protocol treasury.",
  HoldersRevenue: "Includes 10.5% of each takeover going to $FLOWR buybacks and the 6.25% staking distribution, live since 2026-07-11.",
};

const breakdownMethodology = {
  Fees: {
    "Protocol Envelope Fees": "25% of each takeover, paid by players to the protocol envelope.",
  },
  Revenue: {
    "Protocol Envelope Fees": "25% of each takeover, paid by players to the protocol envelope.",
  },
  ProtocolRevenue: {
    "Envelope Fees to Treasury": "8.25% of each takeover goes to the protocol treasury.",
  },
  HoldersRevenue: {
    "Envelope Fees to $FLOWR Stakers": "6.25% of each takeover, distributed to FLOWR stakers.",
    "Envelope Fees to $FLOWR Buybacks": "10.5% of each takeover, distributed to $FLOWR buybacks.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-10",
  methodology,
  breakdownMethodology,
};

export default adapter;
