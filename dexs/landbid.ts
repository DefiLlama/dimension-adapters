import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const WORLD_MINER = "0x0B28B589Cf3FDfaeF53054D2914fF36D6f1baBCc";

const CONQUER_EVENT =
  "event Conquer(uint8 indexed continentId,address indexed newHolder,address indexed prevHolder,uint256 price,uint256 prevHolderPayout,uint256 tokensAccrued)";

const BPS_BASE = 10000n;
const BUYBACKS_BPS = 1125n;
const STAKING_BPS = 300n;
const INCENTIVES_BPS = 75n;

const toBigInt = (value: any) => BigInt(value.toString());
const mulBps = (amount: bigint, bps: bigint) => amount * bps / BPS_BASE;

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const conquerEvents = await options.getLogs({
    target: WORLD_MINER,
    eventAbi: CONQUER_EVENT,
  });

  for (const log of conquerEvents) {
    const price = toBigInt(log.price);
    const prevHolderPayout = toBigInt(log.prevHolderPayout);
    const buybacks = mulBps(price, BUYBACKS_BPS);
    const staking = mulBps(price, STAKING_BPS);
    const incentives = mulBps(price, INCENTIVES_BPS);
    const protocolAllocation = price - prevHolderPayout;

    // Land Bid uses 100% flow-through accounting: users pay price into WorldMiner,
    // and WorldMiner redistributes it under protocol rules in the same transaction.
    dailyFees.addGasToken(price.toString());
    dailyRevenue.addGasToken(price.toString());
    dailyProtocolRevenue.addGasToken(price.toString());

    dailySupplySideRevenue.addGasToken(prevHolderPayout.toString(), "Revenue paid back");
    dailyHoldersRevenue.addGasToken(staking.toString(), "Staking distribution");

    // This should equal buybacks + staking + incentives in the active V2 fee split.
    if (protocolAllocation !== buybacks + staking + incentives) {
      dailyRevenue.addGasToken("0", "Protocol allocation reconciliation");
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
}

const methodology = {
  Fees: "100% of Conquer.price paid by users into the active WorldMiner contract for the core gameplay action.",
  Revenue: "100% of Conquer.price. Land Bid uses a flow-through model: ETH enters WorldMiner and is redistributed by the protocol contract according to game rules.",
  ProtocolRevenue: "100% of Conquer.price under Land Bid's flow-through methodology. The protocol receives, accounts for, and redistributes the full payment.",
  SupplySideRevenue: "85% of each Conquer paid back to the previous continent holder as an instant game payout.",
  HoldersRevenue: "3% of each Conquer distributed to the LAND staking contract.",
};

const breakdownMethodology = {
  Fees: {
    "Conquer payments": "100% of Conquer.price paid by users into WorldMiner.",
  },
  Revenue: {
    "Conquer payments": "100% of Conquer.price under Land Bid's flow-through methodology.",
  },
  ProtocolRevenue: {
    "Conquer payments": "100% of Conquer.price enters WorldMiner and is redistributed by the protocol contract.",
  },
  SupplySideRevenue: {
    "Revenue paid back": "85% of each Conquer paid back to the previous continent holder.",
  },
  HoldersRevenue: {
    "Staking distribution": "3% of each Conquer distributed to the LAND staking contract.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-05-11",
  methodology,
  breakdownMethodology,
};

export default adapter;
