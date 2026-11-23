import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from "../helpers/coreAssets.json";

// Kyte: non-custodial, fully collateralised options market on Robinhood Chain (https://kyte.sh).
// Every option is paid for in WETH. The market contracts take 3% of the premium when an offer fills
// (OptionBought.fee) and 0.1% of the strike when an option is exercised (Exercised.fee); both land in the
// FeeVault, which splits them once per epoch. The premium itself goes to the option writer: it is premium
// volume, not a fee, so it is not counted here.
// Older market sets keep settling their open positions, so every version is read.
const WETH = ADDRESSES.robinhood.WETH;
const MARKETS = [
  "0x459cF18A424271A417547F6B349e962c09e492EE", // CallMarket v1
  "0xD1a3c2Fa0E7901437929B7518AD66d71B1d676a4", // PutMarket v1
  "0x15B5d324960234B193246B122C555e88E341eD72", // CallMarket v2
  "0x1025f5b1f7549a1192226ddC0D36E1359A8D1305", // PutMarket v2
  "0xb6759D8893601BB7c1A032eC8ea40C856a6adf80", // CallMarket v3
  "0x2E2d5DfB4cf30d15688Cc2DDD30641c78DFfcb35", // PutMarket v3
];

const STAKERS_SHARE = 0.3;
const BUYBACK_SHARE = 0.2;
const OPS_SHARE = 0.5;

const LABEL_PREMIUM_FEES = "Option Premium Fees";
const LABEL_EXERCISE_FEES = "Option Exercise Fees";
const LABEL_TO_STAKERS = "Fees To KYTE Stakers";
const LABEL_TO_OPS = "Fees To Ops";

const EVENT_BOUGHT = "event OptionBought(uint256 indexed id, address indexed buyer, uint256 premium, uint256 fee)";
const EVENT_EXERCISED = "event Exercised(uint256 indexed id, address indexed holder, uint256 strike, uint256 fee)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const bought = await options.getLogs({ targets: MARKETS, eventAbi: EVENT_BOUGHT });
  for (const log of bought) dailyFees.add(WETH, log.fee, LABEL_PREMIUM_FEES);

  const exercised = await options.getLogs({ targets: MARKETS, eventAbi: EVENT_EXERCISED });
  for (const log of exercised) dailyFees.add(WETH, log.fee, LABEL_EXERCISE_FEES);

  const dailyHoldersRevenue = dailyFees.clone(STAKERS_SHARE, LABEL_TO_STAKERS);
  dailyHoldersRevenue.addBalances(dailyFees.clone(BUYBACK_SHARE, METRIC.TOKEN_BUY_BACK));
  const dailyProtocolRevenue = dailyFees.clone(OPS_SHARE, LABEL_TO_OPS);

  const dailyRevenue = dailyHoldersRevenue.clone();
  dailyRevenue.addBalances(dailyProtocolRevenue);

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-11-01",
  methodology: {
    Fees: "3% of the premium when an option offer fills and 0.1% of the strike when an option is exercised, paid in WETH. Premiums received by option writers are not fees and are excluded.",
    UserFees: "3% of the premium paid by option buyers and 0.1% of the strike paid by option holders when they exercise, in WETH.",
    Revenue: "All option premium and exercise fees, collected by the Kyte FeeVault and split between KYTE stakers, KYTE buy-and-burn and the ops wallet.",
    HoldersRevenue: "50% of option premium and exercise fees: 30% paid to KYTE stakers in WETH and 20% sent to the KYTE buy-and-burn contract.",
    ProtocolRevenue: "50% of option premium and exercise fees, sent to the Kyte ops wallet.",
  },
  breakdownMethodology: {
    Fees: {
      [LABEL_PREMIUM_FEES]: "3% of the premium on every filled option offer.",
      [LABEL_EXERCISE_FEES]: "0.1% of the strike on every option exercise.",
    },
    UserFees: {
      [LABEL_PREMIUM_FEES]: "3% of the premium, paid by the option buyer.",
      [LABEL_EXERCISE_FEES]: "0.1% of the strike, paid by the option holder on exercise.",
    },
    Revenue: {
      [LABEL_TO_STAKERS]: "30% of option premium and exercise fees, paid to KYTE stakers in WETH.",
      [METRIC.TOKEN_BUY_BACK]: "20% of option premium and exercise fees, sent to the KYTE buy-and-burn contract.",
      [LABEL_TO_OPS]: "50% of option premium and exercise fees, sent to the Kyte ops wallet.",
    },
    HoldersRevenue: {
      [LABEL_TO_STAKERS]: "30% of option premium and exercise fees, paid to KYTE stakers in WETH.",
      [METRIC.TOKEN_BUY_BACK]: "20% of option premium and exercise fees, sent to the KYTE buy-and-burn contract.",
    },
    ProtocolRevenue: {
      [LABEL_TO_OPS]: "50% of option premium and exercise fees, sent to the Kyte ops wallet.",
    },
  },
};

export default adapter;
