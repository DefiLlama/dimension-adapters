import { AbiCoder } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Ellipse (ellipse.fun) - Uniswap-v4-native token launchpad on Arc. Docs: ellipse.fun/docs.
//
// Ellipse has shipped 5 launchpad generations (V1-V5); the docs' own contract registry
// (ellipse.fun/docs?s=contracts) labels V3 and V4 "closed to new launches" and V5
// "current, every quote asset". V5 and its dedicated "Launch hook" were deployed together
// (binary-searched via eth_getCode: V5 at block 21193710, the hook at 21193689, both
// 2026-09-16) - this adapter covers V5 + that hook only.
//
// V1-V4 predate the hook entirely and, per the docs ("Fees accrue to the position, not
// to the protocol" / "The creator picks the split once, at launch; it is written into
// that pool's lock contract at creation and nobody can change it afterwards"), pay fees
// out through a separate per-launch "lock" contract on plain Uniswap v3 - a different,
// unverified-per-launch mechanism this adapter does not attempt to enumerate. Same
// scoping call as RadarDEX's excluded "Classic Launch" mode (fees/radardex/index.ts).
//
// Every V5 launch opens directly into a Uniswap v4 pool on the shared canonical
// PoolManager (0x8366a39c...951, same address as fees/solonpad's UNIV4_POOL_MANAGER,
// confirmed live via a real launch tx's Initialize + ModifyLiquidity logs). There is no
// bonding-curve stage, so per dexs/AGENTS.md ("post-migration volume belongs to the
// receiving DEX") there is no dexs/ellipse: trading volume belongs to the v4 pool, not
// to Ellipse's own curve (same as RadarDEX, which also has no dexs/ listing).
const LAUNCHPAD_V5 = "0xce0608f4f7dbfd661f40934359487e4c08e6c84a";
const LAUNCHPAD_V5_DEPLOY_BLOCK = 21193710;
const LAUNCH_HOOK = "0x73fff717ae2150d68c6b24012fb57909e2507a88";

// LaunchCreated, read from a real launch tx (0x0df45acbc6d64edc08213d626feef153f39d808
// 11833dfafbc79f1dde69d1148): topics are [sig, launchId, launchedToken, creatorEOA];
// data decodes as (pairToken, totalSupply-like, rewardHolders, sqrtPrice-like,
// devBuyTokens, devBuyQuote). The only field this adapter needs is rewardHolders (a
// plain 0/1 uint256): it is the on-chain record of the once-only, unchangeable split
// choice the docs describe ("written into that pool's lock contract at creation").
const LAUNCH_CREATED_EVENT_TOPIC = "0x40b4b25196bc0883601f8343c912947a96764305a3593ed7f4d8940231c97d6f";
const LAUNCH_CREATED_DATA_TYPES = ["address", "uint256", "uint256", "uint256", "uint256", "uint256"];

// Fires once per (launchId, currency) each time the hook pulls newly-accrued Uniswap v4
// position fees out of the pool. Verified NOT cumulative: launch 0x9148222e...'s two
// real pulls (txs 0xf1bf9d0c... amount 11099700946778062637791, then 0x004d4748...
// amount 55498504733890313188) are independent deltas, not a running total - the second
// is far smaller than the first. "currency" can be either side of the pool (the
// launched token itself or its quote asset): both occur on real launches (e.g. launch
// 0xc41f2271... paid a pull in its own launched token, 0x855e0621...973f85 wei).
const FEES_COLLECTED_TOPIC = "0x7a32b29b5f762302ed32575acc509f82e36488f8f6b3a9e14bdd0150e31d3100";
const COLLECTED_DATA_TYPES = ["uint256", "uint256", "uint256"];

const abiCoder = AbiCoder.defaultAbiCoder();

// Docs: "Standard: 50% creator / 50% protocol" or "Holder Rewards: 30% creator / 30%
// protocol / 40% holders". Verified against 3 real Distributed txs (topic
// 0x8645ea90c76fb8aa83f3517d1c7e51ef43efc0055b510ebe4b251b09b4f70721) by reading their
// raw ERC20 Transfer logs directly, independent of any bps assumption:
//  - launch 0xedecec5c... (rewardHolders=0 in its LaunchCreated log): exactly 2 equal
//    transfers, zero remainder -> a clean 50/50 split.
//  - launch 0xc41f2271... (rewardHolders=1): 2 equal transfers plus a 3rd, to the Reward
//    Vault (0x2941208f4415825c512bdcccd0cb9561a3f093ed, matching the docs' own contract
//    registry); the 3rd leg / one equal share = 1.33333..., an exact 40/30 ratio.
//  - launch 0x9148222e... (rewardHolders=0): 2 equal transfers plus 1 wei to the Reward
//    Vault - the integer-rounding remainder of an odd total split 50/50, not a real
//    holder allocation.
// In every case one of the two equal-share recipients was the SAME address
// (0xfef5e10566b0829a9e266f2973a74678ebfe6d6d) across otherwise-unrelated launches -
// the protocol's fixed treasury - while the other recipient matched that launch's own
// LaunchCreated `creatorEOA`. Reproduced here as floor+remainder (not a separate
// holders-bps constant) so Fees = Revenue + SupplySideRevenue holds by construction,
// exactly mirroring the contract's own arithmetic.
const SPLIT_BPS = 10000n;
const bpsPerEqualShare = (rewardHolders: boolean) => (rewardHolders ? 3000n : 5000n);

const LAUNCH_POOL_FEES = "Launch Pool Fees";
const FEES_TO_PROTOCOL = "Launch Pool Fees to Protocol";
const FEES_TO_CREATORS = "Launch Pool Fees to Creators";
const FEES_TO_HOLDERS = "Launch Pool Fees to Token Holders";

async function getRewardHoldersByLaunch(options: FetchOptions) {
  const logs = await options.getLogs({
    target: LAUNCHPAD_V5,
    topic: LAUNCH_CREATED_EVENT_TOPIC,
    fromBlock: LAUNCHPAD_V5_DEPLOY_BLOCK,
    entireLog: true,
    cacheInCloud: true,
  });
  const map = new Map<string, boolean>();
  for (const log of logs) {
    const [, , rewardHolders] = abiCoder.decode(LAUNCH_CREATED_DATA_TYPES, log.data);
    map.set(log.topics[1], rewardHolders === 1n);
  }
  return map;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [rewardHoldersByLaunch, collected] = await Promise.all([
    getRewardHoldersByLaunch(options),
    options.getLogs({ target: LAUNCH_HOOK, topic: FEES_COLLECTED_TOPIC, entireLog: true }),
  ]);

  for (const log of collected) {
    const launchId = log.topics[1];
    const currency = "0x" + log.topics[2].slice(26);
    const [amount] = abiCoder.decode(COLLECTED_DATA_TYPES, log.data);
    if (amount === 0n) continue;

    const rewardHolders = rewardHoldersByLaunch.get(launchId) ?? false;
    const equalShare = (amount * bpsPerEqualShare(rewardHolders)) / SPLIT_BPS;
    const holdersShare = amount - equalShare * 2n;

    // Arc gotcha: a pool quoted in the native gas token would use the zero address as
    // its v4 Currency (18-decimal, msg.value semantics) - route that through
    // addGasToken rather than tagging it with the 6-decimal 0x3600...0000 ERC-20
    // facade. No launch observed so far uses this (all seen quote assets, including
    // 0x3600000000000000000000000000000000000000 itself, are real ERC-20 currencies),
    // but the branch costs nothing and avoids the mistake if one ever does.
    const isNative = currency.toLowerCase() === ADDRESSES.null;
    const add = (bal: ReturnType<FetchOptions["createBalances"]>, amt: bigint, label: string) => {
      if (isNative) bal.addGasToken(amt, label);
      else bal.add(currency, amt, label);
    };

    add(dailyFees, amount, LAUNCH_POOL_FEES);
    add(dailyRevenue, equalShare, FEES_TO_PROTOCOL);
    add(dailySupplySideRevenue, equalShare, FEES_TO_CREATORS);
    if (holdersShare > 0n) add(dailySupplySideRevenue, holdersShare, FEES_TO_HOLDERS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "1% fee (per Ellipse's docs) on every V5 launch pool's Uniswap v4 trades, read from the hook's own fee-collection amount each time it pulls newly-accrued fees from a launch's position - in either the launched token or its quote asset, whichever side the fee accrued on. V1-V4 legacy launches (pre-hook, plain Uniswap v3 with a per-launch lock contract) are not covered.",
  Revenue: "Protocol's equal share of each collection: 50% under the default split, or 30% when the launch opted into Holder Rewards (both fixed per-launch at creation, not adjustable after).",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "The creator's equal share (matching Revenue's percentage) plus, for Holder-Rewards launches, the remaining ~40% streamed to the launched token's own holders via the Reward Vault.",
};

const breakdownMethodology = {
  Fees: {
    [LAUNCH_POOL_FEES]: "Amount collected each time the launch hook pulls newly-accrued Uniswap v4 fees from a launch's locked position, in whichever currency (launched token or quote asset) the fee accrued in.",
  },
  Revenue: {
    [FEES_TO_PROTOCOL]: "Protocol's equal share (50%, or 30% on Holder-Rewards launches) of each fee collection.",
  },
  ProtocolRevenue: {
    [FEES_TO_PROTOCOL]: "Protocol's equal share (50%, or 30% on Holder-Rewards launches) of each fee collection.",
  },
  SupplySideRevenue: {
    [FEES_TO_CREATORS]: "Creator's equal share (matching the protocol's percentage) of each fee collection.",
    [FEES_TO_HOLDERS]: "Holder-Rewards launches only: the ~40% remainder streamed to the launched token's own holders via the Reward Vault.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
