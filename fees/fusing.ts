import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

/*
 * fusi.ng is a token launchpad on Ethereum. Every launch is a Uniswap V4 position held by a fusi.ng
 * locker contract. Trading fees accrue in the pool and are split on collection: the locker pays the
 * protocol share to the fusi.ng treasury and the rest to the launch's creator, and emits the split.
 *
 * Fees are recognised when collected (that is when the split is fixed on chain), from the lockers of
 * every release. The protocol share per launch is protocolFeeShareBps of the base fee, set at launch.
 * Docs: https://fusi.ng/docs#tech
 */

// Single-pool lockers: FeesCollected(token, currency0, currency1, protocol0, protocol1, creator0, creator1)
const LOCKERS = [
  "0x7dC54744bA6037DD7B5220326dC7A4488a6524C6", // V1 FusingLaunchLocker
  "0x357ffD979B2D4aDd7122728b7dF1e38F2cB4cCEE", // V2 FusingLaunchLocker
  "0x6fADf16e8C462b372CAdC2d483eF0799096b2435", // V3a FusingLaunchLocker
  "0x3490fF94267fbfa1a6EEE93E1bC7487A2a4D6407", // V3b FusingLaunchLocker
  "0x7Ea0E4EAF4824e6765a73Dd7B845Cd1449524ee4", // V3c FusingLaunchLocker
];

// V3 lockers also collect multi-market launches one market at a time with MarketFeesCollected.
const V3_LOCKERS = LOCKERS.slice(2);

// V1/V2 multi-pool lockers: FeesCollected(token, marketIndex, currency0, currency1, protocol0, protocol1, creator0, creator1)
const MULTI_LOCKERS = [
  "0xd711136c067F88f2C952c4E0eE068253f139abB4", // V1 MultiFuseLocker
  "0x4E09e2bF71A670319b7931DCd4C960C0e2AB415B", // V2 MultiFuseLocker
];

const EVENT_SINGLE = "event FeesCollected(address indexed token, address currency0, address currency1, uint256 protocolAmount0, uint256 protocolAmount1, uint256 creatorAmount0, uint256 creatorAmount1)";
const EVENT_MARKET = "event MarketFeesCollected(address indexed token, uint8 marketIndex, address currency0, address currency1, uint256 protocol0, uint256 protocol1, uint256 creator0, uint256 creator1)";
const EVENT_MULTI = "event FeesCollected(address indexed token, uint256 indexed marketIndex, address currency0, address currency1, uint256 protocolAmount0, uint256 protocolAmount1, uint256 creatorAmount0, uint256 creatorAmount1)";

const LABEL_FEES = METRIC.TRADING_FEES;
const LABEL_PROTOCOL = "Trading Fees To Protocol";
const LABEL_CREATORS = "Trading Fees To Token Creators";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const add = (c0: string, c1: string, p0: any, p1: any, cr0: any, cr1: any) => {
    // currency0 is the zero address on native-ETH pools; Balances treats it as ETH.
    dailyFees.add(c0, p0, LABEL_FEES);
    dailyFees.add(c1, p1, LABEL_FEES);
    dailyFees.add(c0, cr0, LABEL_FEES);
    dailyFees.add(c1, cr1, LABEL_FEES);
    dailyRevenue.add(c0, p0, LABEL_PROTOCOL);
    dailyRevenue.add(c1, p1, LABEL_PROTOCOL);
    dailySupplySideRevenue.add(c0, cr0, LABEL_CREATORS);
    dailySupplySideRevenue.add(c1, cr1, LABEL_CREATORS);
  };

  const [single, market, multi] = [
    await options.getLogs({ targets: LOCKERS, eventAbi: EVENT_SINGLE }),
    await options.getLogs({ targets: V3_LOCKERS, eventAbi: EVENT_MARKET }),
    await options.getLogs({ targets: MULTI_LOCKERS, eventAbi: EVENT_MULTI }),
  ];
  for (const l of single) add(l.currency0, l.currency1, l.protocolAmount0, l.protocolAmount1, l.creatorAmount0, l.creatorAmount1);
  for (const l of market) add(l.currency0, l.currency1, l.protocol0, l.protocol1, l.creator0, l.creator1);
  for (const l of multi) add(l.currency0, l.currency1, l.protocolAmount0, l.protocolAmount1, l.creatorAmount0, l.creatorAmount1);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by traders on fusi.ng launch pools (Uniswap V4), counted when the fusi.ng locker collects and splits them.",
  UserFees: "Trading fees paid by traders on fusi.ng launch pools.",
  Revenue: "The protocol's share of collected trading fees, paid to the fusi.ng treasury.",
  ProtocolRevenue: "The protocol's share of collected trading fees, paid to the fusi.ng treasury.",
  SupplySideRevenue: "The token creator's share of collected trading fees.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL_FEES]: "Swap fees on fusi.ng launch pools, from the locker FeesCollected / MarketFeesCollected events of every release (V1, V2, V3a, V3b, V3c).",
  },
  UserFees: {
    [LABEL_FEES]: "Swap fees on fusi.ng launch pools, from the locker FeesCollected / MarketFeesCollected events of every release (V1, V2, V3a, V3b, V3c).",
  },
  Revenue: {
    [LABEL_PROTOCOL]: "Protocol share of collected swap fees (protocolAmount fields), paid to the fusi.ng treasury.",
  },
  ProtocolRevenue: {
    [LABEL_PROTOCOL]: "Protocol share of collected swap fees (protocolAmount fields), paid to the fusi.ng treasury.",
  },
  SupplySideRevenue: {
    [LABEL_CREATORS]: "Creator share of collected swap fees (creatorAmount fields), paid to each launch's creator.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-09-10", // V1 locker deployment (block 25949999)
  methodology,
  breakdownMethodology,
};

export default adapter;
