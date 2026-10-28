import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { nullAddress } from "../helpers/token";

/*
 * fusi.ng is a token launchpad on Ethereum. Every launch is a Uniswap V4 position held by a fusi.ng
 * locker contract. Trading fees accrue in the pool and are split on collection: the locker pays the
 * protocol share to the fusi.ng treasury and the rest to the launch's creator, and emits the split.
 *
 * Fees are recognised when collected (that is when the split is fixed on chain), from the lockers of
 * every release. The protocol share per launch is protocolFeeShareBps of the base fee, set at launch.
 * Source: https://github.com/fusinglabs  Docs: https://fusi.ng/docs#tech
 */

// Single-pool lockers: FeesCollected(token, currency0, currency1, protocol0, protocol1, creator0, creator1)
const V1_LOCKER = "0x7dC54744bA6037DD7B5220326dC7A4488a6524C6"; // V1 PairPadLaunchLocker
const LOCKERS = [
  V1_LOCKER,
  "0x357ffD979B2D4aDd7122728b7dF1e38F2cB4cCEE", // V2 FusingLaunchLocker
  "0x6fADf16e8C462b372CAdC2d483eF0799096b2435", // V3a FusingLaunchLocker
  "0x3490fF94267fbfa1a6EEE93E1bC7487A2a4D6407", // V3b FusingLaunchLocker
  "0x7Ea0E4EAF4824e6765a73Dd7B845Cd1449524ee4", // V3c FusingLaunchLocker
];

// V3 lockers also collect multi-market launches one market at a time with MarketFeesCollected.
const V3_LOCKERS = LOCKERS.slice(2);

// V1/V2 multi-pool lockers: FeesCollected(token, marketIndex, currency0, currency1, protocol0, protocol1, creator0, creator1)
const V1_MULTI_LOCKER = "0xd711136c067F88f2C952c4E0eE068253f139abB4"; // V1 PairPadMultiLaunchLocker
const MULTI_LOCKERS = [
  V1_MULTI_LOCKER,
  "0x4E09e2bF71A670319b7931DCd4C960C0e2AB415B", // V2 MultiFuseLocker
];

// The V1 lockers burn the protocol's share of fees paid in the launch token instead of keeping it
// (PairPadLaunchLocker._burn / PairPadMultiLaunchLocker._burn, event ProtocolShareBurned).
// Later releases send that share to the protocol like the quote side.
const BURNS_PROTOCOL_TOKEN_SHARE = new Set([V1_LOCKER, V1_MULTI_LOCKER].map((a) => a.toLowerCase()));

// Launch fee: V1 and V2 factories charge a flat launchFee per launch, paid to protocolFeeRecipient in the
// same call (_payLaunchFee; msg.value must equal launchFee). It is 0.0005 ETH on all four and was never
// changed (no LaunchFeeUpdated events). V3 factories charge no launch fee (launchFee = 0).
const LAUNCH_FEE_ETH = 0.0005;
const SINGLE_FACTORIES = [
  "0x1550e8ac48eb9edaeaefcc9e84ba3a445141db64", // V1 PairPadLaunchFactory
  "0x595EA7017d4D543C8AbBb82F2365651fD9a3A42f", // V2 FusingLaunchFactory
];
const MULTI_FACTORIES = [
  "0x5366386ade8ba4a2b67b6a8065196b07fea2d08d", // V1 PairPadMultiLaunchFactory
  "0xA4018A1b0e073c0Cf2Ed2e819a9fC4A562CbbcCf", // V2 MultiFuseFactory
];

const EVENT_SINGLE = "event FeesCollected(address indexed token, address currency0, address currency1, uint256 protocolAmount0, uint256 protocolAmount1, uint256 creatorAmount0, uint256 creatorAmount1)";
const EVENT_MARKET = "event MarketFeesCollected(address indexed token, uint8 marketIndex, address currency0, address currency1, uint256 protocol0, uint256 protocol1, uint256 creator0, uint256 creator1)";
const EVENT_MULTI = "event FeesCollected(address indexed token, uint256 indexed marketIndex, address currency0, address currency1, uint256 protocolAmount0, uint256 protocolAmount1, uint256 creatorAmount0, uint256 creatorAmount1)";
const EVENT_LAUNCH_SINGLE = "event TokenLaunched(address indexed token, bytes32 indexed poolId, address indexed deployer, address pairToken, uint256 launchConfigId, uint24 poolFee)";
const EVENT_LAUNCH_MULTI = "event TokenLaunched(address indexed token, address indexed deployer, uint256 launchConfigId, uint24 poolFee, address[] pairTokens)";

const LABEL_FEES = METRIC.TRADING_FEES;
const LABEL_LAUNCH = "Token Launch Fees";
const LABEL_PROTOCOL = "Trading Fees To Protocol";
const LABEL_CREATORS = "Trading Fees To Token Creators";
const LABEL_BURNED = "Launch Token Fees Burned";
const LABEL_LAUNCH_PROTOCOL = "Token Launch Fees To Protocol";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const add = (locker: string, token: string, c0: string, c1: string, p0: any, p1: any, cr0: any, cr1: any) => {
    const burns = BURNS_PROTOCOL_TOKEN_SHARE.has(locker.toLowerCase());
    for (const [c, p, cr] of [[c0, p0, cr0], [c1, p1, cr1]] as [string, any, any][]) {
      // currency is the zero address on native-ETH pools; Balances treats it as ETH.
      dailyFees.add(c, p, LABEL_FEES);
      dailyFees.add(c, cr, LABEL_FEES);
      dailySupplySideRevenue.add(c, cr, LABEL_CREATORS);
      if (burns && c.toLowerCase() === token.toLowerCase()) dailySupplySideRevenue.add(c, p, LABEL_BURNED);
      else dailyRevenue.add(c, p, LABEL_PROTOCOL);
    }
  };

  const single = await options.getLogs({ targets: LOCKERS, eventAbi: EVENT_SINGLE, entireLog: true, parseLog: true });
  const market = await options.getLogs({ targets: V3_LOCKERS, eventAbi: EVENT_MARKET });
  const multi = await options.getLogs({ targets: MULTI_LOCKERS, eventAbi: EVENT_MULTI, entireLog: true, parseLog: true });
  for (const l of single) { const a = l.args; add(l.address, a.token, a.currency0, a.currency1, a.protocolAmount0, a.protocolAmount1, a.creatorAmount0, a.creatorAmount1); }
  for (const a of market) add("", a.token, a.currency0, a.currency1, a.protocol0, a.protocol1, a.creator0, a.creator1);
  for (const l of multi) { const a = l.args; add(l.address, a.token, a.currency0, a.currency1, a.protocolAmount0, a.protocolAmount1, a.creatorAmount0, a.creatorAmount1); }

  const launchesSingle = await options.getLogs({ targets: SINGLE_FACTORIES, eventAbi: EVENT_LAUNCH_SINGLE });
  const launchesMulti = await options.getLogs({ targets: MULTI_FACTORIES, eventAbi: EVENT_LAUNCH_MULTI });
  const launchFeeWei = BigInt(LAUNCH_FEE_ETH * 1e18) * BigInt(launchesSingle.length + launchesMulti.length);
  dailyFees.add(nullAddress, launchFeeWei, LABEL_LAUNCH);
  dailyRevenue.add(nullAddress, launchFeeWei, LABEL_LAUNCH_PROTOCOL);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by traders on fusi.ng launch pools (Uniswap V4), counted when the fusi.ng locker collects and splits them, plus the flat launch fee charged by the V1 and V2 factories.",
  UserFees: "Trading fees and launch fees paid by fusi.ng users.",
  Revenue: "The protocol's share of collected trading fees and the launch fees, paid to the fusi.ng treasury.",
  ProtocolRevenue: "The protocol's share of collected trading fees and the launch fees, paid to the fusi.ng treasury.",
  SupplySideRevenue: "The token creator's share of collected trading fees, plus the protocol's launch-token share that the V1 lockers burn.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL_FEES]: "Swap fees on fusi.ng launch pools, from the locker FeesCollected / MarketFeesCollected events of every release (V1, V2, V3a, V3b, V3c).",
    [LABEL_LAUNCH]: "Flat 0.0005 ETH launch fee per token launched on the V1 and V2 factories (TokenLaunched events). V3 factories charge no launch fee.",
  },
  UserFees: {
    [LABEL_FEES]: "Swap fees on fusi.ng launch pools, from the locker FeesCollected / MarketFeesCollected events of every release (V1, V2, V3a, V3b, V3c).",
    [LABEL_LAUNCH]: "Flat 0.0005 ETH launch fee per token launched on the V1 and V2 factories.",
  },
  Revenue: {
    [LABEL_PROTOCOL]: "Protocol share of collected swap fees (protocolAmount fields), paid to the fusi.ng treasury.",
    [LABEL_LAUNCH_PROTOCOL]: "Launch fees, paid to the fusi.ng treasury in the launch transaction.",
  },
  ProtocolRevenue: {
    [LABEL_PROTOCOL]: "Protocol share of collected swap fees (protocolAmount fields), paid to the fusi.ng treasury.",
    [LABEL_LAUNCH_PROTOCOL]: "Launch fees, paid to the fusi.ng treasury in the launch transaction.",
  },
  SupplySideRevenue: {
    [LABEL_CREATORS]: "Creator share of collected swap fees (creatorAmount fields), paid to each launch's creator.",
    [LABEL_BURNED]: "On the V1 lockers, the protocol's share of fees paid in the launch token is burned rather than kept, which benefits that token's holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-09-10", // V1 deployment (block 25949999)
  methodology,
  breakdownMethodology,
};

export default adapter;
