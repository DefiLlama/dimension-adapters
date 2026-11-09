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
// PEZ, the platform token launched by the Pez team through its own factory.
// Its "creator" fees go to the team (protocol revenue) and its buybacks are
// holders revenue. Every other launched token belongs to a third-party creator.
const PLATFORM_TOKENS = new Set<string>(["0xa3602804e096cb73bd8344afc1ff3f3390b899c5"]);

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

// Graduated pools trade on Uniswap v4 and their volume/fees are already counted
// by the uniswap-v4 adapter on Robinhood Chain. This adapter covers the bonding
// curves for every token, plus the graduated-pool fees of the PEZ token only,
// because those accrue to the Pez team rather than to a third-party creator.
async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
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

  // Only platform-token pools are tracked after graduation.
  const positionIdToTokens = new Map(
    poolGraduatedLogs
      .filter((log) => PLATFORM_TOKENS.has(String(log.token).toLowerCase()))
      .map((log) => [String(log.positionId), String(log.token).toLowerCase()])
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
      const isPlatformToken = PLATFORM_TOKENS.has(curve.token);

      logs.forEach((log: any) => {
        const args = log.args ?? log;
        const quoteAmount = BigInt(isBuy ? args.quoteIn : args.quoteOut);
        const fee = BigInt(args.fee);
        const tax = BigInt(args.tax);
        const { pairToken: quoteToken } = curve;

        const protocolBps = policy.protocolFeeShareBps;
        const creatorBps = (BPS - protocolBps) / (BPS / (BPS - policy.buybackBurnBps));
        const buybackBps = BPS - creatorBps - protocolBps;

        const creatorAmount = (fee * BigInt(creatorBps)) / BigInt(BPS);
        const buybackAmount = (fee * BigInt(buybackBps)) / BigInt(BPS);

        dailyVolume.add(quoteToken, isBuy ? quoteAmount : quoteAmount + fee + tax);
        dailyFees.add(quoteToken, fee + tax, "Curve Swap Fees");
        dailyProtocolRevenue.add(quoteToken, (fee * BigInt(protocolBps)) / BigInt(BPS), "Curve Swap Fees to Protocol");
        if (isPlatformToken) {
          // No fixed buyback split is observable for PEZ; everything the team
          // collects on its own token is protocol revenue.
          dailyProtocolRevenue.add(quoteToken, creatorAmount + buybackAmount + tax, "PEZ Creator Fees");
        } else {
          dailySupplySideRevenue.add(quoteToken, creatorAmount, "Curve Swap Fees to Creators");
          dailySupplySideRevenue.add(quoteToken, buybackAmount, "Curve Swap Fees to Meme Token Buybacks");
          dailySupplySideRevenue.add(quoteToken, tax, "Creator Tax");
        }
      });
    });
  };

  addCurveLogs(curveBuyLogs, true);
  addCurveLogs(curveSellLogs, false);

  // PEZ pool only (poolIdToTokens is filtered to PLATFORM_TOKENS above).
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
    dailyProtocolRevenue.add(pairToken, log.protocolAmount, "Token Swap Fees to Protocol");
    dailyProtocolRevenue.add(pairToken, log.creatorAmount, "PEZ Creator Fees");
    dailyHoldersRevenue.add(pairToken, log.buybackAmount, METRIC.TOKEN_BUY_BACK);
  }

  const dailyRevenue = dailyProtocolRevenue.clone();
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Volume: "Volume of all swaps on Pez's launch curves. Graduated pools trade on Uniswap v4 and are counted under the Uniswap v4 listing.",
  Fees: "Pez curve trade fees and creator taxes on every launched token, plus the graduated Uniswap v4 pool fees of the PEZ platform token, realized through PoolFeesSwept events. Other graduated pools are counted under the Uniswap v4 listing. Pez's current deployment has no launch fee.",
  Revenue: "Protocol revenue plus holders revenue.",
  ProtocolRevenue: "Any protocol fee share read from the on-chain fee policy (zero under the current policy), plus the creator fees and taxes of the PEZ token, which the Pez team launched and collects on.",
  HoldersRevenue: "PEZ buyback-and-lock amounts reported by PoolFeesSwept for the PEZ pool. No such buyback has happened on-chain so far, so this is currently zero.",
  SupplySideRevenue: "Creator fee, creator tax, and launched-token buyback amounts paid from curve fees of third-party launched tokens.",
};

const breakdownMethodology = {
  Fees: {
    "Curve Swap Fees": "Base trade fees and creator taxes collected from swaps on Pez launch curves.",
    [METRIC.SWAP_FEES]: "Fees collected from Uniswap v4 swaps on the graduated PEZ pool, realized through PoolFeesSwept events.",
  },
  Revenue: {
    "Curve Swap Fees to Protocol": "Protocol share of curve swap fees defined by each token's launch fee policy.",
    "Token Swap Fees to Protocol": "Protocol amount emitted by PoolFeesSwept for the PEZ pool.",
    "PEZ Creator Fees": "Creator share of fees and taxes on the PEZ token, collected by the Pez team.",
    [METRIC.TOKEN_BUY_BACK]: "PEZ buyback-and-lock amounts funded from PEZ trade fees.",
  },
  ProtocolRevenue: {
    "Curve Swap Fees to Protocol": "Protocol share of curve swap fees; zero under the current Pez policy.",
    "Token Swap Fees to Protocol": "Protocol amount emitted by PoolFeesSwept; zero under the current Pez policy.",
    "PEZ Creator Fees": "Creator share of fees and taxes on the PEZ token, collected by the Pez team.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "PEZ buyback-and-lock amounts funded from PEZ trade fees.",
  },
  SupplySideRevenue: {
    "Curve Swap Fees to Creators": "Creator share of curve swap fees on third-party tokens.",
    "Curve Swap Fees to Meme Token Buybacks": "Buyback share of curve swap fees used to buy third-party launched tokens.",
    "Creator Tax": "Creator tax collected on curve swaps of third-party tokens.",
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
