import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Story.fun is a token launchpad on Robinhood Chain. Each launch gets its own BondingCurve, and a
// curve that sells out graduates into a Uniswap V4 pool guarded by a single GraduatedPoolHook.
//
// Fees are recognised where the protocol splits them, not where they accrue: both the curve and the
// hook hold fees in an internal bucket and emit one event per distribution naming the protocol,
// buyback and creator amounts in quote-asset units. Reading those events keeps fees, revenue and
// supply-side revenue on one basis, and it is the only place the hook's launch-token fees appear
// already converted to the quote asset.
const LAUNCH_FACTORY = "0x1A9BC7Fd7EE06Fa0477781633223bcC102C08fbd";
const GRADUATED_POOL_HOOK = "0xa9926c1323b72D8b66c05EdEa293cd016C29e044";
// LaunchFactory deployment block
const START_BLOCK = 75644816;
// Native ETH is the quote asset of every launch so far; the factory stores it as the zero address.
const NATIVE = "0x0000000000000000000000000000000000000000";

const tokenLaunchedAbi =
  "event TokenLaunched(address indexed token, address indexed curve, address indexed creator, bytes32 launchSalt, address quoteAsset, bytes32 quoteConfigHash, uint32 launchConfigId, uint16 curveFeeBps, int24 tickSpacing, address creatorFeeRecipient, uint16 creatorTaxBps, bool buybackEnabled, string name, string symbol, string logo, string description, (string,string,string,string,string,string) socials)";
// curve fee distribution: `buybackAmount` is quote spent buying the launch token back, not a token amount
const feesDistributedAbi =
  "event FeesDistributed(uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount)";
// fallback path taken when a quote asset cannot use the escrow; the factory pays the beneficiaries directly
const feesRescuedAbi = "event FeesRescued(uint256 protocolAmount, uint256 creatorAmount)";
const poolRegisteredAbi =
  "event PoolRegistered(bytes32 indexed poolId, address indexed token, address indexed quoteAsset)";
// hook fee distribution, after launch-token fees have been converted to the pool's quote asset
const poolFeesSweptAbi =
  "event PoolFeesSwept(bytes32 indexed poolId, uint256 protocolAmount, uint256 buybackSpent, uint256 creatorAmount, uint96 tokensLocked)";
// fallback path taken when an abnormal balance blocks conversion; amounts stay in `currency`
const poolFeesRescuedAbi =
  "event PoolFeesRescued(bytes32 indexed poolId, address indexed currency, uint256 protocolAmount, uint256 creatorAmount)";

// topic0 of the two curve events, for a chain-wide scan: one curve per launch makes a targeted
// request per curve unworkable, so the logs are filtered on the emitting address instead
const topicFeesDistributed = "0x312c5308f42848705a866c73dec11fd0783c2d64aac6a97e94467062ad3f4058";
const topicFeesRescued = "0xb3b191714883dfbab174a2faced794fdee634297591bd8204850aed9bc69079b";

const LAUNCH_FEE_LABEL = "Token Launch Fees";
const POOL_FEE_LABEL = "Graduated Pool Fees";

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // one credit of the fee ledger per quote asset, so that a launch quoted in an ERC-20 is booked
  // in that ERC-20 rather than in the gas token
  const credit = (balances: ReturnType<FetchOptions["createBalances"]>, quoteAsset: string, amount: any, label: string) => {
    if (quoteAsset.toLowerCase() === NATIVE) balances.addGasToken(amount, label);
    else balances.add(quoteAsset, amount, label);
  };

  // every launch ever, kept as whole logs so that the same cached scan also dates each launch
  const launches = await options.getLogs({
    target: LAUNCH_FACTORY,
    eventAbi: tokenLaunchedAbi,
    fromBlock: START_BLOCK,
    cacheInCloud: true,
    onlyArgs: false,
  });
  const curveQuoteAsset: Record<string, string> = {};
  for (const log of launches) curveQuoteAsset[log.args.curve.toLowerCase()] = log.args.quoteAsset;

  // the flat launch fee is credited to the protocol fee recipient in full, in native ETH
  const [windowFrom, windowTo] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  const launchedInWindow = launches.filter(
    (log: any) => log.blockNumber >= windowFrom && log.blockNumber < windowTo,
  ).length;
  if (launchedInWindow) {
    // read at the end of the window: a window that contains a launch also ends after the factory
    // was deployed, while the start of the very first window predates it and would revert
    const launchFee = await options.api.call({ target: LAUNCH_FACTORY, abi: "uint96:launchFee" });
    dailyFees.addGasToken(BigInt(launchFee) * BigInt(launchedInWindow), LAUNCH_FEE_LABEL);
    dailyRevenue.addGasToken(BigInt(launchFee) * BigInt(launchedInWindow), LAUNCH_FEE_LABEL);
  }

  const fromCurve = (log: any) => curveQuoteAsset[log.address.toLowerCase()] !== undefined;

  for (const log of (
    await options.getLogs({
      eventAbi: feesDistributedAbi,
      topics: [topicFeesDistributed],
      noTarget: true,
      entireLog: true,
      parseLog: true,
    })
  ).filter(fromCurve)) {
    const quoteAsset = curveQuoteAsset[log.address.toLowerCase()];
    const protocol = BigInt(log.args.protocolAmount);
    const buyback = BigInt(log.args.buybackAmount);
    const creator = BigInt(log.args.creatorAmount);
    credit(dailyFees, quoteAsset, protocol + buyback + creator, METRIC.SWAP_FEES);
    credit(dailyRevenue, quoteAsset, protocol + buyback, METRIC.SWAP_FEES);
    credit(dailySupplySideRevenue, quoteAsset, creator, METRIC.SWAP_FEES);
  }

  for (const log of (
    await options.getLogs({
      eventAbi: feesRescuedAbi,
      topics: [topicFeesRescued],
      noTarget: true,
      entireLog: true,
      parseLog: true,
    })
  ).filter(fromCurve)) {
    const quoteAsset = curveQuoteAsset[log.address.toLowerCase()];
    const protocol = BigInt(log.args.protocolAmount);
    const creator = BigInt(log.args.creatorAmount);
    credit(dailyFees, quoteAsset, protocol + creator, METRIC.SWAP_FEES);
    credit(dailyRevenue, quoteAsset, protocol, METRIC.SWAP_FEES);
    credit(dailySupplySideRevenue, quoteAsset, creator, METRIC.SWAP_FEES);
  }

  // the hook guards every graduated pool, so its own events need no address filtering
  const pools = await options.getLogs({
    target: GRADUATED_POOL_HOOK,
    eventAbi: poolRegisteredAbi,
    fromBlock: START_BLOCK,
    cacheInCloud: true,
  });
  const poolQuoteAsset: Record<string, string> = {};
  for (const log of pools) poolQuoteAsset[log.poolId.toLowerCase()] = log.quoteAsset;

  for (const log of await options.getLogs({ target: GRADUATED_POOL_HOOK, eventAbi: poolFeesSweptAbi })) {
    const quoteAsset = poolQuoteAsset[log.poolId.toLowerCase()];
    if (!quoteAsset) continue;
    const protocol = BigInt(log.protocolAmount);
    const buyback = BigInt(log.buybackSpent);
    const creator = BigInt(log.creatorAmount);
    credit(dailyFees, quoteAsset, protocol + buyback + creator, POOL_FEE_LABEL);
    credit(dailyRevenue, quoteAsset, protocol + buyback, POOL_FEE_LABEL);
    credit(dailySupplySideRevenue, quoteAsset, creator, POOL_FEE_LABEL);
  }

  for (const log of await options.getLogs({ target: GRADUATED_POOL_HOOK, eventAbi: poolFeesRescuedAbi })) {
    const protocol = BigInt(log.protocolAmount);
    const creator = BigInt(log.creatorAmount);
    credit(dailyFees, log.currency, protocol + creator, POOL_FEE_LABEL);
    credit(dailyRevenue, log.currency, protocol, POOL_FEE_LABEL);
    credit(dailySupplySideRevenue, log.currency, creator, POOL_FEE_LABEL);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  UserFees:
    "Traders pay a curve fee plus the launch's creator tax on every bonding-curve buy and sell, and an anti-snipe tax on buys made in the opening window. Swaps in a graduated Uniswap V4 pool pay the same creator tax plus a hook fee. Creators pay a flat launch fee in ETH when they launch a token.",
  Fees: "All launch fees, bonding-curve trading fees and graduated-pool hook fees, counted when the curve or the hook distributes them.",
  Revenue: "The protocol's share of trading fees, the launch fees in full, and the quote asset spent buying launch tokens back into the vesting vault.",
  ProtocolRevenue: "Same as revenue: Story.fun has no other revenue stream.",
  SupplySideRevenue: "The creator's share of bonding-curve and graduated-pool fees, credited to each launch's creator fee recipient.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Curve fee, creator tax and anti-snipe tax charged on bonding-curve trades.",
    [LAUNCH_FEE_LABEL]: "Flat ETH fee paid to launch a token.",
    [POOL_FEE_LABEL]: "Hook fee and creator tax charged on swaps in graduated Uniswap V4 pools (these swaps also appear under Uniswap V4).",
  },
  Revenue: {
    [METRIC.SWAP_FEES]: "Protocol share of bonding-curve fees, plus the quote asset spent on buybacks.",
    [LAUNCH_FEE_LABEL]: "Launch fees go to the protocol fee recipient in full.",
    [POOL_FEE_LABEL]: "Protocol share of graduated-pool fees, plus the quote asset spent on buybacks.",
  },
  SupplySideRevenue: {
    [METRIC.SWAP_FEES]: "Creator share of bonding-curve fees.",
    [POOL_FEE_LABEL]: "Creator share of graduated-pool fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-29",
  methodology,
  breakdownMethodology,
  doublecounted: true, // graduated-pool fees are charged on swaps that Uniswap V4 also reports
};

export default adapter;
