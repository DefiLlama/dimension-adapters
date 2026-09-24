import { ChainApi } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Ellipse (ellipse.fun) - Uniswap-v4-native token launchpad on Arc.
//
// TWO generations are live at once and both have to be read. V5 shipped 2026-09-16;
// V6 took over NEW launches on 2026-09-17. V6 did not retire V5: every V5 launch
// keeps its pool, its own hook and its own fee stream, so V5 goes on paying for as
// long as its pools trade. Each generation has its own launchpad and its own
// dedicated hook, and a launch's fees are always withheld by the hook its launchpad
// registered it with - so a generation is (launchpad, hook), and both pairs count.
//
// V1-V4 pay fees through a separate per-launch lock contract on plain Uniswap v3 -
// a different, unverified-per-launch mechanism not enumerated here (same scoping
// call as RadarDEX's excluded Classic-launch mode).
//
// Every V5/V6 launch opens directly into a Uniswap v4 pool on Arc's shared canonical
// PoolManager, with no bonding-curve stage - so trading volume belongs to that DEX
// listing, not to Ellipse (same as RadarDEX, which also has no dexs/ listing).
const GENERATIONS = [
  {
    // V5, deployed 2026-09-16 at block 21193710.
    launchpad: "0xce0608f4f7dbfd661f40934359487e4c08e6c84a",
    hook: "0x73fff717ae2150d68c6b24012fb57909e2507a88",
  },
  {
    // V6, deployed 2026-09-17 at block 21408490 (its hook at 21408479).
    launchpad: "0x66bdc0803807f8a62763943fb2dd584ed9fb9c16",
    hook: "0x143d72d4bd0f0e1a6c6fd4f2f671a45d9e003a88",
  },
];
const LAUNCH_HOOKS = GENERATIONS.map((g) => g.hook);
const LAUNCHPAD_BY_HOOK: Record<string, string> = Object.fromEntries(
  GENERATIONS.map((g) => [g.hook, g.launchpad])
);

// The fee event, emitted by the hook. Signature Trattenuto(bytes32,address,uint256,uint24,bool);
// poolId and currency are indexed. It fires on EVERY swap that pays a launch fee. The
// hook withholds the fee inside beforeSwap as an ERC-6909 credit against the PoolManager
// and settles it to the recipients later, in a separate permissionless call. This event
// is therefore the fee at the moment the trader actually pays it, which is what a daily
// fee series wants; the later settlement happens whenever someone bothers to trigger it,
// so its timing carries no information. `openingWindow` selects which split applies (below).
//
// THE RATE IS NOT ASSUMED. It is 1% at regime, but an anti-sniper launch charges far
// more on buys during its opening window, on a curve that decays over the first
// blocks - 95%, then 70%, 40% and 10% - before settling at the same 1%; sells in that
// window pay the regime rate. The event carries both the amount and the rate that
// produced it, and this adapter reads the amount, so the curve needs no reproducing
// here and a change to it cannot silently put this adapter wrong.
const FEE_WITHHELD =
  "event Trattenuto(bytes32 indexed poolId, address indexed currency, uint256 amount, uint24 rate, bool openingWindow)";

// The launch record, read from the launchpad's public `lanci` mapping, keyed by the
// same v4 pool id the fee event carries. Only `rewardHolders` is needed: the on-chain
// record of the once-only split choice.
//
// A READ, NOT A LOG SCAN, and deliberately so. The obvious source for this flag is
// the launchpad's own launch event, but that means asking for logs from the first
// launchpad's deploy block on every run, and Arc's public RPCs answer that with
// "pruned history unavailable" - which fails the whole adapter, including the part
// that needs no history at all. The flag is in contract storage and the record is
// written once at launch and never touched again, so one call at the head of the
// chain gives the same answer the log would, on a node that keeps no history.
const LAUNCH_RECORD_ABI =
  "function lanci(bytes32 poolId) view returns (address token, address pairToken, address creator, bool tokenIsCurrency0, int24 tickLower, int24 tickUpper, uint128 liquidity, uint32 launchBlock, uint256 openingMcap, bool rewardHolders, uint128 devBuy, uint128 devBuyTokens, bool antiSniper)";

// TWO SPLITS, and the event says which one applies.
//
// At REGIME (openingWindow false) the launch's own choice applies, fixed at creation
// and not adjustable after: 50% protocol / 50% creator by default, or 30/30/40 with
// the remainder to the Reward Vault when the launch opted into Holder Rewards.
//
// During the OPENING WINDOW (openingWindow true) one fixed split applies to every
// launch regardless of that choice: 10% protocol, 10% creator, and the whole 80%
// remainder to the launch's Treasury Reserve - money earmarked to bid under the price
// and buy the launched token back to burn it. An earlier revision of this adapter
// applied the regime split to window fees as well, which would have reported five
// times the protocol's actual share of them.
//
// Reproduced as floor + remainder in the same order the contract uses, so
// Fees = Revenue + SupplySideRevenue holds by construction in both branches.
const SPLIT_BPS = 10000n;
const WINDOW_PROTOCOL_BPS = 1000n;
const WINDOW_CREATOR_BPS = 1000n;
const regimeEqualShareBps = (rewardHolders: boolean) => (rewardHolders ? 3000n : 5000n);

const LAUNCH_POOL_FEES = "Launch Pool Fees";
const FEES_TO_PROTOCOL = "Launch Pool Fees to Protocol";
const FEES_TO_CREATORS = "Launch Pool Fees to Creators";
const FEES_TO_HOLDERS = "Launch Pool Fees to Token Holders";
const FEES_TO_BUYBACK = "Launch Pool Fees to Token Buyback";

type Withheld = {
  launchpad: string;
  poolId: string;
  currency: string;
  amount: bigint;
  openingWindow: boolean;
};

// Only the pools that actually paid a regime fee in this window get looked up: an
// opening-window fee splits the same way whatever the launch chose, so it needs no
// lookup at all, and most windows touch one pool or none.
async function getRewardHoldersByPool(chain: string, withheld: Withheld[]) {
  const wanted = new Map<string, Set<string>>();
  for (const w of withheld) {
    if (w.openingWindow || !w.launchpad) continue;
    if (!wanted.has(w.launchpad)) wanted.set(w.launchpad, new Set());
    wanted.get(w.launchpad)!.add(w.poolId);
  }

  const rewardHolders = new Map<string, boolean>();
  if (!wanted.size) return rewardHolders;

  const api = new ChainApi({ chain });
  for (const [launchpad, poolIds] of wanted) {
    const ids = [...poolIds];
    const records = await api.multiCall({
      abi: LAUNCH_RECORD_ABI,
      target: launchpad,
      calls: ids.map((params) => ({ params })),
    });
    records.forEach((record: any, i: number) => {
      // A pool id its own launchpad does not know would come back zeroed. That should
      // not happen - the hook only ever charges pools its launchpad registered - so it
      // is left out of the map rather than defaulted, and the default split applies.
      if (!record || record.token?.toLowerCase() === ADDRESSES.null) return;
      rewardHolders.set(ids[i], Boolean(record.rewardHolders));
    });
  }
  return rewardHolders;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    targets: LAUNCH_HOOKS,
    eventAbi: FEE_WITHHELD,
    onlyArgs: false,
    flatten: true,
  });

  const withheld: Withheld[] = [];
  for (const log of logs) {
    const { poolId, currency, amount, openingWindow } = log.args;
    const fee = BigInt(amount);
    if (fee === 0n) continue;
    withheld.push({
      launchpad: LAUNCHPAD_BY_HOOK[log.address.toLowerCase()],
      poolId,
      currency,
      amount: fee,
      openingWindow,
    });
  }

  const rewardHoldersByPool = await getRewardHoldersByPool(options.chain, withheld);

  for (const { poolId, currency, amount, openingWindow } of withheld) {
    // A native-quoted pool would use the zero address as its v4 currency (18-decimal,
    // Arc's dual-decimal USDC gotcha) - route through addGasToken, not the 6-decimal
    // ERC-20 facade. No launch observed so far uses this, but it costs nothing to guard.
    const isNative = currency.toLowerCase() === ADDRESSES.null;
    const add = (bal: ReturnType<FetchOptions["createBalances"]>, amt: bigint, label: string) => {
      if (amt <= 0n) return;
      if (isNative) bal.addGasToken(amt, label);
      else bal.add(currency, amt, label);
    };

    add(dailyFees, amount, LAUNCH_POOL_FEES);

    if (openingWindow) {
      const toProtocol = (amount * WINDOW_PROTOCOL_BPS) / SPLIT_BPS;
      const toCreator = (amount * WINDOW_CREATOR_BPS) / SPLIT_BPS;
      add(dailyRevenue, toProtocol, FEES_TO_PROTOCOL);
      add(dailySupplySideRevenue, toCreator, FEES_TO_CREATORS);
      add(dailySupplySideRevenue, amount - toProtocol - toCreator, FEES_TO_BUYBACK);
    } else {
      const equalShare =
        (amount * regimeEqualShareBps(rewardHoldersByPool.get(poolId) ?? false)) / SPLIT_BPS;
      add(dailyRevenue, equalShare, FEES_TO_PROTOCOL);
      add(dailySupplySideRevenue, equalShare, FEES_TO_CREATORS);
      add(dailySupplySideRevenue, amount - equalShare * 2n, FEES_TO_HOLDERS);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "The fee a V5 or V6 launch pool charges on each trade, taken by that launch's hook inside the swap itself and read from the hook's own event, so the rate is never assumed here. It is 1% at regime; an anti-sniper launch charges more on buys during its opening window, on a curve that decays over the first blocks - 95%, then 70%, 40% and 10% - before settling at the same 1%, while sells in that window pay the regime rate. The fee is taken in either the launched token or its quote asset, whichever side the trader paid in. Both generations are read: V6 only took over new launches, it did not stop V5's existing pools from trading. V1-V4 legacy launches (pre-hook, plain Uniswap v3 with a per-launch lock contract) are not covered.",
  Revenue: "The protocol's share of each fee, which is a split of the fee and not a rate on the trade: it keeps 50% under the default split, 30% when the launch opted into Holder Rewards, and 10% of any fee taken during a launch's opening window, which has its own fixed split. All three are set by the contract and not adjustable after launch.",
  ProtocolRevenue: "The protocol's share of each fee, which is a split of the fee and not a rate on the trade: it keeps 50% under the default split, 30% when the launch opted into Holder Rewards, and 10% of any fee taken during a launch's opening window, which has its own fixed split. All three are set by the contract and not adjustable after launch.",
  SupplySideRevenue: "Everything not kept by the protocol: the creator's share, the remainder streamed to the launched token's own holders via the Reward Vault on Holder-Rewards launches, and - on fees taken during the opening window - the 80% earmarked to the launch's Treasury Reserve, which buys the launched token back to burn it.",
};

const breakdownMethodology = {
  Fees: {
    [LAUNCH_POOL_FEES]: "Fee withheld by a V5 or V6 launch hook on each trade in that launch's Uniswap v4 pool - 1% at regime, and up to 95% on buys in the first blocks of an anti-sniper launch's opening window - in whichever currency (launched token or quote asset) the trader paid in.",
  },
  Revenue: {
    [FEES_TO_PROTOCOL]: "Protocol's share of each fee: 50% by default, 30% on Holder-Rewards launches, 10% during a launch's opening window.",
  },
  ProtocolRevenue: {
    [FEES_TO_PROTOCOL]: "Protocol's share of each fee: 50% by default, 30% on Holder-Rewards launches, 10% during a launch's opening window.",
  },
  SupplySideRevenue: {
    [FEES_TO_CREATORS]: "Creator's share of each fee: 50% by default, 30% on Holder-Rewards launches, 10% during a launch's opening window.",
    [FEES_TO_HOLDERS]: "Holder-Rewards launches only: the ~40% remainder streamed to the launched token's own holders via the Reward Vault.",
    [FEES_TO_BUYBACK]: "Opening-window fees only: the 80% remainder sent to the launch's Treasury Reserve, which bids under the price to buy the launched token back and burn it.",
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
