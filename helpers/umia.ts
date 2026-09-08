import { Balances } from "@defillama/sdk";
import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";
import { METRIC } from "./metrics";
import { nullAddress } from "./token";

// Umia protocol contracts on Base: https://github.com/umiafinance/protocol
const HUB = "0x120dbCDd58Bb787309573e29159fE6D37A1983F6";
// Uniswap v4 PoolManager on Base: https://docs.uniswap.org/contracts/v4/deployments
const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";

const BPS_DENOM = 10000;
// Uniswap v4 reports the LP fee in hundredths of a bip (1_000_000 = 100%)
const PIPS_DENOM = 1e6;

const VENTURE_BY_ID =
  "function ventureById(uint256) view returns (tuple(uint256 id, address venture, string name, uint256 createdAt))";
const VENTURE_VAULT = "function ventureLiquidityVault(address) view returns (address)";
const SPOT_PROTOCOL_CUT_BPS = "function spotProtocolFeeCutBps() view returns (uint16)";
const DECISION_PROTOCOL_CUT_BPS = "function decisionProtocolFeeCutBps() view returns (uint16)";
const POOL_KEY =
  "function getPoolKey() view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))";
const SHARE_BALANCE = "function shareBalance(address) view returns (uint256)";
const MARKET_INFO =
  "function marketInfo(uint256) view returns (uint256 id, uint256 ventureId, uint256 tradingStart, uint256 tradingEnd)";

const SPOT_SWAP_EVENT =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const SPOT_SWAP_TOPIC = ethers.id(ethers.EventFragment.from(SPOT_SWAP_EVENT).format());
const PROTOCOL_FEES_COLLECTED_EVENT =
  "event ProtocolFeesCollected(uint256 indexed marketId, address indexed feeRecipient, uint256 feeVenture, uint256 feeMoney)";

const LABEL = {
  SPOT_FEES: METRIC.SWAP_FEES,
  SPOT_PROTOCOL: "Spot protocol fee",
  SPOT_POL: "Spot LP fees on protocol-owned vault shares",
  SPOT_LP: "Spot LP fees (venture vault)",
  DM_FEES: "Decision market swap fees",
  DM_PROTOCOL: "Decision market protocol fee",
  DM_POL: "Decision market LP fees on protocol-owned vault shares",
  DM_LP: "Decision market LP fees (venture vault)",
  SPOT_VOLUME: "Spot swap volume",
};

type SpotContext = { vault: string; poolId: string; moneyIsCurrency0: boolean };

type VentureContext = {
  id: number;
  moneyToken: string;
  ventureToken: string;
  marketCore: string;
  // null until the venture's launch settles and its spot liquidity is migrated
  spot: SpotContext | null;
};

/**
 * PoolIdLibrary.toId() is keccak256 over the five 32-byte PoolKey slots, which
 * is what abi.encode of the same fields produces. The vault caches the id in an
 * immutable with no getter, so it is derived here instead.
 */
function poolKeyToId(poolKey: any): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24", "int24", "address"],
      [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks],
    ),
  );
}

/**
 * The venture at the block being read, or null before the hub created it.
 * `ventureById` is a plain mapping read, so an unknown id returns a zero struct
 * rather than reverting.
 */
async function getVentureContext(options: FetchOptions, ventureId: number): Promise<VentureContext | null> {
  const { api } = options;
  const info = await api.call({ target: HUB, abi: VENTURE_BY_ID, params: [ventureId] });
  if (!info.venture || info.venture === nullAddress) return null;

  const [ventureToken, moneyToken, vault, marketCore] = await api.batchCall([
    { target: info.venture, abi: "address:token" },
    { target: info.venture, abi: "address:moneyToken" },
    { target: HUB, abi: VENTURE_VAULT, params: [info.venture] },
    { target: HUB, abi: "address:umiaMarketCore" },
  ]);
  const ctx: VentureContext = { id: ventureId, moneyToken, ventureToken, marketCore, spot: null };
  if (!vault || vault === nullAddress) return ctx;

  const poolKey = await api.call({ target: vault, abi: POOL_KEY });
  return {
    ...ctx,
    spot: {
      vault,
      poolId: poolKeyToId(poolKey),
      // v4 orders currencies by address, so which leg is the money token varies per venture
      moneyIsCurrency0: poolKey.currency0.toLowerCase() === moneyToken.toLowerCase(),
    },
  };
}

/**
 * The fee recipient and its share of the vault. What the vault earns as an LP
 * accrues to its share holders, so that part of the LP half is protocol revenue
 * too. The share is 1 for UMIA, whose treasury is both the fee recipient and the
 * vault's only depositor, and 0 for a venture whose vault the protocol holds no
 * shares of, where the LP half is that venture's own income. Read at the
 * window's block; deposits are rare enough that a mid-window change is noise.
 */
async function getRecipient(options: FetchOptions, ctx: VentureContext): Promise<{ address: string; share: number }> {
  const { api } = options;
  const address = await api.call({ target: HUB, abi: "address:protocolFeeRecipient" });
  if (!ctx.spot || !address || address === nullAddress) return { address: nullAddress, share: 0 };
  const [held, total] = await api.batchCall([
    { target: ctx.spot.vault, abi: SHARE_BALANCE, params: [address] },
    { target: ctx.spot.vault, abi: "uint256:totalShares" },
  ]);
  if (!Number(total)) return { address, share: 0 };
  return { address, share: Math.min(1, Number(held) / Number(total)) };
}

/** The four balance sheets, plus the one split rule every fee goes through. */
class Books {
  fees: Balances;
  protocol: Balances;
  supplySide: Balances;
  volume: Balances;

  constructor(options: FetchOptions, readonly recipient: { address: string; share: number }) {
    this.fees = options.createBalances();
    this.protocol = options.createBalances();
    this.supplySide = options.createBalances();
    this.volume = options.createBalances();
  }

  /** Splits an amount that accrues to the vault's share holders between the fee recipient and everyone else. */
  toVault(token: string, amount: number, polLabel: string, lpLabel: string) {
    const pol = amount * this.recipient.share;
    this.protocol.add(token, pol, polLabel);
    this.supplySide.add(token, amount - pol, lpLabel);
  }
}

/**
 * Spot swap fees on the venture's Uniswap v4 pool, booked in the money token.
 *
 * v4 Swap amounts are the swapper's own deltas, so the negative leg is what they
 * paid in and the fee is charged on that gross input. When the money token is the
 * input the fee is simply that leg times the rate. When it is the output, the same
 * fee expressed at the swap's realised price is `out * rate / (1 - rate)`, because
 * the output is what remains after the fee was taken off the other leg. Reading
 * the money leg in both directions means a venture token that DefiLlama has not
 * priced yet still reports correct fees from its first swap.
 *
 * The hook only lets the vault add liquidity to the pool, so every fee accrues
 * to the vault. The vault skips the protocol skim when no recipient is set.
 */
async function addSpot(options: FetchOptions, ctx: VentureContext, spot: SpotContext, books: Books) {
  const logs = await options.getLogs({
    target: POOL_MANAGER,
    eventAbi: SPOT_SWAP_EVENT,
    // filter on the indexed pool id so this never scans the whole v4 singleton
    topics: [SPOT_SWAP_TOPIC, spot.poolId],
  });
  if (!logs.length) return;

  const cutBps = books.recipient.address === nullAddress
    ? 0
    : Number(await options.api.call({ target: HUB, abi: SPOT_PROTOCOL_CUT_BPS }));
  const cut = cutBps / BPS_DENOM;

  for (const log of logs) {
    const moneyDelta = Number(spot.moneyIsCurrency0 ? log.amount0 : log.amount1);
    // volume is recorded first: a pool configured with a zero fee still trades
    books.volume.add(ctx.moneyToken, Math.abs(moneyDelta), LABEL.SPOT_VOLUME);

    const rate = Number(log.fee) / PIPS_DENOM;
    if (!rate || rate >= 1) continue;

    const fee = moneyDelta < 0 ? Math.abs(moneyDelta) * rate : (moneyDelta * rate) / (1 - rate);
    const protocolCut = fee * cut;
    books.fees.add(ctx.moneyToken, fee, LABEL.SPOT_FEES);
    books.protocol.add(ctx.moneyToken, protocolCut, LABEL.SPOT_PROTOCOL);
    books.toVault(ctx.moneyToken, fee - protocolCut, LABEL.SPOT_POL, LABEL.SPOT_LP);
  }
}

/**
 * A decision market's fees are recognised once, when the winning proposal's
 * protocol cut is collected after settlement. Fees paid on losing proposals never
 * become real tokens: settlement returns the vault only the winner's remainder and
 * the losers' balances are void, so counting them would inflate fees by the number
 * of proposals. The collection event carries the winner's exact cut in both tokens
 * and the whole fee follows from the cut rate. Markets snapshot that rate at
 * creation without a getter, so the hub's current value is used. The LP half
 * accrues to the winning pool's liquidity, which is the vault's seed plus any
 * liquidity users added; it is attributed to the vault.
 */
async function addDecisionMarkets(options: FetchOptions, ctx: VentureContext, books: Books) {
  if (ctx.marketCore === nullAddress) return;
  const { api } = options;
  const logs = await options.getLogs({ target: ctx.marketCore, eventAbi: PROTOCOL_FEES_COLLECTED_EVENT });
  if (!logs.length) return;

  // Indexed uints decode as padded hex on the indexer path and as decimal on
  // the RPC path; BigInt reads both.
  const marketIds = logs.map((log: any) => BigInt(log.marketId).toString());
  const [infos, cutBps] = await Promise.all([
    api.multiCall({ target: ctx.marketCore, abi: MARKET_INFO, calls: marketIds }),
    api.call({ target: HUB, abi: DECISION_PROTOCOL_CUT_BPS }),
  ]);
  if (!Number(cutBps)) return;

  logs.forEach((log: any, i: number) => {
    if (Number(infos[i].ventureId) !== ctx.id) return;
    const book = (token: string, cut: number) => {
      if (!cut) return;
      const total = (cut * BPS_DENOM) / Number(cutBps);
      books.fees.add(token, total, LABEL.DM_FEES);
      books.protocol.add(token, cut, LABEL.DM_PROTOCOL);
      books.toVault(token, total - cut, LABEL.DM_POL, LABEL.DM_LP);
    };
    book(ctx.moneyToken, Number(log.feeMoney));
    book(ctx.ventureToken, Number(log.feeVenture));
  });
}

function ventureFetch(ventureId: number) {
  return async (options: FetchOptions) => {
    const ctx = await getVentureContext(options, ventureId);
    const books = new Books(options, ctx ? await getRecipient(options, ctx) : { address: nullAddress, share: 0 });
    if (ctx) {
      if (ctx.spot) await addSpot(options, ctx, ctx.spot, books);
      await addDecisionMarkets(options, ctx, books);
    }
    return {
      dailyVolume: books.volume,
      dailyFees: books.fees,
      dailyUserFees: books.fees,
      dailyRevenue: books.protocol,
      dailyProtocolRevenue: books.protocol,
      dailySupplySideRevenue: books.supplySide,
      dailyHoldersRevenue: 0,
    };
  };
}

const METHODOLOGY = {
  Fees: "1% swap fee on the venture's Uniswap v4 spot pool, read from swap events and booked in the money token at each swap's realised price, plus the fees of the winning proposal in each decision market, recognised when its protocol cut is collected after settlement. Fees paid on losing proposals never become real tokens and are not counted.",
  UserFees: "Identical to Fees. Traders pay the swap fee; there is no other charge, and Umia takes no fee on a launch.",
  Revenue: "What accrues to the protocol fee recipient: the 50% protocol cut of spot fees and of the winning proposal's decision-market fees, plus the recipient's share of the other half through the vault shares it holds. That share is 100% for UMIA, whose treasury is the vault's only depositor, and 0% for a venture whose vault the protocol holds no shares of.",
  ProtocolRevenue: "Identical to Revenue. All of it accrues to the protocol fee recipient, directly as the protocol cut or through the vault shares it holds.",
  SupplySideRevenue: "The LP half of spot and winning-proposal decision-market fees, which accrues to the venture's SpotLiquidityVault, less the fee recipient's share. Zero for UMIA while its treasury is the vault's only depositor.",
  HoldersRevenue: "None. No buyback, burn or staker distribution exists on-chain.",
  Volume: "Money-token leg of every swap on the venture's Uniswap v4 spot pool. Pool ids come from the venture vault's own pool key, so only pools operated by Umia count. Decision-market trades are conditional and are not counted as volume.",
};

const FEE_LABELS = {
  [LABEL.SPOT_FEES]: "1% swap fee on the venture's Uniswap v4 spot pool, taken on the gross input of each swap and measured on the money-token leg.",
  [LABEL.DM_FEES]: "Fees of the winning proposal in a settled decision market, recognised when its protocol cut is collected.",
};

const REVENUE_LABELS = {
  [LABEL.SPOT_PROTOCOL]: "50% of spot swap fees.",
  [LABEL.SPOT_POL]: "The LP half of spot swap fees on the vault shares held by the protocol fee recipient. 100% for UMIA, whose treasury is the vault's only depositor.",
  [LABEL.DM_PROTOCOL]: "50% of the winning proposal's decision-market fees, recognised when collected after settlement.",
  [LABEL.DM_POL]: "The LP half of the winning proposal's decision-market fees on the vault shares held by the protocol fee recipient.",
};

const BREAKDOWN = {
  Fees: FEE_LABELS,
  UserFees: FEE_LABELS,
  Revenue: REVENUE_LABELS,
  ProtocolRevenue: REVENUE_LABELS,
  SupplySideRevenue: {
    [LABEL.SPOT_LP]: "The LP half of spot swap fees accruing to the venture's SpotLiquidityVault, less the fee recipient's share.",
    [LABEL.DM_LP]: "The LP half of the winning proposal's decision-market fees accruing to the venture's vault, less the fee recipient's share.",
  },
  Volume: {
    [LABEL.SPOT_VOLUME]: "Money-token leg of every swap on the venture's Uniswap v4 spot pool.",
  },
};

function ventureAdapter(ventureId: number, start: string): SimpleAdapter {
  return {
    version: 2,
    pullHourly: true,
    fetch: ventureFetch(ventureId),
    chains: [CHAIN.BASE],
    start,
    methodology: METHODOLOGY,
    breakdownMethodology: BREAKDOWN,
    // The spot pool is a Uniswap v4 pool, so its fees and volume also count
    // under Uniswap. The flag is adapter-wide and also covers the much smaller
    // decision-market leg.
    doublecounted: true,
  };
}

/**
 * Fees, revenue and volume for one venture launched on Umia.
 * @param ventureId the venture's id on the Umia hub
 * @param start the day before its spot pool went live: with hourly pulls the
 *   runner only serves slots from one full day after `start`
 */
export function ventureFees(ventureId: number, start: string): SimpleAdapter {
  return ventureAdapter(ventureId, start);
}

/** The same adapter for the volume dashboard; the runner keeps the keys it needs. */
export function ventureVolume(ventureId: number, start: string): SimpleAdapter {
  return ventureAdapter(ventureId, start);
}
