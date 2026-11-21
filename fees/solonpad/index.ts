import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// SolonPad — USDC-native launchpad on Arc, two independent launch mechanisms.
// Machine-readable spec (addresses, ABIs, provenance), maintained by the team:
// https://github.com/solonlend/solonpad-skill. All addresses below verified live
// on-chain against that spec on 2026-09-17 (see PR discussion for the raw logs).
//
// Curve mode: a source-matched fork of Pons V2 (see fees/ponsdotfamily-v2, Robinhood
// chain) — the skill repo's own provenance check found 13 of 14 src/v2 files
// whitespace-identical to the verified upstream Pons V2 factory, and the event/ABI
// shapes read below matched exactly against live Arc logs. Ported from
// fees/ponsdotfamily-v2 with Arc's factory/hook addresses; NOT a duplicate of that
// listing (separate chain, separate deployed contract instances).
const CURVE_FACTORY = "0xd6b86b9B1bB64b941b21AaA6a0e3A673e8405A3b";
const CURVE_FACTORY_DEPLOY_BLOCK = 21134269;
// Post-graduation swap fees are realised through this hook's sweep event, same as
// fees/ponsdotfamily-v2's MEME_HOOK on Robinhood.
const MEME_HOOK = "0x9d1a376de8525a2cd622b5c2ce99984f8432e044";
const UNIV4_POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";

// Instant v4 mode (the default launch path since 2026-09-16): the official Uniswap
// Liquidity Launcher (github.com/Uniswap/liquidity-launcher, MIT, audited) opens the
// full supply directly into a plain hookless v4 pool; no bonding curve, no
// graduation. Every FeesForwarded pair observed on-chain to date has been an exact
// 50/50 split between the treasury and the BeneficiaryVault (verified live), matching
// addresses.json's documented "50% platform treasury / 50% creator" split.
const FEE_SPLITTER = "0xD6B05564ceA990b69ABF10B433279093758e2A54";
const BENEFICIARY_VAULT = "0xC31c8853f6C0CA12421eb36906dB8BFaf89A85bA".toLowerCase();

const TOKEN_LAUNCHED_EVENT =
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)";
const CURVE_BUY_EVENT =
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)";
const CURVE_SELL_EVENT =
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)";
const POOL_GRADUATED_EVENT =
  "event PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount)";
const POOL_FEE_SWEPT_EVENT =
  "event PoolFeesSwept(bytes32 indexed poolId, uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount, uint256 tokensLocked)";
const LAUNCH_FEE_POLICY_FUNCTION =
  "function getLaunchFeePolicy(address token) view returns (tuple(address protocolFeeRecipient, uint16 protocolFeeShareBps, uint16 buybackBurnBps, uint16 hookFeeBps, uint16 maxInternalPriceImpactBps))";
const LAUNCH_FEE_FUNCTION = "function launchFee() view returns (uint256)";
const POSITION_INFO_FUNCTION = "function positionInfo(uint256 tokenId) view returns (uint256 info)";

const FEES_FORWARDED_EVENT =
  "event FeesForwarded(address indexed recipient, address indexed currency, uint256 amount)";

const CURVE_SWAP_FEES = "Curve Swap Fees";
const CURVE_LAUNCH_FEES = "Launch Fees";
const CURVE_SWAP_TO_PROTOCOL = "Curve Swap Fees to Protocol";
const CURVE_SWAP_TO_CREATORS = "Curve Swap Fees to Creators";
const CURVE_SWAP_TO_BUYBACK = "Curve Swap Fees to Meme Token Buybacks";
const CURVE_LAUNCH_TO_PROTOCOL = "Launch Fees to Protocol";
const INSTANT_TO_PROTOCOL = "Instant Launch Fees to Protocol";
const INSTANT_TO_CREATORS = "Instant Launch Fees to Creators";

const BPS = 10000n;

async function fetchCurve(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const tokenLaunchedLogs = await options.getLogs({
    target: CURVE_FACTORY,
    eventAbi: TOKEN_LAUNCHED_EVENT,
    fromBlock: CURVE_FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const tokenLaunchedLogsToday = await options.getLogs({
    target: CURVE_FACTORY,
    eventAbi: TOKEN_LAUNCHED_EVENT,
  });
  const poolGraduatedLogs = await options.getLogs({
    target: CURVE_FACTORY,
    eventAbi: POOL_GRADUATED_EVENT,
    fromBlock: CURVE_FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  });

  const curveToToken = new Map<string, { token: string; pairToken: string }>();
  const tokens: string[] = [];
  for (const log of tokenLaunchedLogs) {
    curveToToken.set(log.curve.toLowerCase(), { token: log.token.toLowerCase(), pairToken: log.pairToken });
    tokens.push(log.token.toLowerCase());
  }
  const curves = Array.from(curveToToken.keys());

  if (curves.length) {
    const [buys, sells, policies] = await Promise.all([
      options.getLogs({ targets: curves, eventAbi: CURVE_BUY_EVENT, flatten: false }),
      options.getLogs({ targets: curves, eventAbi: CURVE_SELL_EVENT, flatten: false }),
      options.api.multiCall({ target: CURVE_FACTORY, abi: LAUNCH_FEE_POLICY_FUNCTION, calls: tokens }),
    ]);

    const policyByCurve = new Map<string, any>();
    curves.forEach((curve, i) => {
      const policy = policies[i];
      if (policy) policyByCurve.set(curve, policy);
    });

    const addCurveLogs = (perCurveLogs: any[][]) => {
      perCurveLogs.forEach((logs, i) => {
        const curve = curves[i];
        const { pairToken } = curveToToken.get(curve)!;
        const policy = policyByCurve.get(curve);
        if (!policy) return;
        const protocolBps = BigInt(policy.protocolFeeShareBps);
        // Mirrors fees/ponsdotfamily-v2: buyback is a share of what's left after the
        // protocol's cut, not of the total fee.
        const buybackBps = ((BPS - protocolBps) * BigInt(policy.buybackBurnBps)) / BPS;
        const creatorBps = BPS - protocolBps - buybackBps;
        for (const log of logs) {
          const fee = BigInt(log.fee);
          const tax = BigInt(log.tax);
          dailyFees.add(pairToken, fee + tax, CURVE_SWAP_FEES);
          dailyRevenue.add(pairToken, (fee * protocolBps) / BPS, CURVE_SWAP_TO_PROTOCOL);
          dailySupplySideRevenue.add(pairToken, (fee * creatorBps) / BPS, CURVE_SWAP_TO_CREATORS);
          dailySupplySideRevenue.add(pairToken, (fee * buybackBps) / BPS, CURVE_SWAP_TO_BUYBACK);
          dailySupplySideRevenue.add(pairToken, tax, METRIC.CREATOR_FEES);
        }
      });
    };
    addCurveLogs(buys);
    addCurveLogs(sells);
  }

  // Post-graduation: the curve's pair token position moves to a Uniswap v4 pool under
  // memeHook, which realises its own swap fees through PoolFeesSwept. Map each
  // graduation's LP position id to its pool id (positionInfo, same packing as
  // fees/ponsdotfamily-v2) so a sweep can be attributed back to its token/pair token.
  if (poolGraduatedLogs.length) {
    const positionIds = poolGraduatedLogs.map((log: any) => log.positionId);
    const positionInfos = await options.api.multiCall({
      target: UNIV4_POOL_MANAGER,
      abi: POSITION_INFO_FUNCTION,
      calls: positionIds,
    });
    const poolIdToPairToken = new Map<string, string>();
    poolGraduatedLogs.forEach((log: any, i: number) => {
      const info = positionInfos[i];
      if (info == null) return;
      const poolId = "0x" + BigInt(info).toString(16).padStart(64, "0").slice(0, 50);
      // PoolGraduated's own `token` field is the launched token, not the curve; recover
      // the pair token by matching a launch whose token equals this graduation's token.
      const launch = tokenLaunchedLogs.find((l: any) => l.token.toLowerCase() === log.token.toLowerCase());
      if (launch) poolIdToPairToken.set(poolId.toLowerCase(), launch.pairToken);
    });

    const sweptLogs = await options.getLogs({ target: MEME_HOOK, eventAbi: POOL_FEE_SWEPT_EVENT });
    for (const log of sweptLogs) {
      const pairToken = poolIdToPairToken.get(String(log.poolId).slice(0, 52).toLowerCase());
      if (!pairToken) continue;
      const { protocolAmount, buybackAmount, creatorAmount } = log;
      dailyFees.add(pairToken, BigInt(protocolAmount) + BigInt(buybackAmount) + BigInt(creatorAmount), METRIC.SWAP_FEES);
      dailyRevenue.add(pairToken, protocolAmount, "Token Swap Fees to Protocol");
      dailySupplySideRevenue.add(pairToken, buybackAmount, "Token Swap Fees to Meme Token Buybacks");
      dailySupplySideRevenue.add(pairToken, creatorAmount, "Token Swap Fees to Creators");
    }
  }

  // Launch fee is owner-adjustable (docs explicitly warn against hardcoding it), so it
  // is re-read live each window rather than assumed; applied to today's launch count.
  if (tokenLaunchedLogsToday.length) {
    const launchFee = await options.api.call({ target: CURVE_FACTORY, abi: LAUNCH_FEE_FUNCTION });
    const total = BigInt(launchFee) * BigInt(tokenLaunchedLogsToday.length);
    dailyFees.addGasToken(total, CURVE_LAUNCH_FEES);
    dailyRevenue.addGasToken(total, CURVE_LAUNCH_TO_PROTOCOL);
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
}

async function fetchInstantV4(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // FeeSplitter and InstantLaunchStrategy are SolonPad's own dedicated deployments (not
  // shared with other users of the canonical Uniswap Liquidity Launcher engine, per
  // addresses.json's provenance section), so every FeesForwarded event at FeeSplitter's
  // own address is inherently a SolonPad fee -- no further discovery/filtering needed.
  //
  // FeeSplitter.FeesForwarded is the actual, already-split payout: summing it directly
  // (rather than independently re-deriving a 50/50 split from FeesCollected) keeps
  // Fees = Revenue + SupplySideRevenue exact by construction.
  const forwarded = await options.getLogs({ target: FEE_SPLITTER, eventAbi: FEES_FORWARDED_EVENT });
  for (const log of forwarded) {
    const amount = BigInt(log.amount);
    const toCreator = log.recipient.toLowerCase() === BENEFICIARY_VAULT;
    dailyFees.add(log.currency, amount, toCreator ? INSTANT_TO_CREATORS : INSTANT_TO_PROTOCOL);
    if (toCreator) dailySupplySideRevenue.add(log.currency, amount, INSTANT_TO_CREATORS);
    else dailyRevenue.add(log.currency, amount, INSTANT_TO_PROTOCOL);
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
}

const fetch = async (options: FetchOptions) => {
  const [curve, instant] = await Promise.all([fetchCurve(options), fetchInstantV4(options)]);

  const dailyFees = curve.dailyFees;
  dailyFees.addBalances(instant.dailyFees);
  const dailyRevenue = curve.dailyRevenue;
  dailyRevenue.addBalances(instant.dailyRevenue);
  const dailySupplySideRevenue = curve.dailySupplySideRevenue;
  dailySupplySideRevenue.addBalances(instant.dailySupplySideRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Curve mode: 1% base fee plus optional creator tax on every bonding-curve buy/sell, plus the flat (owner-adjustable, re-read live) launch fee, plus post-graduation Uniswap v4 pool fees realised at sweep. Instant-v4 mode: the 1% LP fee of SolonPad's own plain Uniswap v4 launch pools, realised when the permissionless FeeSplitter crank forwards it.",
  Revenue: "Curve mode: the protocol's share of curve fees (per-token policy, read live) plus all launch fees. Instant-v4 mode: the ~50% of LP fees forwarded to the platform treasury.",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "Curve mode: the creator and buyback-vault shares of curve fees, the full creator tax, and the creator/buyback share of post-graduation pool fees. Instant-v4 mode: the ~50% of LP fees forwarded to the launch creator's BeneficiaryVault position.",
};

const breakdownMethodology = {
  Fees: {
    [CURVE_SWAP_FEES]: "Base fee plus optional creator tax on every bonding-curve buy and sell (fee+tax fields of CurveBuy/CurveSell).",
    [CURVE_LAUNCH_FEES]: "Flat per-launch fee, re-read from the factory each window since it is owner-adjustable.",
    [METRIC.SWAP_FEES]: "Uniswap v4 pool fees on graduated curves, realised through the memeHook's PoolFeesSwept event.",
    [INSTANT_TO_PROTOCOL]: "Protocol half of the 1% LP fee on SolonPad's plain (non-curve) v4 launch pools.",
    [INSTANT_TO_CREATORS]: "Creator half of the 1% LP fee on SolonPad's plain (non-curve) v4 launch pools.",
  },
  Revenue: {
    [CURVE_SWAP_TO_PROTOCOL]: "Protocol's share of curve swap fees, per each token's live launch fee policy.",
    [CURVE_LAUNCH_TO_PROTOCOL]: "All launch fees.",
    "Token Swap Fees to Protocol": "Protocol's share of post-graduation pool fees, from PoolFeesSwept.",
    [INSTANT_TO_PROTOCOL]: "Protocol half of instant-v4 LP fees, from FeeSplitter.FeesForwarded.",
  },
  ProtocolRevenue: {
    [CURVE_SWAP_TO_PROTOCOL]: "Protocol's share of curve swap fees, per each token's live launch fee policy.",
    [CURVE_LAUNCH_TO_PROTOCOL]: "All launch fees.",
    "Token Swap Fees to Protocol": "Protocol's share of post-graduation pool fees, from PoolFeesSwept.",
    [INSTANT_TO_PROTOCOL]: "Protocol half of instant-v4 LP fees, from FeeSplitter.FeesForwarded.",
  },
  SupplySideRevenue: {
    [CURVE_SWAP_TO_CREATORS]: "Creator's share of curve swap fees.",
    [CURVE_SWAP_TO_BUYBACK]: "Share of curve swap fees allocated to buyback and burn of the launched token.",
    [METRIC.CREATOR_FEES]: "The full optional creator tax on curve trades.",
    "Token Swap Fees to Creators": "Creator's share of post-graduation pool fees.",
    "Token Swap Fees to Meme Token Buybacks": "Buyback share of post-graduation pool fees.",
    [INSTANT_TO_CREATORS]: "Creator half of instant-v4 LP fees, paid into the launch's BeneficiaryVault position.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-14",
  methodology,
  breakdownMethodology,
};

export default adapter;
