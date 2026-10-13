import { ChainApi } from "@defillama/sdk";
import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Sprout LaunchpadCore (current core), Injective EVM.
// Source: contract list in the Sprout docs, https://trysprout.fun/docs (section "Contracts").
// Event definitions below are copied from the verified source of this contract on
// https://blockscout.injective.network/address/0x1333692eB905823df110762525c26f7489BB9300
const CORE = "0x1333692eB905823df110762525c26f7489BB9300";

// Sprout LaunchPoolFeeHook: the hook of every Choice v2 pool a launch of the current core
// graduates into. It takes the whole trade fee of those pools (the LP fee must be 0).
// Verified source: https://blockscout.injective.network/address/0x4bac811606b5b91a9ce6187330d255b8134169b4
const HOOK = "0x4bac811606b5b91a9ce6187330d255b8134169b4";

// Share of the platform fee used to buy back and burn SPROUT.
// Source: Sprout docs, section "$SPROUT" (80% of the platform share buys SPROUT, which is burned).
// The burn contract (0x65Dc46Ee554A27bC790710f9fAee74B427c1C57D) is not verified, so this ratio
// cannot be checked on-chain and the admin can change it (docs: minimum 50%).
const BUYBACK_SHARE = 0.8;

const ABI = {
  buy: "event Buy(uint256 indexed launchId, address indexed buyer, uint256 pairIn, uint256 fee, uint256 tokenOut, uint256 realPair, uint256 tokensSold, uint256 spotPriceWad, uint256 progressBps)",
  sell: "event Sell(uint256 indexed launchId, address indexed seller, uint256 tokenIn, uint256 pairOutGross, uint256 fee, uint256 realPair, uint256 tokensSold, uint256 spotPriceWad, uint256 progressBps)",
  creatorFeeAccrued: "event CreatorFeeAccrued(uint256 indexed launchId, address indexed creator, address indexed asset, uint256 amount)",
  referralFeeAccrued: "event ReferralFeeAccrued(uint256 indexed launchId, address indexed referrer, address indexed asset, uint256 amount)",
  // hook: one event per swap, the fee is split creatorBps / rest inside the same call
  feeTaken: "event FeeTaken(bytes32 indexed poolId, uint256 indexed launchId, address quote, uint256 fee)",
  getLaunchPairAsset: "function getLaunchPairAsset(uint256 launchId) view returns (address)",
  poolInfo: "function poolInfo(bytes32 poolId) view returns (bool registered, uint256 launchId, address quote, uint16 creatorBps)",
};

const LABELS = {
  fees: "Bonding Curve Trading Fees",
  creators: "Trading Fees To Creators",
  referrers: "Trading Fees To Referrers",
  revenue: "Trading Fees To Platform",
  gradFees: "Graduated Pool Trading Fees",
  gradCreators: "Graduated Pool Fees To Creators",
  gradRevenue: "Graduated Pool Fees To Platform",
  protocol: "Trading Fees To Protocol",
  holders: "Trading Fees To SPROUT Buyback And Burn",
};

const getBlock = async (timestamp: number): Promise<number> => {
  const { height } = await httpGet(`https://coins.llama.fi/block/${CHAIN.INJECTIVE}/${timestamp}`);
  if (!height) throw new Error(`Sprout: no injective block for timestamp ${timestamp}`);
  return height;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const fromBlock = await getBlock(options.fromTimestamp);
  const toBlock = await getBlock(options.toTimestamp);
  const getLogs = (target: string, eventAbi: string) => options.getLogs({ target, eventAbi, fromBlock, toBlock });
  const api = new ChainApi({ chain: options.chain, block: toBlock });

  const trades = [...(await getLogs(CORE, ABI.buy)), ...(await getLogs(CORE, ABI.sell))];
  const creatorFees = await getLogs(CORE, ABI.creatorFeeAccrued);
  const referralFees = await getLogs(CORE, ABI.referralFeeAccrued);
  const hookFees = await getLogs(HOOK, ABI.feeTaken);

  // ---- bonding curve: the fee is paid in the launch's pair asset ----
  const launchIds = [...new Set(trades.map((log) => String(log.launchId)))];
  const pairAssets = await api.multiCall({ target: CORE, abi: ABI.getLaunchPairAsset, calls: launchIds });
  const pairAssetByLaunch: Record<string, string> = {};
  launchIds.forEach((id, i) => {
    if (!pairAssets[i] || pairAssets[i] === ADDRESSES.null) throw new Error(`Sprout: no pair asset for launch ${id}`);
    pairAssetByLaunch[id] = pairAssets[i];
  });

  trades.forEach((log) => {
    const asset = pairAssetByLaunch[String(log.launchId)];
    dailyFees.add(asset, log.fee, LABELS.fees);
    dailyRevenue.add(asset, log.fee, LABELS.revenue);
  });
  // creator and referral fees are carved out of the trade fee, the platform keeps the rest
  creatorFees.forEach((log) => {
    dailySupplySideRevenue.add(log.asset, log.amount, LABELS.creators);
    dailyRevenue.subtractToken(log.asset, log.amount, LABELS.revenue);
  });
  referralFees.forEach((log) => {
    dailySupplySideRevenue.add(log.asset, log.amount, LABELS.referrers);
    dailyRevenue.subtractToken(log.asset, log.amount, LABELS.revenue);
  });

  // ---- graduated Choice v2 pools (hook) ----
  const poolIds = [...new Set(hookFees.map((log) => String(log.poolId)))];
  const pools = await api.multiCall({ target: HOOK, abi: ABI.poolInfo, calls: poolIds });
  const creatorBpsByPool: Record<string, bigint> = {};
  poolIds.forEach((id, i) => {
    if (!pools[i].registered) throw new Error(`Sprout: pool ${id} is not registered in the hook`);
    creatorBpsByPool[id] = BigInt(pools[i].creatorBps);
  });

  hookFees.forEach((log) => {
    const fee = BigInt(log.fee);
    // same split as the hook: the creator gets fee * creatorBps / 10000, the platform the rest
    const creator = (fee * creatorBpsByPool[String(log.poolId)]) / 10_000n;
    dailyFees.add(log.quote, fee, LABELS.gradFees);
    dailySupplySideRevenue.add(log.quote, creator, LABELS.gradCreators);
    dailyRevenue.add(log.quote, fee - creator, LABELS.gradRevenue);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: dailyRevenue.clone(BUYBACK_SHARE, LABELS.holders),
    dailyProtocolRevenue: dailyRevenue.clone(1 - BUYBACK_SHARE, LABELS.protocol),
  };
};

const methodology = {
  Fees: "Trading fees paid on sprout.fun bonding curves (1% or 3% per launch) and in the Choice v2 pools that launches graduate into (same rate, taken by the Sprout hook).",
  Revenue: "Trading fees minus the share credited to launch creators and referrers (the platform share).",
  SupplySideRevenue: "Share of trading fees credited to launch creators, and on the curve to referrers.",
  ProtocolRevenue: "Part of the platform share that is not used for SPROUT buyback and burn.",
  HoldersRevenue: "80% of the platform share funds SPROUT buyback and burn (ratio taken from the Sprout docs).",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.fees]: "Fees charged on every buy and sell on the bonding curve.",
    [LABELS.gradFees]: "Fees charged by the Sprout hook on swaps in graduated Choice v2 pools (FeeTaken events).",
  },
  Revenue: {
    [LABELS.revenue]: "Bonding curve trading fees minus creator and referral fees.",
    [LABELS.gradRevenue]: "Graduated pool fees minus the creator share (fee * (10000 - creatorBps) / 10000).",
  },
  SupplySideRevenue: {
    [LABELS.creators]: "Bonding curve fees credited to launch creators (CreatorFeeAccrued).",
    [LABELS.referrers]: "Bonding curve fees credited to referrers (ReferralFeeAccrued).",
    [LABELS.gradCreators]: "Graduated pool fees credited to launch creators (fee * creatorBps / 10000).",
  },
  ProtocolRevenue: {
    [LABELS.protocol]: "Platform share not used for SPROUT buyback and burn.",
  },
  HoldersRevenue: {
    [LABELS.holders]: "80% of the platform share (curve and graduated pools) used to buy back and burn SPROUT.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.INJECTIVE],
  start: "2026-09-13",
  methodology,
  breakdownMethodology,
};

export default adapter;
