import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Hookers is a Uniswap v4 token launchpad on Robinhood Chain. Every launch is
// quoted in native ETH, so every fee below is denominated in the gas token.
//
// A launch style is a row in this registry rather than a code release, and the
// list is append-only, so the hooks and custody contracts to read are looked up
// here instead of being hardcoded. A style added later is picked up with no
// change to this adapter.
const MECHANISM_REGISTRY = "0x71c12b5bf7f6b056176c3d028d708f3397fc3ea2";
// The registry's first MechanismAdded; nothing to scan before it.
const MECHANISM_REGISTRY_START_BLOCK = 35375261;

// Holds every launch's liquidity and stamps the pool price into each swap.
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";

// Styles whose creator slice is spent buying the launched token back and
// burning it, rather than paid out to the creator. Anything not listed here is
// treated as paid to the creator, which is the conservative reading for a style
// this adapter has not seen: it never overstates revenue.
const BUYBACK_HOOKS = new Set(["0x7aa716e1a2dad5309abeca3e8c75abfed287a0cc"]);

// HKRS is the protocol's own token. Buying it back and burning it accrues to
// HKRS holders; doing the same on any other launch accrues to that token's
// holders, which is supply side rather than holders revenue.
const HKRS = "0x833153ecb2c183702907e1142317a707137af954";
const HKRS_POOL_ID = "0x0aa468dc81511bf0bc98390c0d38a59f65a3474fe492da4380f739f5cced47b5";

// Spends part of the protocol's fee share on HKRS buyback and burn, run by the
// team rather than by a contract. The buy and the burn are separate
// transactions and the ETH can sit in the wallet in between, so the burn is
// what gets counted.
const BUYBACK_WALLET = "0xaccfdad319a83dc52bb42f22353dd28494ad0b6e";
const DEAD = "0x000000000000000000000000000000000000dead";

// Uniswap v4 state reader, used to value a burn in ETH from the HKRS pool.
const STATE_VIEW = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b";

const NATIVE = "0x0000000000000000000000000000000000000000";

// Every hook declares this event with the same types. The sixth field is the
// creator's slice of the skim; hooks name it `creatorFee` or `toBuyback`
// depending on where that slice goes.
const SWAP_FEES_ACCRUED =
  "event SwapFeesAccrued(bytes32 indexed poolId, address indexed sender, bool indexed isBuy, uint16 appliedFeeBps, uint256 grossQuoteAmount, uint256 creatorFee, uint256 protocolFee)";
const FEES_COLLECTED =
  "event FeesCollected(bytes32 indexed poolId, address indexed collector, address indexed to, uint256 amount0, uint256 amount1)";
const PROTOCOL_FEE_PAID =
  "event ProtocolFeePaid(bytes32 indexed poolId, address indexed currency, uint256 amount)";
const TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const MECHANISM_ADDED =
  "event MechanismAdded(uint32 indexed id, address indexed hook, address indexed custody, address quoteRegistry)";
const POOL_SWAP =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const GET_SLOT0 =
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)";

// Labels used for the breakdowns; every one has a breakdownMethodology entry.
const PROTOCOL_SHARE = "Swap Fees To Protocol";
const THIRD_PARTY_BUY_BACK = "Buy Back On Third-Party Launches";

const ZERO = BigInt(0);
const Q192 = BigInt(2) ** BigInt(192);

const lower = (value: any) => String(value).toLowerCase();
const asTopic = (address: string) => "0x000000000000000000000000" + address.slice(2).toLowerCase();

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Read the launch styles from the registry's own events rather than its
  // current storage: logs are never pruned, so this still resolves on a
  // historical backfill where an archive node may not be available.
  const mechanisms = await options.getLogs({
    target: MECHANISM_REGISTRY,
    eventAbi: MECHANISM_ADDED,
    fromBlock: MECHANISM_REGISTRY_START_BLOCK,
    toBlock: await options.getToBlock(),
    cacheInCloud: true,
  });

  // A hookless style carries the zero address; its fee is the pool's own LP fee
  // and is collected through custody instead of skimmed by a hook.
  const hooks = [...new Set(mechanisms.map((m: any) => lower(m.hook)))].filter((h) => h !== NATIVE);
  const custodies = [...new Set(mechanisms.map((m: any) => lower(m.custody)))];

  const [hookLogs, burns, collected, protocolPaid] = await Promise.all([
    // One query across every hook; `onlyArgs: false` keeps the emitting
    // address so each log can be traced back to its launch style.
    options.getLogs({ targets: hooks, eventAbi: SWAP_FEES_ACCRUED, onlyArgs: false }),
    // Filtered at the node: only HKRS leaving the buyback wallet for the burn
    // address, rather than every HKRS transfer of the day.
    options.getLogs({
      target: HKRS,
      eventAbi: TRANSFER,
      topics: [TRANSFER_TOPIC, asTopic(BUYBACK_WALLET), asTopic(DEAD)],
    }),
    options.getLogs({ targets: custodies, eventAbi: FEES_COLLECTED, flatten: true }),
    options.getLogs({ targets: custodies, eventAbi: PROTOCOL_FEE_PAID, flatten: true }),
  ]);

  // Hooked styles skim a directional fee and split it. The protocol's 30 bps is
  // the same for every style; where the creator's slice goes is what differs.
  hookLogs.forEach((log: any) => {
    const { creatorFee, protocolFee, poolId } = log.args;

    dailyFees.addGasToken(BigInt(creatorFee) + BigInt(protocolFee), METRIC.SWAP_FEES);
    dailyProtocolRevenue.addGasToken(protocolFee, PROTOCOL_SHARE);
    dailyRevenue.addGasToken(protocolFee, PROTOCOL_SHARE);

    if (BUYBACK_HOOKS.has(lower(log.address))) {
      if (lower(poolId) === HKRS_POOL_ID) {
        dailyHoldersRevenue.addGasToken(creatorFee, METRIC.TOKEN_BUY_BACK);
        dailyRevenue.addGasToken(creatorFee, METRIC.TOKEN_BUY_BACK);
      } else {
        dailySupplySideRevenue.addGasToken(creatorFee, THIRD_PARTY_BUY_BACK);
      }
    } else {
      dailySupplySideRevenue.addGasToken(creatorFee, METRIC.CREATOR_FEES);
    }
  });

  // Discretionary HKRS buyback and burn. The team withdraws the protocol's fee
  // share to its own wallet and spends part of it buying HKRS, so no event ties
  // a given swap to the protocol; the burn is the reliable signal. Each burn is
  // valued in ETH at the HKRS pool's own price, which keeps this in the gas
  // token rather than depending on a market price for HKRS. The automatic hook
  // burns straight out of the PoolManager, so filtering on the buyback wallet
  // as sender keeps the two from being counted twice.
  const burned = burns.reduce((sum: bigint, log: any) => sum + BigInt(log.value), ZERO);

  if (burned > ZERO) {
    // Price the burn from the last swap of the window, which carries the pool
    // price in the log itself. Only if the window holds no swap at all does this
    // fall back to reading contract state, which a pruned node may refuse.
    const swaps = await options.getLogs({
      target: POOL_MANAGER,
      eventAbi: POOL_SWAP,
      topics: [SWAP_TOPIC, HKRS_POOL_ID],
    });
    const sqrtPriceX96 = swaps.length
      ? swaps[swaps.length - 1].sqrtPriceX96
      : (await options.toApi.call({ target: STATE_VIEW, abi: GET_SLOT0, params: [HKRS_POOL_ID] }))[0];
    // ETH is currency0 and HKRS is currency1, so the pool price is HKRS per ETH:
    // price = (sqrtPriceX96 / 2**96) ** 2. Inverting that to value the burn in
    // ETH gives burned * 2**192 / sqrtPriceX96**2, kept in integer arithmetic so
    // neither the token amount nor the 160-bit price loses precision. Both sides
    // are 18 decimals, so no scaling is needed.
    const sqrtPrice = BigInt(sqrtPriceX96);
    if (sqrtPrice > ZERO) {
      dailyHoldersRevenue.addGasToken((burned * Q192) / (sqrtPrice * sqrtPrice), METRIC.TOKEN_BUY_BACK);
    }
  }

  // Hookless styles: the fee is the pool's own Uniswap v4 LP fee, collected on
  // demand through custody. `FeesCollected` reports the amount NET of the
  // protocol's cut, so gross is that plus the matching `ProtocolFeePaid`.
  // amount1 is the launched token, which has no price, so only the ETH leg counts.
  collected.forEach((log: any) => {
    dailyFees.addGasToken(log.amount0, METRIC.LP_FEES);
    dailySupplySideRevenue.addGasToken(log.amount0, METRIC.LP_FEES);
  });

  protocolPaid
    .filter((log: any) => lower(log.currency) === NATIVE)
    .forEach((log: any) => {
      dailyFees.addGasToken(log.amount, METRIC.LP_FEES);
      dailyProtocolRevenue.addGasToken(log.amount, PROTOCOL_SHARE);
      dailyRevenue.addGasToken(log.amount, PROTOCOL_SHARE);
    });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Swap fees charged on Hookers launches, in native ETH. A creator picks a launch style from the protocol's mechanism registry. Hooked styles skim a directional buy/sell fee inside the hook, set by the creator between 100 and 1000 bps. Hookless styles use the pool's own Uniswap v4 LP fee, collected through LiquidityCustody. The registry is read on chain, so styles added later are included automatically.",
  Revenue: "The 30 bps protocol fee routed to FeeRouter, plus the share spent buying back and burning HKRS, the protocol's own token.",
  ProtocolRevenue: "A flat 30 bps of trade volume routed to FeeRouter. It is carved out of the creator's advertised fee rather than added on top, and applies identically to every launch style.",
  HoldersRevenue: "HKRS bought back and burned, valued in ETH. This covers the automatic buyback hook on the HKRS pool, plus the discretionary buybacks the team runs out of the protocol's fee share, which are measured from the HKRS burned and priced from the HKRS pool. Buybacks on third-party launches are excluded and counted as supply side, since they accrue to those tokens' holders. Discretionary buybacks are funded from fees already counted as protocol revenue, so this figure overlaps ProtocolRevenue rather than adding to Revenue.",
  SupplySideRevenue: "Fees paid out to launch creators: the creator-nominated fee slots on creator-fee styles, LP fees on hookless styles, and buyback and burn on third-party launches.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Directional buy/sell fee skimmed inside the hook on hooked launch styles, set by the creator between 100 and 1000 bps (creatorFee + protocolFee from SwapFeesAccrued).",
    [METRIC.LP_FEES]: "The pool's own Uniswap v4 LP fee on hookless launch styles, collected through LiquidityCustody (FeesCollected plus the matching ProtocolFeePaid).",
  },
  Revenue: {
    [PROTOCOL_SHARE]: "The 30 bps protocol share of trade volume, routed to FeeRouter.",
    [METRIC.TOKEN_BUY_BACK]: "ETH spent buying back HKRS, the protocol's own token, and burning it.",
  },
  ProtocolRevenue: {
    [PROTOCOL_SHARE]: "The 30 bps protocol share of trade volume, routed to FeeRouter.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "HKRS bought back and burned, valued in ETH: the automatic buyback hook on the HKRS pool, plus the discretionary buybacks the team runs out of the protocol's fee share.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "Hook fees paid to the creator-nominated fee slots on creator-fee launch styles.",
    [METRIC.LP_FEES]: "Uniswap v4 LP fees paid to the creator on hookless launch styles.",
    [THIRD_PARTY_BUY_BACK]: "Fees spent buying back and burning a third-party launch's own token, which accrues to that token's holders rather than to the protocol's.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-08-14", // first launch, block 36138302
  // Every launch is a Uniswap v4 pool, so these swap fees also appear in the
  // Uniswap v4 numbers for this chain.
  doublecounted: true,
};

export default adapter;
