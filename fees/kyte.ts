import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Kyte: non-custodial, fully collateralised options market on Robinhood Chain (https://kyte.sh).
// Every option is paid for in WETH. The market contracts take 3% of the premium when an offer fills
// (OptionBought.fee) and 0.1% of the strike when an option is exercised (Exercised.fee); both land in the
// FeeVault, which splits them once per epoch: 30% to $KYTE stakers, 20% to buy-and-burn $KYTE, 50% to ops.
// Older market sets keep settling their open positions, so every version is read.
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const MARKETS = [
  "0x459cF18A424271A417547F6B349e962c09e492EE", // CallMarket v1
  "0xD1a3c2Fa0E7901437929B7518AD66d71B1d676a4", // PutMarket v1
  "0x15B5d324960234B193246B122C555e88E341eD72", // CallMarket v2
  "0x1025f5b1f7549a1192226ddC0D36E1359A8D1305", // PutMarket v2
  "0xb6759D8893601BB7c1A032eC8ea40C856a6adf80", // CallMarket v3
  "0x2E2d5DfB4cf30d15688Cc2DDD30641c78DFfcb35", // PutMarket v3
];

const EVENT_BOUGHT = "event OptionBought(uint256 indexed id, address indexed buyer, uint256 premium, uint256 fee)";
const EVENT_EXERCISED = "event Exercised(uint256 indexed id, address indexed holder, uint256 strike, uint256 fee)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const bought = await options.getLogs({ targets: MARKETS, eventAbi: EVENT_BOUGHT });
  for (const log of bought) {
    dailyFees.add(WETH, log.fee, "Premium fee");
    // the seller receives the premium net of the protocol fee
    dailySupplySideRevenue.add(WETH, BigInt(log.premium) - BigInt(log.fee), "Premiums to option writers");
  }

  const exercised = await options.getLogs({ targets: MARKETS, eventAbi: EVENT_EXERCISED });
  for (const log of exercised) dailyFees.add(WETH, log.fee, "Exercise fee");

  // FeeVault split: 30% stakers + 20% buyback-and-burn (holders), 50% ops (protocol)
  const dailyRevenue = dailyFees.clone();
  const dailyHoldersRevenue = dailyFees.clone(0.5);
  const dailyProtocolRevenue = dailyFees.clone(0.5);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-25",
  methodology: {
    Fees: "3% of the premium when an option offer fills and 0.1% of the strike when an option is exercised, paid in WETH by the buyer or exerciser.",
    UserFees: "The same fees, all paid by option buyers and exercisers.",
    Revenue: "All fees go to the Kyte FeeVault and are split on-chain once per epoch.",
    HoldersRevenue: "50% of fees: 30% paid to $KYTE stakers in WETH and 20% used to buy and burn $KYTE through Uniswap v4.",
    ProtocolRevenue: "50% of fees to the Kyte ops wallet.",
    SupplySideRevenue: "Premiums received by option writers, net of the protocol fee.",
  },
  breakdownMethodology: {
    Fees: {
      "Premium fee": "3% of the premium on every filled offer (OptionBought.fee).",
      "Exercise fee": "0.1% of the strike on every exercise (Exercised.fee).",
    },
    SupplySideRevenue: {
      "Premiums to option writers": "Premium paid by the buyer minus the 3% protocol fee.",
    },
  },
};

export default adapter;
