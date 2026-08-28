import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Hookers is a Uniswap v4 token launchpad on Robinhood Chain. Every launch is
// quoted in native ETH, so every fee below is denominated in the gas token.
//
// A launch style is a row in this registry rather than a code release, and the
// list is append-only, so the hooks and custody contracts to read are looked up
// here instead of being hardcoded. A style added later is picked up with no
// change to this adapter.
const MECHANISM_REGISTRY = "0x71c12b5bf7f6b056176c3d028d708f3397fc3ea2";

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

const MECHANISM_COUNT = "function mechanismCount() view returns (uint32)";
const GET_MECHANISM =
  "function getMechanism(uint32 id) view returns ((address hook, address custody, address quoteRegistry, bool enabled, uint64 addedAt))";
const GET_SLOT0 =
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)";

const lower = (value: any) => String(value).toLowerCase();
const asTopic = (address: string) => "0x000000000000000000000000" + address.slice(2).toLowerCase();

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Mechanism ids run from 1 to mechanismCount.
  const count = Number(await options.api.call({ target: MECHANISM_REGISTRY, abi: MECHANISM_COUNT }));
  const mechanisms = await options.api.multiCall({
    target: MECHANISM_REGISTRY,
    abi: GET_MECHANISM,
    calls: Array.from({ length: count }, (_, i) => i + 1),
  });

  // A hookless style carries the zero address; its fee is the pool's own LP fee
  // and is collected through custody instead of skimmed by a hook.
  const hooks = [...new Set(mechanisms.map((m: any) => lower(m.hook)))].filter((h) => h !== NATIVE);
  const custodies = [...new Set(mechanisms.map((m: any) => lower(m.custody)))];

  const [hookLogs, burns, collected, protocolPaid] = await Promise.all([
    Promise.all(
      hooks.map(async (hook) => ({
        hook,
        logs: await options.getLogs({ target: hook, eventAbi: SWAP_FEES_ACCRUED }),
      }))
    ),
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
  hookLogs.forEach(({ hook, logs }) => {
    const isBuyback = BUYBACK_HOOKS.has(hook);
    logs.forEach((log: any) => {
      dailyFees.addGasToken(log.creatorFee + log.protocolFee);
      dailyProtocolRevenue.addGasToken(log.protocolFee);
      dailyRevenue.addGasToken(log.protocolFee);

      if (isBuyback && lower(log.poolId) === HKRS_POOL_ID) {
        dailyHoldersRevenue.addGasToken(log.creatorFee);
        dailyRevenue.addGasToken(log.creatorFee);
      } else {
        dailySupplySideRevenue.addGasToken(log.creatorFee);
      }
    });
  });

  // Discretionary HKRS buyback and burn. The team withdraws the protocol's fee
  // share to its own wallet and spends part of it buying HKRS, so no event ties
  // a given swap to the protocol; the burn is the reliable signal. Each burn is
  // valued in ETH at the HKRS pool's own price, which keeps this in the gas
  // token rather than depending on a market price for HKRS. The automatic hook
  // burns straight out of the PoolManager, so filtering on the buyback wallet
  // as sender keeps the two from being counted twice.
  const burned = burns.reduce((sum: number, log: any) => sum + Number(log.value), 0);

  if (burned > 0) {
    const [sqrtPriceX96] = await options.toApi.call({
      target: STATE_VIEW,
      abi: GET_SLOT0,
      params: [HKRS_POOL_ID],
    });
    // ETH is currency0 and HKRS is currency1, so the pool price is HKRS per ETH.
    // Both sides are 18 decimals, so no scaling is needed.
    const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
    if (sqrtPrice > 0) dailyHoldersRevenue.addGasToken(burned / (sqrtPrice * sqrtPrice));
  }

  // Hookless styles: the fee is the pool's own Uniswap v4 LP fee, collected on
  // demand through custody. `FeesCollected` reports the amount NET of the
  // protocol's cut, so gross is that plus the matching `ProtocolFeePaid`.
  // amount1 is the launched token, which has no price, so only the ETH leg counts.
  collected.forEach((log: any) => {
    dailyFees.addGasToken(log.amount0);
    dailySupplySideRevenue.addGasToken(log.amount0);
  });

  protocolPaid
    .filter((log: any) => lower(log.currency) === NATIVE)
    .forEach((log: any) => {
      dailyFees.addGasToken(log.amount);
      dailyProtocolRevenue.addGasToken(log.amount);
      dailyRevenue.addGasToken(log.amount);
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

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-08-14",
    },
  },
  methodology,
  // Every launch is a Uniswap v4 pool, so these swap fees also appear in the
  // Uniswap v4 numbers for this chain.
  doublecounted: true,
};

export default adapter;
