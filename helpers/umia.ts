import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";
import { METRIC } from "./metrics";

// Umia protocol contracts on Base: https://github.com/umiafinance/protocol
const HUB = "0x120dbCDd58Bb787309573e29159fE6D37A1983F6";
const MARKET_CORE = "0x55975E430Cc54C63dff03B1E6d27Be574Ce229F6";
// Uniswap v4 singleton on Base
const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const STATE_VIEW = "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71";
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

// Ventures 1-6 are test deployments that predate the first real launch.
const FIRST_REAL_VENTURE_ID = 7;

const BPS_DENOM = 10000;
// Umia's first Base deployment; MarketCore has emitted every market since.
// contracts.json -> mainnet.base.startBlock
const MARKET_CORE_FROM_BLOCK = 50401538;
// Uniswap v4 reports the LP fee in hundredths of a bip (1_000_000 = 100%)
const PIPS_DENOM = 1e6;

const VENTURE_BY_ID =
  "function ventureById(uint256) view returns (tuple(uint256 id, address venture, string name, uint256 createdAt))";
const VENTURE_TOKEN_BY_ID = "function ventureTokenById(uint256) view returns (address)";
const VENTURE_MONEY_TOKEN_BY_ID = "function ventureMoneyTokenById(uint256) view returns (address)";
const VENTURE_VAULT = "function ventureLiquidityVault(address) view returns (address)";
const POOL_KEY =
  "function getPoolKey() view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))";
const CURRENT_LIQUIDITY = "function currentLiquidity() view returns (uint128)";
const GET_LIQUIDITY = "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)";
const PROPOSAL_TO_MARKET = "function proposalToMarket(uint256) view returns (uint256)";
const MARKET_PROPOSAL_IDS = "function marketProposalIds(uint256) view returns (uint256[])";
const PROPOSAL_FEE_STATE =
  "function proposalFeeState(uint256) view returns (uint256 ventureFee, uint256 moneyFee)";
const PROTOCOL_FEE_RECIPIENT = "function protocolFeeRecipient() view returns (address)";
const SHARE_BALANCE = "function shareBalance(address) view returns (uint256)";
const TOTAL_SHARES = "function totalShares() view returns (uint256)";

const SPOT_SWAP_EVENT =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const SPOT_SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
const DM_SWAP_EVENT =
  "event Swap(uint256 indexed proposalId, address indexed trader, bool zeroForOne, uint256 amountIn, uint256 amountOut, uint256 priceBeforeX96, uint256 priceAfterX96, uint256 priceImpactBps, uint256 protocolFee)";
const MARKET_CREATED_EVENT =
  "event MarketCreated(uint256 indexed marketId, uint256 indexed ventureId, string title, uint256 createdAt, uint256 tradingStart, uint256 tradingEnd, uint256[] proposalIds)";
const MARKET_SETTLED_EVENT =
  "event MarketSettled(uint256 indexed marketId, uint256 winningProposalId, uint256 winningPriceX112, uint256 noOpPriceX112, uint256 priceDeltaBps)";
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
  DM_VOLUME: "Decision market swap volume",
};

type SpotContext = {
  vault: string;
  poolId: string;
  moneyIsCurrency0: boolean;
};

type VentureContext = {
  moneyToken: string;
  ventureToken: string;
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

  const [ventureToken, info] = await Promise.all([
    api.call({ target: HUB, abi: VENTURE_TOKEN_BY_ID, params: [ventureId] }),
    api.call({ target: HUB, abi: VENTURE_BY_ID, params: [ventureId] }),
  ]);
  const vault = await api.call({ target: HUB, abi: VENTURE_VAULT, params: [info.venture] });
  // Decision markets can trade before a spot vault is registered, so only the
  // spot half of the adapter waits for one.
  if (!vault || vault === NULL_ADDRESS) return { moneyToken, ventureToken, spot: null };

  const poolKey = await api.call({ target: vault, abi: POOL_KEY });
  return {
    moneyToken,
    ventureToken,
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
 * The share of the vault owned by the protocol fee recipient. What the vault earns
 * as an LP accrues to its share holders, so that part of the LP half is protocol
 * revenue too. It is 1 for UMIA, whose treasury is both the fee recipient and the
 * vault's only depositor, and 0 for a venture whose vault the protocol holds no
 * shares of, where the LP half is that venture's own income.
 */
async function getRecipientShare(options: FetchOptions, spot: SpotContext | null): Promise<number> {
  if (!spot) return 0;
  const { api } = options;
  const recipient = await api.call({ target: HUB, abi: PROTOCOL_FEE_RECIPIENT });
  if (!recipient || recipient === NULL_ADDRESS) return 0;
  const [held, total] = await Promise.all([
    api.call({ target: spot.vault, abi: SHARE_BALANCE, params: [recipient] }),
    api.call({ target: spot.vault, abi: TOTAL_SHARES }),
  ]);
  if (!Number(total)) return 0;
  return Math.min(1, Number(held) / Number(total));
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
  volumeOnly: boolean,
  recipientShare: number,
) {
  const logs = await options.getLogs({
    target: POOL_MANAGER,
    eventAbi: SPOT_SWAP_EVENT,
    // filter on the indexed pool id so this never scans the whole v4 singleton
    topics: [SPOT_SWAP_TOPIC, spot.poolId],
  });
  if (!logs.length) return;

  if (volumeOnly) {
    for (const log of logs) {
      const moneyDelta = Number(spot.moneyIsCurrency0 ? log.amount0 : log.amount1);
      balances.volume.add(ctx.moneyToken, Math.abs(moneyDelta), LABEL.SPOT_VOLUME);
    }
    return;
  }

  const protocolCutBps = Number(await options.api.call({ target: HUB, abi: "function spotProtocolFeeCutBps() view returns (uint16)" }));
  const vaultShare = await getVaultShare(options, spot);
  const cut = protocolCutBps / BPS_DENOM;

  for (const log of logs) {
    const moneyDelta = Number(spot.moneyIsCurrency0 ? log.amount0 : log.amount1);
    // volume is recorded first: a pool configured with a zero fee still trades
    balances.volume.add(ctx.moneyToken, Math.abs(moneyDelta), LABEL.SPOT_VOLUME);

    const rate = Number(log.fee) / PIPS_DENOM;
    if (!rate || rate >= 1) continue;

    const fee = moneyDelta < 0 ? Math.abs(moneyDelta) * rate : (moneyDelta * rate) / (1 - rate);
    // Fees accrue to LPs pro rata; the protocol cut is skimmed off the vault's slice
    // only, and the rest of that slice belongs to the vault's share holders.
    const vaultFee = fee * vaultShare;
    const protocolCut = vaultFee * cut;
    const polFee = (vaultFee - protocolCut) * recipientShare;

    balances.fees.add(ctx.moneyToken, fee, LABEL.SPOT_FEES);
    balances.protocol.add(ctx.moneyToken, protocolCut, LABEL.SPOT_PROTOCOL);
    if (polFee) balances.protocol.add(ctx.moneyToken, polFee, LABEL.SPOT_POL);
    balances.supplySide.add(ctx.moneyToken, fee - protocolCut - polFee, LABEL.SPOT_LP);
  }
}

/**
 * Maps every market ever created back to its venture.
 *
 * `MarketCore` is a singleton whose market struct has no public getter, and
 * `activeMarketByVenture` holds only a venture's newest market. Creating a market
 * is gated on the previous one having settled, so a settle-then-create inside a
 * single window would drop the settled market's last swaps and its whole
 * settlement recognition. Creation events give the complete map instead, and the
 * contract has emitted a handful of them, so the scan is cheap and cached.
 */
async function getMarketOwners(options: FetchOptions): Promise<Map<string, number>> {
  const logs = await options.getLogs({
    target: MARKET_CORE,
    eventAbi: MARKET_CREATED_EVENT,
    fromBlock: MARKET_CORE_FROM_BLOCK,
    toBlock: await options.getToBlock(),
    cacheInCloud: true,
  });
  const owners = new Map<string, number>();
  for (const log of logs) {
    const ventureId = Number(log.ventureId);
    if (ventureId >= FIRST_REAL_VENTURE_ID) owners.set(String(log.marketId), ventureId);
  }
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
  volumeOnly: boolean,
  recipientShare: number,
) {
  const swapLogs = await options.getLogs({ target: MARKET_CORE, eventAbi: DM_SWAP_EVENT });
  const settledLogs = volumeOnly
    ? []
    : await options.getLogs({ target: MARKET_CORE, eventAbi: MARKET_SETTLED_EVENT, entireLog: true });
  if (!swapLogs.length && !settledLogs.length) return;

  const { api } = options;
  const owners = await getMarketOwners(options);
  const isOurs = (marketId: any) => owners.get(String(marketId)) === ventureId;

  if (swapLogs.length) {
    // many swaps share a proposal, so resolve each proposal once
    const proposals = [...new Set<string>(swapLogs.map((log: any) => String(log.proposalId)))];
    const resolved = await api.multiCall({ target: MARKET_CORE, abi: PROPOSAL_TO_MARKET, calls: proposals });
    const marketOf = new Map<string, string>();
    proposals.forEach((proposalId, i) => marketOf.set(proposalId, String(resolved[i])));
    const markets = swapLogs.map((log: any) => marketOf.get(String(log.proposalId)));

    // Virtual tokens redeem 1:1 with the real token, so a money-side amount is
    // already in money-token units.
    const notionalOf = (log: any) => Number(log.zeroForOne ? log.amountOut : log.amountIn);

    if (volumeOnly) {
      swapLogs.forEach((log: any, i: number) => {
        if (isOurs(markets[i])) balances.volume.add(ctx.moneyToken, notionalOf(log), LABEL.DM_VOLUME);
      });
    } else {
      const swapFeeBps = Number(await api.call({ target: HUB, abi: "function decisionSwapFeeBps() view returns (uint16)" }));
      const protocolCutBps = Number(await api.call({ target: HUB, abi: "function decisionProtocolFeeCutBps() view returns (uint16)" }));
      const rate = swapFeeBps / BPS_DENOM;

      swapLogs.forEach((log: any, i: number) => {
        if (!isOurs(markets[i])) return;
        const notional = notionalOf(log);
        balances.volume.add(ctx.moneyToken, notional, LABEL.DM_VOLUME);
        if (!rate || rate >= 1) return;

        const fee = log.zeroForOne ? (notional * rate) / (1 - rate) : notional * rate;
        balances.fees.add(ctx.moneyToken, fee, LABEL.DM_FEES);
        // Only the LP half is recognised while trading; the protocol half waits for settlement.
        const lpFee = (fee * (BPS_DENOM - protocolCutBps)) / BPS_DENOM;
        const polFee = lpFee * recipientShare;
        if (polFee) balances.protocol.add(ctx.moneyToken, polFee, LABEL.DM_POL);
        balances.supplySide.add(ctx.moneyToken, lpFee - polFee, LABEL.DM_LP);
      });
    }
  }

  if (!settledLogs.length) return;

  // `collectProtocolFees` is permissionless and zeroes the winning proposal's
  // accrued fee, so reading at the window's end block returns 0 whenever a
  // keeper collects in the same hour it settled, losing the whole protocol cut
  // for that market. Read each market's fee state at its own settlement block,
  // and fall back to the collection event for a settle-and-collect in one block.
  const collectedLogs = await options.getLogs({
    target: MARKET_CORE,
    eventAbi: PROTOCOL_FEES_COLLECTED_EVENT,
  });
  const collectedByMarket = new Map<string, { money: number; venture: number }>();
  for (const log of collectedLogs)
    collectedByMarket.set(String(log.marketId), { money: Number(log.feeMoney), venture: Number(log.feeVenture) });

  for (const log of settledLogs) {
    const { marketId, winningProposalId } = log.args ?? log;
    if (!isOurs(marketId)) continue;

    const atSettlement = new sdk.ChainApi({ chain: options.chain, block: Number(log.blockNumber) });
    const proposalIds: any[] = await atSettlement.call({ target: MARKET_CORE, abi: MARKET_PROPOSAL_IDS, params: [marketId] });
    const feeStates = await atSettlement.multiCall({
      target: MARKET_CORE,
      abi: PROPOSAL_FEE_STATE,
      calls: proposalIds.map((proposalId: any) => String(proposalId)),
    });

    proposalIds.forEach((proposalId: any, i: number) => {
      const won = String(proposalId) === String(winningProposalId);
      let moneyFee = Number(feeStates[i].moneyFee);
      let ventureFee = Number(feeStates[i].ventureFee);
      if (won && !moneyFee && !ventureFee) {
        const collected = collectedByMarket.get(String(marketId));
        if (collected) ({ money: moneyFee, venture: ventureFee } = collected);
      }
      // The winner's accrued cut is the protocol's; every loser's returns to the
      // vault, where the fee recipient's share of it is protocol revenue too.
      const book = (token: string, amount: number) => {
        if (!amount) return;
        if (won) return balances.protocol.add(token, amount, LABEL.DM_PROTOCOL);
        const pol = amount * recipientShare;
        if (pol) balances.protocol.add(token, pol, LABEL.DM_POL);
        balances.supplySide.add(token, amount - pol, LABEL.DM_LP);
      };
      book(ctx.moneyToken, moneyFee);
      // The cut accrues in whichever token was swapped in, so a venture-token
      // sell leaves real income on the venture side too.
      book(ctx.ventureToken, ventureFee);
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
      const volumeOnly = mode === "volume";
      const recipientShare = volumeOnly ? 0 : await getRecipientShare(options, ctx.spot);
      if (ctx.spot) await addSpotFees(options, ctx, ctx.spot, balances, volumeOnly, recipientShare);
      await addDecisionMarketFees(options, ctx, ventureId, balances, volumeOnly, recipientShare);
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
  Revenue: "What accrues to the protocol fee recipient: 50% of spot swap fees, weighted by the venture vault's share of pool liquidity, plus 50% of decision-market fees on the winning proposal, recognised when the market settles. The other half accrues to the vault's share holders, and the fee recipient's share of it is counted here too: 100% for UMIA, whose treasury is the vault's only depositor, and 0% for a venture whose vault the protocol holds no shares of.",
  ProtocolRevenue: "Identical to Revenue. All of it accrues to the protocol fee recipient, directly as the protocol cut or through the vault shares it holds.",
  SupplySideRevenue: "What accrues to the venture's SpotLiquidityVault for share holders other than the protocol fee recipient: the LP half of spot swap fees, the LP half of decision-market fees, and the protocol half accrued by losing proposals, which returns to the vault with the liquidity when the market settles. Zero for UMIA while its treasury is the vault's only depositor.",
  HoldersRevenue: "None. No buyback, burn or staker distribution exists on-chain.",
};

const FEE_LABELS = {
    [LABEL.SPOT_FEES]: "1% swap fee on the venture's Uniswap v4 spot pool, taken on the gross input of each swap and measured on the money-token leg.",
    [LABEL.DM_FEES]: "1% swap fee on conditional trades in the venture's decision markets, taken on the gross input of each swap.",
};

const REVENUE_LABELS = {
  [LABEL.SPOT_PROTOCOL]: "50% of spot swap fees, weighted by the venture vault's share of pool liquidity.",
  [LABEL.SPOT_POL]: "The LP half of spot swap fees on the vault shares held by the protocol fee recipient. 100% for UMIA, whose treasury is the vault's only depositor.",
  [LABEL.DM_PROTOCOL]: "50% of the winning proposal's decision-market fees, recognised on the day the market settles.",
  [LABEL.DM_POL]: "The LP half of decision-market fees, plus losing proposals' protocol cuts returned to the vault, on the vault shares held by the protocol fee recipient.",
};

const FEES_BREAKDOWN = {
  Fees: FEE_LABELS,
  UserFees: FEE_LABELS,
  Revenue: REVENUE_LABELS,
  ProtocolRevenue: REVENUE_LABELS,
  SupplySideRevenue: {
    [LABEL.SPOT_LP]: "The LP half of spot swap fees accruing to the venture's SpotLiquidityVault, less the fee recipient's share.",
    [LABEL.DM_LP]: "The LP half of decision-market fees, plus the protocol half accrued by losing proposals, both of which return to the venture's vault, less the fee recipient's share.",
  },
};

const VOLUME_METHODOLOGY = {
  Volume: "Money-token notional of every swap on the venture's Uniswap v4 spot pool, plus the notional of conditional trades in its decision markets. Spot pool ids come from the venture vault's own pool key, so only pools operated by Umia count.",
};

const VOLUME_BREAKDOWN = {
  Volume: {
    [LABEL.SPOT_VOLUME]: "Money-token leg of every swap on the venture's Uniswap v4 spot pool.",
    [LABEL.DM_VOLUME]: "Money-token notional of conditional trades in the venture's decision markets.",
  },
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
    breakdownMethodology: VOLUME_BREAKDOWN,
    // spot leg trades on a Uniswap v4 pool, so that volume also counts under Uniswap
    doublecounted: true,
  };
}
