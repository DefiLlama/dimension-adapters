import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Pez v2 deployment on Robinhood Chain.
const FACTORY = "0xed355f423a5158347beb562c250f6095efcdb25b";
const POSITION_MANAGER = "0x58daec3116aae6D93017bAAea7749052E8a04fA7";
const MEME_HOOK = "0x57387759Ea3a3116330f4Bd2cae48B03091A2044";

// Factory deployment block observed from the official Pez deployment status and
// verified against the Robinhood Chain RPC.
const FACTORY_DEPLOYED_BLOCK = 55493136;
const BPS = 10000;
// Pez's official deployment/docs do not identify a separate platform token;
// buybacks of launched tokens are supply-side revenue. Add a verified platform
// token address here if Pez deploys one, so only that token's buyback is holders
// revenue. See https://pez.family/docs.
const PLATFORM_TOKENS = new Set<string>();

const TOKEN_LAUNCHED_EVENT =
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)";
const POOL_GRADUATED_EVENT =
  "event PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount)";
const POOL_FEE_SWEPT_EVENT =
  "event PoolFeesSwept(bytes32 indexed poolId, uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount, uint256 tokensLocked)";

const CURVE_BUY_EVENT =
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)";
const CURVE_SELL_EVENT =
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)";

const POSITION_INFO_FUNCTION = "function positionInfo(uint256 tokenId) view returns (uint256 info)";
// Pez docs: the current deployment has no platform share; creator fees may be
// routed to buyback-and-lock instead. See https://pez.family/docs.
const LAUNCH_FEE_POLICY_FUNCTION =
  "function getLaunchFeePolicy(address token) view returns (tuple(address protocolFeeRecipient, uint16 protocolFeeShareBps, uint16 buybackBurnBps, uint16 hookFeeBps, uint16 maxInternalPriceImpactBps))";

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const tokenLaunchedLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: TOKEN_LAUNCHED_EVENT,
    fromBlock: FACTORY_DEPLOYED_BLOCK,
    cacheInCloud: true,
  });

  const poolGraduatedLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: POOL_GRADUATED_EVENT,
    fromBlock: FACTORY_DEPLOYED_BLOCK,
    cacheInCloud: true,
  });

  const curveToTokens = new Map<string, { token: string; pairToken: string }>();
  const tokenToPairToken = new Map<string, string>();
  for (const log of tokenLaunchedLogs) {
    const token = String(log.token).toLowerCase();
    const pairToken = String(log.pairToken).toLowerCase();
    curveToTokens.set(String(log.curve).toLowerCase(), { token, pairToken });
    tokenToPairToken.set(token, pairToken);
  }

  const positionIdToTokens = new Map(
    poolGraduatedLogs.map((log) => [String(log.positionId), String(log.token).toLowerCase()])
  );
  const tokens = Array.from(curveToTokens.values()).map(({ token }) => token);

  // CurveBuy/CurveSell are emitted by each discovered token curve. Querying
  // those targets directly keeps this adapter entirely on-chain and avoids a
  // dependency on a third-party log warehouse.
  const curveAddresses = Array.from(curveToTokens.keys());
  const [curveBuyLogs, curveSellLogs] = curveAddresses.length
    ? await Promise.all([
        options.getLogs({ targets: curveAddresses, eventAbi: CURVE_BUY_EVENT, flatten: false }),
        options.getLogs({ targets: curveAddresses, eventAbi: CURVE_SELL_EVENT, flatten: false }),
      ])
    : [[], []];

  const poolFeeSweptLogs = await options.getLogs({
    target: MEME_HOOK,
    eventAbi: POOL_FEE_SWEPT_EVENT,
  });

  const positionIds = Array.from(positionIdToTokens.keys());
  const positionInfos = await options.api.multiCall({
    target: POSITION_MANAGER,
    abi: POSITION_INFO_FUNCTION,
    calls: positionIds,
  });

  const launchFeePolicies = await options.api.multiCall({
    target: FACTORY,
    abi: LAUNCH_FEE_POLICY_FUNCTION,
    calls: tokens,
  });

  const poolIdToTokens = new Map<string, string>();
  for (let i = 0; i < positionIds.length; i++) {
    const info = positionInfos[i];
    if (info == null) continue;
    const poolId = "0x" + BigInt(info).toString(16).padStart(64, "0").slice(0, 50);
    const token = positionIdToTokens.get(positionIds[i]);
    if (token) poolIdToTokens.set(poolId.toLowerCase(), token);
  }

  const tokenToLaunchFeePolicy = new Map<
    string,
    {
      protocolFeeShareBps: number;
      buybackBurnBps: number;
    }
  >();
  for (let i = 0; i < tokens.length; i++) {
    const policy = launchFeePolicies[i];
    if (policy == null) continue;
    tokenToLaunchFeePolicy.set(tokens[i], {
      protocolFeeShareBps: Number(policy.protocolFeeShareBps),
      buybackBurnBps: Number(policy.buybackBurnBps),
    });
  }

  const addCurveLogs = (logsByCurve: any[], isBuy: boolean) => {
    logsByCurve.forEach((logs, index) => {
      const curve = curveToTokens.get(curveAddresses[index]);
      if (!curve) return;
      const policy = tokenToLaunchFeePolicy.get(curve.token);
      if (!policy) return;

      logs.forEach((log: any) => {
        const args = log.args ?? log;
        const quoteAmount = BigInt(isBuy ? args.quoteIn : args.quoteOut);
        const fee = BigInt(args.fee);
        const tax = BigInt(args.tax);
        const { pairToken: quoteToken } = curve;

        const protocolBps = policy.protocolFeeShareBps;
        const creatorBps = (BPS - protocolBps) / (BPS / (BPS - policy.buybackBurnBps));
        const buybackBps = BPS - creatorBps - protocolBps;

        dailyVolume.add(quoteToken, isBuy ? quoteAmount : quoteAmount + fee + tax);
        dailyFees.add(quoteToken, fee + tax, "Curve Swap Fees");
        dailyRevenue.add(quoteToken, (fee * BigInt(protocolBps)) / BigInt(BPS), "Curve Swap Fees to Protocol");
        dailySupplySideRevenue.add(
          quoteToken,
          (fee * BigInt(creatorBps)) / BigInt(BPS),
          "Curve Swap Fees to Creators"
        );
        const buybackAmount = (fee * BigInt(buybackBps)) / BigInt(BPS);
        if (PLATFORM_TOKENS.has(curve.token)) {
          dailyHoldersRevenue.add(quoteToken, buybackAmount, METRIC.TOKEN_BUY_BACK);
        } else {
          dailySupplySideRevenue.add(quoteToken, buybackAmount, "Curve Swap Fees to Meme Token Buybacks");
        }
        dailySupplySideRevenue.add(quoteToken, tax, "Creator Tax");
      });
    });
  };

  addCurveLogs(curveBuyLogs, true);
  addCurveLogs(curveSellLogs, false);

  for (const log of poolFeeSweptLogs) {
    const token = poolIdToTokens.get(String(log.poolId).slice(0, 52).toLowerCase());
    if (!token) continue;
    const pairToken = tokenToPairToken.get(token);
    if (!pairToken) continue;

    dailyFees.add(
      pairToken,
      BigInt(log.protocolAmount) + BigInt(log.buybackAmount) + BigInt(log.creatorAmount),
      METRIC.SWAP_FEES
    );
    dailyRevenue.add(pairToken, log.protocolAmount, "Token Swap Fees to Protocol");
    dailySupplySideRevenue.add(pairToken, log.creatorAmount, "Token Swap Fees to Creators");
    if (PLATFORM_TOKENS.has(token)) {
      dailyHoldersRevenue.add(pairToken, log.buybackAmount, METRIC.TOKEN_BUY_BACK);
    } else {
      dailySupplySideRevenue.add(pairToken, log.buybackAmount, "Token Swap Fees to Meme Token Buybacks");
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Volume: "Volume of all swaps on Pez's launch curves; external Uniswap v4 swaps are excluded.",
  Fees: "Includes Pez curve trade fees, creator taxes, and graduated-pool swap fees realized through PoolFeesSwept events. Pez's current deployment has no launch fee.",
  Revenue: "Zero under Pez's current zero-platform-fee policy; any non-zero protocol amount is read from the on-chain fee policy or PoolFeesSwept events.",
  ProtocolRevenue: "Pez's current deployment has no protocol fee share; the adapter retains this field to detect future on-chain policy changes.",
  HoldersRevenue: "Buyback-and-lock amounts funded from the creator's share of Pez trade fees only when the bought-back token is a verified Pez platform token.",
  SupplySideRevenue: "Creator fee, creator tax, and launched-token buyback amounts paid from Pez trade fees. Buybacks of launched tokens are supply-side revenue; only a verified platform-token buyback is holders revenue.",
};

const breakdownMethodology = {
  Fees: {
    "Curve Swap Fees": "Base trade fees and creator taxes collected from swaps on Pez launch curves.",
    [METRIC.SWAP_FEES]: "Fees collected from Uniswap v4 swaps on graduated Pez pools, realized through PoolFeesSwept events.",
  },
  Revenue: {
    "Curve Swap Fees to Protocol": "Protocol share of curve swap fees defined by each token's launch fee policy.",
    "Token Swap Fees to Protocol": "Protocol amount emitted by PoolFeesSwept for graduated pools.",
  },
  ProtocolRevenue: {
    "Curve Swap Fees to Protocol": "Protocol share of curve swap fees; zero under the current Pez policy.",
    "Token Swap Fees to Protocol": "Protocol amount emitted by PoolFeesSwept; zero under the current Pez policy.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "Buyback-and-lock amounts from the creator's share of Pez trade fees.",
  },
  SupplySideRevenue: {
    "Curve Swap Fees to Creators": "Creator share of curve swap fees.",
    "Curve Swap Fees to Meme Token Buybacks": "Buyback share of curve swap fees used to buy launched tokens.",
    "Creator Tax": "Creator tax collected on curve swaps.",
    "Token Swap Fees to Creators": "Creator amount emitted by PoolFeesSwept for graduated pools.",
    "Token Swap Fees to Meme Token Buybacks": "Buyback amount emitted by PoolFeesSwept and used to buy launched tokens.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  start: "2026-09-05",
};

export default adapter;
