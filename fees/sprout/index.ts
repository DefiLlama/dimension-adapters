import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Sprout LaunchpadCore (current core), Injective EVM.
// Source: contract list in the Sprout docs, https://trysprout.fun/docs (section "Contracts").
// Event definitions below are copied from the verified source of this contract on
// https://blockscout.injective.network/address/0x1333692eB905823df110762525c26f7489BB9300
const CORE = "0x1333692eB905823df110762525c26f7489BB9300";

// Choice v2 (which Sprout graduates into) was deployed at this block, so Sprout cannot be older.
// Source: projects/choice-exchange in DefiLlama-Adapters (CLPoolManager fromBlock).
const LOWEST_BLOCK = 182158326;

// Share of the platform fee used to buy back and burn SPROUT.
// Source: Sprout docs, section "$SPROUT" (80% of the platform share buys SPROUT, which is burned).
// The burn contract (0x65Dc46Ee554A27bC790710f9fAee74B427c1C57D) is not verified, so this ratio
// cannot be checked on-chain and the admin can change it (docs: minimum 50%).
const BUYBACK_SHARE_PERCENT = 80n;

const BUY_EVENT =
  "event Buy(uint256 indexed launchId, address indexed buyer, uint256 pairIn, uint256 fee, uint256 tokenOut, uint256 realPair, uint256 tokensSold, uint256 spotPriceWad, uint256 progressBps)";
const SELL_EVENT =
  "event Sell(uint256 indexed launchId, address indexed seller, uint256 tokenIn, uint256 pairOutGross, uint256 fee, uint256 realPair, uint256 tokensSold, uint256 spotPriceWad, uint256 progressBps)";
const CREATOR_FEE_EVENT =
  "event CreatorFeeAccrued(uint256 indexed launchId, address indexed creator, address indexed asset, uint256 amount)";
const REFERRAL_FEE_EVENT =
  "event ReferralFeeAccrued(uint256 indexed launchId, address indexed referrer, address indexed asset, uint256 amount)";

const L_FEES = "Bonding Curve Trading Fees";
const L_CREATORS = "Trading Fees To Creators";
const L_REFERRERS = "Trading Fees To Referrers";
const L_REVENUE = "Trading Fees To Platform";
const L_PROTOCOL = "Trading Fees To Protocol";
const L_HOLDERS = "Trading Fees To SPROUT Buyback And Burn";

const coreInterface = new ethers.Interface([
  "function getLaunchPairAsset(uint256 launchId) view returns (address)",
]);

// the quote (pair) asset of a launch never changes, so it is cached across runs
const quoteCache: Record<string, string> = {};

async function getQuoteToken(provider: any, launchId: string): Promise<string> {
  if (quoteCache[launchId]) return quoteCache[launchId];
  const data = coreInterface.encodeFunctionData("getLaunchPairAsset", [launchId]);
  const result = await provider.call({ to: CORE, data });
  const [asset] = coreInterface.decodeFunctionResult("getLaunchPairAsset", result);
  if (!asset || asset === ethers.ZeroAddress) {
    throw new Error(`Sprout: no quote asset found for launch ${launchId}`);
  }
  quoteCache[launchId] = String(asset).toLowerCase();
  return quoteCache[launchId];
}

// `injective` is registered as both a cosmos and an EVM chain, so the sdk cannot turn
// a timestamp into an EVM block. Resolve the block range through the EVM rpc instead.
async function firstBlockAtOrAfter(provider: any, timestamp: number, latest: number): Promise<number> {
  let lo = LOWEST_BLOCK;
  let hi = latest;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const block = await provider.getBlock(mid);
    if (block.timestamp >= timestamp) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

async function getBlockRange(provider: any, options: FetchOptions) {
  const latest = await provider.getBlockNumber();
  const latestBlock = await provider.getBlock(latest);
  const fromBlock = await firstBlockAtOrAfter(provider, options.startTimestamp, latest);
  const toBlock =
    latestBlock.timestamp < options.endTimestamp
      ? latest
      : (await firstBlockAtOrAfter(provider, options.endTimestamp, latest)) - 1;
  return { fromBlock, toBlock };
}

const addTo = (map: Record<string, bigint>, token: string, amount: any) => {
  map[token] = (map[token] ?? 0n) + BigInt(amount.toString());
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const result = { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };

  const provider = (options.api as any).provider;
  const { fromBlock, toBlock } = await getBlockRange(provider, options);
  if (toBlock < fromBlock) return result;

  const getEvents = (eventAbi: string): Promise<any[]> =>
    options.getLogs({ target: CORE, eventAbi, fromBlock, toBlock } as any);

  const buys = await getEvents(BUY_EVENT);
  const sells = await getEvents(SELL_EVENT);
  const creatorAccruals = await getEvents(CREATOR_FEE_EVENT);
  const referralAccruals = await getEvents(REFERRAL_FEE_EVENT);

  const launchIds = [...new Set([...buys, ...sells].map((log: any) => String(log.launchId)))];
  const tokens = await Promise.all(launchIds.map((id) => getQuoteToken(provider, id)));
  const quoteByLaunch: Record<string, string> = {};
  launchIds.forEach((id, i) => (quoteByLaunch[id] = tokens[i]));

  const fees: Record<string, bigint> = {};
  const creators: Record<string, bigint> = {};
  const referrers: Record<string, bigint> = {};

  [...buys, ...sells].forEach((log: any) => addTo(fees, quoteByLaunch[String(log.launchId)], log.fee));
  creatorAccruals.forEach((log: any) => addTo(creators, String(log.asset).toLowerCase(), log.amount));
  referralAccruals.forEach((log: any) => addTo(referrers, String(log.asset).toLowerCase(), log.amount));

  for (const token of Object.keys(fees)) {
    const fee = fees[token];
    const creator = creators[token] ?? 0n;
    const referrer = referrers[token] ?? 0n;
    // platform share = total trade fee minus what is credited to creators and referrers
    const platform = fee - creator - referrer;
    if (platform < 0n) throw new Error(`Sprout: creator and referral fees exceed total fees for ${token}`);
    const holders = (platform * BUYBACK_SHARE_PERCENT) / 100n;

    dailyFees.add(token, fee, L_FEES);
    dailySupplySideRevenue.add(token, creator, L_CREATORS);
    dailySupplySideRevenue.add(token, referrer, L_REFERRERS);
    dailyRevenue.add(token, platform, L_REVENUE);
    dailyHoldersRevenue.add(token, holders, L_HOLDERS);
    dailyProtocolRevenue.add(token, platform - holders, L_PROTOCOL);
  }

  return result;
};

const methodology = {
  Fees: "Trading fees paid on every buy and sell on sprout.fun bonding curves (1% or 3% per launch).",
  Revenue: "Trading fees minus the share credited to launch creators and referrers (the platform share).",
  SupplySideRevenue: "Share of trading fees credited to launch creators and to referrers.",
  ProtocolRevenue: "Part of the platform share that is not used for SPROUT buyback and burn.",
  HoldersRevenue: "80% of the platform share funds SPROUT buyback and burn (ratio taken from the Sprout docs).",
};

const breakdownMethodology = {
  Fees: { [L_FEES]: "Fees charged on every buy and sell on the bonding curve." },
  Revenue: { [L_REVENUE]: "Trading fees minus creator and referral fees." },
  SupplySideRevenue: {
    [L_CREATORS]: "Trading fees credited to launch creators (CreatorFeeAccrued).",
    [L_REFERRERS]: "Trading fees credited to referrers (ReferralFeeAccrued).",
  },
  ProtocolRevenue: { [L_PROTOCOL]: "Platform share not used for SPROUT buyback and burn." },
  HoldersRevenue: { [L_HOLDERS]: "80% of the platform share used to buy back and burn SPROUT." },
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
