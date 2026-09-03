import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";
import { METRIC } from "./metrics";

// Umia protocol contracts on Base: https://github.com/umiafinance/umia
const HUB = "0x120dbCDd58Bb787309573e29159fE6D37A1983F6";
const MARKET_CORE = "0x55975E430Cc54C63dff03B1E6d27Be574Ce229F6";
// Uniswap v4 singleton on Base
const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const STATE_VIEW = "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71";
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

// Ventures 1-6 are test deployments that predate the first real launch.
const FIRST_REAL_VENTURE_ID = 7;

const BPS_DENOM = 10000;
// Uniswap v4 reports the LP fee in hundredths of a bip (1_000_000 = 100%)
const PIPS_DENOM = 1e6;

const VENTURE_BY_ID =
  "function ventureById(uint256) view returns (tuple(uint256 id, address venture, string name, uint256 createdAt))";
const VENTURE_MONEY_TOKEN_BY_ID = "function ventureMoneyTokenById(uint256) view returns (address)";
const VENTURE_VAULT = "function ventureLiquidityVault(address) view returns (address)";
const POOL_KEY =
  "function getPoolKey() view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))";
const CURRENT_LIQUIDITY = "function currentLiquidity() view returns (uint128)";
const GET_LIQUIDITY = "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)";
const ACTIVE_MARKET_BY_VENTURE = "function activeMarketByVenture(uint256) view returns (uint256)";
const PROPOSAL_TO_MARKET = "function proposalToMarket(uint256) view returns (uint256)";
const MARKET_PROPOSAL_IDS = "function marketProposalIds(uint256) view returns (uint256[])";
const PROPOSAL_FEE_STATE =
  "function proposalFeeState(uint256) view returns (uint256 ventureFee, uint256 moneyFee)";

const SPOT_SWAP_EVENT =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const SPOT_SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
const DM_SWAP_EVENT =
  "event Swap(uint256 indexed proposalId, address indexed trader, bool zeroForOne, uint256 amountIn, uint256 amountOut, uint256 priceBeforeX96, uint256 priceAfterX96, uint256 priceImpactBps, uint256 protocolFee)";
const MARKET_SETTLED_EVENT =
  "event MarketSettled(uint256 indexed marketId, uint256 winningProposalId, uint256 winningPriceX112, uint256 noOpPriceX112, uint256 priceDeltaBps)";

const LABEL = {
  SPOT_FEES: METRIC.SWAP_FEES,
  SPOT_PROTOCOL: "Spot protocol fee",
  SPOT_LP: "Spot LP fees (venture vault)",
  DM_FEES: "Decision market swap fees",
  DM_PROTOCOL: "Decision market protocol fee",
  DM_LP: "Decision market LP fees (venture vault)",
};

type SpotContext = {
  vault: string;
  poolId: string;
  moneyIsCurrency0: boolean;
};

type VentureContext = {
  moneyToken: string;
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

async function getVentureContext(options: FetchOptions, ventureId: number): Promise<VentureContext | null> {
  const { api } = options;
  const moneyToken = await api.call({ target: HUB, abi: VENTURE_MONEY_TOKEN_BY_ID, params: [ventureId] });
  // The venture does not exist yet at this block.
  if (!moneyToken || moneyToken === NULL_ADDRESS) return null;

  const info = await api.call({ target: HUB, abi: VENTURE_BY_ID, params: [ventureId] });
  const vault = await api.call({ target: HUB, abi: VENTURE_VAULT, params: [info.venture] });
  // Decision markets can trade before a spot vault is registered, so only the
  // spot half of the adapter waits for one.
  if (!vault || vault === NULL_ADDRESS) return { moneyToken, spot: null };

  const poolKey = await api.call({ target: vault, abi: POOL_KEY });
  return {
    moneyToken,
    spot: {
      vault,
      poolId: poolKeyToId(poolKey),
      // v4 orders currencies by address, so which leg is the money token varies per venture
      moneyIsCurrency0: poolKey.currency0.toLowerCase() === moneyToken.toLowerCase(),
    },
  };
}

/**
 * The vault is the pool's only permitted liquidity operator by design, so this is
 * 1 today. It drops the moment anyone LPs on the pool directly, and the protocol
 * only earns its cut on the vault's slice, so weight by it from the start.
 */
async function getVaultShare(options: FetchOptions, spot: SpotContext): Promise<number> {
  const { api } = options;
  const vaultLiquidity = Number(await api.call({ target: spot.vault, abi: CURRENT_LIQUIDITY }));
  const poolLiquidity = Number(await api.call({ target: STATE_VIEW, abi: GET_LIQUIDITY, params: [spot.poolId] }));
  if (!poolLiquidity) return 1;
  return Math.min(1, vaultLiquidity / poolLiquidity);
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
 */
async function addSpotFees(
  options: FetchOptions,
  ctx: VentureContext,
  spot: SpotContext,
  balances: { fees: any; protocol: any; supplySide: any; volume: any },
) {
  const logs = await options.getLogs({
    target: POOL_MANAGER,
    eventAbi: SPOT_SWAP_EVENT,
    // filter on the indexed pool id so this never scans the whole v4 singleton
    topics: [SPOT_SWAP_TOPIC, spot.poolId],
  });
  if (!logs.length) return;

  const protocolCutBps = Number(await options.api.call({ target: HUB, abi: "function spotProtocolFeeCutBps() view returns (uint16)" }));
  const vaultShare = await getVaultShare(options, spot);

  for (const log of logs) {
    const moneyDelta = Number(spot.moneyIsCurrency0 ? log.amount0 : log.amount1);
    const rate = Number(log.fee) / PIPS_DENOM;
    if (!rate || rate >= 1) continue;

    const fee = moneyDelta < 0 ? Math.abs(moneyDelta) * rate : (moneyDelta * rate) / (1 - rate);
    const protocolFee = (fee * protocolCutBps * vaultShare) / BPS_DENOM;

    balances.fees.add(ctx.moneyToken, fee, LABEL.SPOT_FEES);
    balances.protocol.add(ctx.moneyToken, protocolFee, LABEL.SPOT_PROTOCOL);
    balances.supplySide.add(ctx.moneyToken, fee - protocolFee, LABEL.SPOT_LP);
    balances.volume.add(ctx.moneyToken, Math.abs(moneyDelta), LABEL.SPOT_FEES);
  }
}

/**
 * Maps each venture's current market back to its venture id.
 *
 * `MarketCore` is a singleton and its market struct has no public getter, so this
 * is the view-only way to attribute a swap to a venture. A venture holds at most
 * one market at a time, so this covers every market that can be traded in the
 * window. A market that both settled and was replaced inside one window would be
 * missed; markets run 1h to 96h and windows are hourly, so that does not happen
 * in practice.
 */
async function getMarketOwners(options: FetchOptions): Promise<Map<string, number>> {
  const { api } = options;
  const ventureCount = Number(await api.call({ target: HUB, abi: "uint256:ventureCount" }));
  const ids: number[] = [];
  for (let id = FIRST_REAL_VENTURE_ID; id <= ventureCount; id++) ids.push(id);
  const owners = new Map<string, number>();
  if (!ids.length) return owners;

  const markets = await api.multiCall({ target: MARKET_CORE, abi: ACTIVE_MARKET_BY_VENTURE, calls: ids });
  markets.forEach((marketId: any, i: number) => {
    if (marketId && String(marketId) !== "0") owners.set(String(marketId), ids[i]);
  });
  return owners;
}

/**
 * Decision-market swap fees, booked in the money token.
 *
 * `amountIn` in the Swap event is the gross input and the fee is `amountIn *
 * decisionSwapFeeBps / BPS_DENOM`, verified against live markets. `zeroForOne`
 * means the venture token went in, so the fee accrued in the venture token and is
 * converted at the swap's own realised price; otherwise it is already money.
 *
 * The protocol's cut is recognised on settlement, not per swap: every proposal
 * accrues one while trading but only the winning proposal's is kept, and the
 * losing proposals' cuts return to the venture's vault with the liquidity.
 */
async function addDecisionMarketFees(
  options: FetchOptions,
  ctx: VentureContext,
  ventureId: number,
  balances: { fees: any; protocol: any; supplySide: any; volume: any },
) {
  const [swapLogs, settledLogs] = [
    await options.getLogs({ target: MARKET_CORE, eventAbi: DM_SWAP_EVENT }),
    await options.getLogs({ target: MARKET_CORE, eventAbi: MARKET_SETTLED_EVENT }),
  ];
  if (!swapLogs.length && !settledLogs.length) return;

  const { api } = options;
  const owners = await getMarketOwners(options);
  const isOurs = (marketId: any) => owners.get(String(marketId)) === ventureId;

  if (swapLogs.length) {
    const swapFeeBps = Number(await api.call({ target: HUB, abi: "function decisionSwapFeeBps() view returns (uint16)" }));
    const protocolCutBps = Number(await api.call({ target: HUB, abi: "function decisionProtocolFeeCutBps() view returns (uint16)" }));
    const rate = swapFeeBps / BPS_DENOM;

    const markets = await api.multiCall({
      target: MARKET_CORE,
      abi: PROPOSAL_TO_MARKET,
      calls: swapLogs.map((log: any) => String(log.proposalId)),
    });

    swapLogs.forEach((log: any, i: number) => {
      if (!isOurs(markets[i])) return;
      const amountIn = Number(log.amountIn);
      const amountOut = Number(log.amountOut);
      // Virtual tokens redeem 1:1 with the real token, so a money-side amount is
      // already in money-token units.
      const fee = log.zeroForOne ? (amountOut * rate) / (1 - rate) : amountIn * rate;
      const notional = log.zeroForOne ? amountOut : amountIn;

      balances.fees.add(ctx.moneyToken, fee, LABEL.DM_FEES);
      // Only the LP half is recognised while trading; the protocol half waits for settlement.
      balances.supplySide.add(ctx.moneyToken, (fee * (BPS_DENOM - protocolCutBps)) / BPS_DENOM, LABEL.DM_LP);
      balances.volume.add(ctx.moneyToken, notional, LABEL.DM_FEES);
    });
  }

  for (const log of settledLogs) {
    if (!isOurs(log.marketId)) continue;
    const proposalIds: any[] = await api.call({ target: MARKET_CORE, abi: MARKET_PROPOSAL_IDS, params: [log.marketId] });
    const feeStates = await api.multiCall({
      target: MARKET_CORE,
      abi: PROPOSAL_FEE_STATE,
      calls: proposalIds.map((proposalId: any) => String(proposalId)),
    });

    proposalIds.forEach((proposalId: any, i: number) => {
      const moneyFee = Number(feeStates[i].moneyFee);
      const won = String(proposalId) === String(log.winningProposalId);
      // The winner's accrued cut is the protocol's; every loser's returns to the vault.
      balances[won ? "protocol" : "supplySide"].add(
        ctx.moneyToken,
        moneyFee,
        won ? LABEL.DM_PROTOCOL : LABEL.DM_LP,
      );
    });
  }
}

function ventureFetch(ventureId: number, mode: "fees" | "volume") {
  return async (options: FetchOptions) => {
    const balances = {
      fees: options.createBalances(),
      protocol: options.createBalances(),
      supplySide: options.createBalances(),
      volume: options.createBalances(),
    };

    const ctx = await getVentureContext(options, ventureId);
    if (ctx) {
      if (ctx.spot) await addSpotFees(options, ctx, ctx.spot, balances);
      await addDecisionMarketFees(options, ctx, ventureId, balances);
    }

    if (mode === "volume") return { dailyVolume: balances.volume };

    return {
      dailyFees: balances.fees,
      dailyUserFees: balances.fees,
      dailyRevenue: balances.protocol,
      dailyProtocolRevenue: balances.protocol,
      dailySupplySideRevenue: balances.supplySide,
      dailyHoldersRevenue: 0,
    };
  };
}

const FEES_METHODOLOGY = {
  Fees: "Swap fees paid by traders: 1% on the venture's Uniswap v4 spot pool, and 1% on conditional trades in the venture's decision markets. Both are read from swap events and booked in the venture's money token at the swap's own realised price.",
  UserFees: "Identical to Fees. Traders pay the swap fee; there is no other charge, and Umia takes no fee on a launch.",
  Revenue: "Umia's cut: 50% of spot swap fees, weighted by the venture vault's share of pool liquidity, plus 50% of decision-market fees on the winning proposal, recognised when the market settles.",
  ProtocolRevenue: "Identical to Revenue. All of it accrues to the protocol fee recipient.",
  SupplySideRevenue: "The venture's cut, which accrues to its SpotLiquidityVault: the LP half of spot swap fees, the LP half of decision-market fees, and the protocol half accrued by losing proposals, which returns to the vault with the liquidity when the market settles.",
  HoldersRevenue: "None. No buyback, burn or staker distribution exists on-chain.",
};

const FEES_BREAKDOWN = {
  Fees: {
    [LABEL.SPOT_FEES]: "1% swap fee on the venture's Uniswap v4 spot pool, taken on the gross input of each swap and measured on the money-token leg.",
    [LABEL.DM_FEES]: "1% swap fee on conditional trades in the venture's decision markets, taken on the gross input of each swap.",
  },
  Revenue: {
    [LABEL.SPOT_PROTOCOL]: "50% of spot swap fees, weighted by the venture vault's share of pool liquidity.",
    [LABEL.DM_PROTOCOL]: "50% of the winning proposal's decision-market fees, recognised on the day the market settles.",
  },
  ProtocolRevenue: {
    [LABEL.SPOT_PROTOCOL]: "50% of spot swap fees, weighted by the venture vault's share of pool liquidity.",
    [LABEL.DM_PROTOCOL]: "50% of the winning proposal's decision-market fees, recognised on the day the market settles.",
  },
  SupplySideRevenue: {
    [LABEL.SPOT_LP]: "The LP half of spot swap fees, which accrues to the venture's SpotLiquidityVault.",
    [LABEL.DM_LP]: "The LP half of decision-market fees, plus the protocol half accrued by losing proposals, both of which return to the venture's vault.",
  },
};

const VOLUME_METHODOLOGY = {
  Volume: "Money-token notional of every swap on the venture's Uniswap v4 spot pool, plus the notional of conditional trades in its decision markets. Spot pool ids come from the venture vault's own pool key, so only pools operated by Umia count.",
};

export function ventureFees(ventureId: number, start: string): SimpleAdapter {
  return {
    version: 2,
    pullHourly: true,
    fetch: ventureFetch(ventureId, "fees"),
    chains: [CHAIN.BASE],
    start,
    methodology: FEES_METHODOLOGY,
    breakdownMethodology: FEES_BREAKDOWN,
    // spot leg trades on a Uniswap v4 pool, so those fees also count under Uniswap
    doublecounted: true,
  };
}

export function ventureVolume(ventureId: number, start: string): SimpleAdapter {
  return {
    version: 2,
    pullHourly: true,
    fetch: ventureFetch(ventureId, "volume"),
    chains: [CHAIN.BASE],
    start,
    methodology: VOLUME_METHODOLOGY,
    // spot leg trades on a Uniswap v4 pool, so that volume also counts under Uniswap
    doublecounted: true,
  };
}
