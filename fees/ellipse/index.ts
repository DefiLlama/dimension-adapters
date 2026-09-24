import { AbiCoder } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Ellipse (ellipse.fun) - Uniswap-v4-native token launchpad on Arc.
//
// Ellipse has shipped 5 launchpad generations; the docs mark V3/V4 closed to new
// launches and V5 current. V5 and its dedicated fee-collection hook were deployed
// together (2026-09-16) and are the only generation covered here. V1-V4 pay fees
// through a separate per-launch lock contract on plain Uniswap v3 - a different,
// unverified-per-launch mechanism not enumerated here (same scoping call as
// RadarDEX's excluded Classic-launch mode).
//
// Every V5 launch opens directly into a Uniswap v4 pool on Arc's shared canonical
// PoolManager, with no bonding-curve stage - so trading volume belongs to that DEX
// listing, not to Ellipse (same as RadarDEX, which also has no dexs/ listing).
const LAUNCHPAD_V5 = "0xce0608f4f7dbfd661f40934359487e4c08e6c84a";
const LAUNCHPAD_V5_DEPLOY_BLOCK = 21193710;
const LAUNCH_HOOK = "0x73fff717ae2150d68c6b24012fb57909e2507a88";

// LaunchCreated: topics [sig, launchId, launchedToken, creatorEOA]; data decodes as
// (pairToken, totalSupply, rewardHolders, sqrtPrice, devBuyTokens, devBuyQuote). Only
// rewardHolders (0/1) is needed: the on-chain record of the once-only split choice.
const LAUNCH_CREATED_EVENT_TOPIC = "0x40b4b25196bc0883601f8343c912947a96764305a3593ed7f4d8940231c97d6f";
const LAUNCH_CREATED_DATA_TYPES = ["address", "uint256", "uint256", "uint256", "uint256", "uint256"];

// Fires per (launchId, currency) each time the hook pulls newly-accrued v4 position
// fees from the pool. Verified not cumulative (independent deltas across two real
// pulls on the same launch). Currency can be either side of the pool.
const FEES_COLLECTED_TOPIC = "0x7a32b29b5f762302ed32575acc509f82e36488f8f6b3a9e14bdd0150e31d3100";
const COLLECTED_DATA_TYPES = ["uint256", "uint256", "uint256"];

const abiCoder = AbiCoder.defaultAbiCoder();

// Standard: 50% creator / 50% protocol. Holder Rewards: 30% creator / 30% protocol /
// 40% holders. Verified against 3 real distribution transactions by reading their raw
// ERC20 Transfer logs directly, independent of any bps assumption: a rewardHolders=0
// launch split into exactly 2 equal transfers; a rewardHolders=1 launch split into 2
// equal transfers plus a 3rd to the Reward Vault, at a 1.3333... ratio to one equal
// share (exactly 40/30). One of the two equal-share recipients was the same address
// across unrelated launches (protocol treasury); the other matched the launch's own
// creator. Reproduced as floor+remainder so Fees = Revenue + SupplySideRevenue holds
// by construction, mirroring the contract's own arithmetic.
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

    // A native-quoted pool would use the zero address as its v4 currency (18-decimal,
    // Arc's dual-decimal USDC gotcha) - route through addGasToken, not the 6-decimal
    // ERC-20 facade. No launch observed so far uses this, but it costs nothing to guard.
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
