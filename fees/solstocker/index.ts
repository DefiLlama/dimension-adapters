// SolStocker — fees & revenue adapter (Robinhood Chain).
//
// SolStocker (https://solstocker.fun) is an RWA launchpad. On Robinhood Chain
// (chainId 4663) every launched coin trades in a Uniswap v4 pool whose quote
// asset is a tokenized equity (SPCX, NVDA, ...) and whose LP fee is pinned to
// ZERO. The entire trading fee is taken by one singleton hook instead:
//   SolStockerFeeHook 0xa9F8Da2F2578cA79245FC7f5a96F3A914835E0cC
//
// Because the pool's LP fee is 0 (the hook rejects any pool with a non-zero
// LP fee at registration), nothing counted here is also counted by the
// Uniswap v4 adapter — this is not double counted.
//
// Fee source (the only fee this hook charges — no launch fee, no graduation
// fee): TOTAL_SWAP_FEE_BPS = 150, i.e. 1.5% of the quote-asset leg of every
// swap, split into five named slices that are compile-time constants of the
// hook and are emitted per swap on FeeCharged:
//
//   holderFee   75 bps  holders of the LAUNCHED coin, via the pool's reward vault
//   creatorFee  15 bps  the coin's creator
//   rewardsFee  15 bps  pro-rata rebate pool paid back to traders
//   stockerFee  15 bps  owed to holders of STOCKER, SolStocker's own token
//   platformFee 30 bps  SolStocker platform revenue
//
// Mapping to DefiLlama's taxonomy:
//
//   dailyFees              = all five slices (the full 1.5%)
//   dailySupplySideRevenue = holderFee + creatorFee + rewardsFee (105 bps)
//                            — value routed to third parties: holders of each
//                            launched coin, that coin's creator, and traders.
//                            Not SolStocker's own token holders, so not
//                            holders revenue. Same treatment pumpdotfun gives
//                            its creator and cashback slices.
//   dailyHoldersRevenue    = stockerFee (15 bps) — the only slice that accrues
//                            to holders of the PROTOCOL'S OWN token (STOCKER,
//                            CHZSuhKGewov1FFB3jNNvmcE7PJ4ugwuoS3uxxCik52U on
//                            Solana). It accrues to its own recipient address
//                            (0xDee7D4011242F62dfe83C896f4aEC513eEA8C1c7),
//                            separate from platform revenue, and is settled to
//                            STOCKER holders on Solana.
//   dailyProtocolRevenue   = platformFee (30 bps)
//   dailyRevenue           = dailyProtocolRevenue + dailyHoldersRevenue (45 bps)
//
// Denomination: fees are charged in the pool's QUOTE ASSET, a tokenized
// equity, not in the gas token. FeeCharged carries only the poolId, so the
// quote asset is resolved from the hook's PoolRegistered events (scanned once
// from the hook's first block and cached) and each slice is added against that
// ERC-20 address, which DefiLlama prices directly (e.g.
// robinhood:0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa -> SPCX).
//
// SOLANA IS DEFERRED, deliberately. SolStocker also operates on Solana, but
// neither Solana fee stream can be attributed cleanly from public data:
//   1. The on-chain creator-fee split (90% to the launched coin's holders,
//      10% to STOCKER buy-and-burn) is a share of PUMP.FUN's 0.30% creator
//      fee, which the pumpdotfun adapter already reports as its own fees and
//      supply-side revenue. Reporting it again here would double count the
//      same lamports.
//   2. The 1% on-site swap fee is taken through Jupiter's native platform-fee
//      mechanism, which lands in the OUTPUT mint — a per-coin Token-2022
//      account on buys, a wrapped-SOL account on sells. There is no fixed
//      target set to sum, and the accounts are later swept between wallets
//      SolStocker itself controls, so a wallet-inflow query would over-report.
// Solana will be added when those flows are attributable without inflating
// the numbers. Reporting nothing beats reporting wrong.
//
// -----------------------------------------------------------------------------------------------------
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const FEE_HOOK = "0xa9F8Da2F2578cA79245FC7f5a96F3A914835E0cC";

// First block at which the hook emitted anything. No pool can be registered
// before it, so the registry scan below is complete from here.
const FEE_HOOK_FIRST_BLOCK = 51894479;

const POOL_REGISTERED =
  "event PoolRegistered(bytes32 indexed poolId, address indexed launchedToken, address indexed quoteAsset, address registrar)";
const FEE_CHARGED =
  "event FeeCharged(bytes32 indexed poolId, uint256 holderFee, uint256 creatorFee, uint256 rewardsFee, uint256 stockerFee, uint256 platformFee)";

const LABEL = {
  CoinHolders: "Swap Fees to Coin Holders",
  TraderRewards: "Swap Fees to Trader Rewards",
  StockerHolders: "Swap Fees to STOCKER Holders",
  Protocol: "Swap Fees to Protocol",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [registrationLogs, feeLogs] = await Promise.all([
    options.getLogs({
      target: FEE_HOOK,
      eventAbi: POOL_REGISTERED,
      fromBlock: FEE_HOOK_FIRST_BLOCK,
      cacheInCloud: true,
    }),
    options.getLogs({ target: FEE_HOOK, eventAbi: FEE_CHARGED }),
  ]);

  // poolId -> quote asset. The hook reverts on a swap against an unregistered
  // pool, so every FeeCharged has a PoolRegistered somewhere at or before it.
  const quoteAssetByPool: Record<string, string> = {};
  for (const log of registrationLogs) {
    quoteAssetByPool[String(log.poolId).toLowerCase()] = log.quoteAsset;
  }

  for (const log of feeLogs) {
    const quoteAsset = quoteAssetByPool[String(log.poolId).toLowerCase()];
    if (!quoteAsset) continue;

    const holderFee = BigInt(log.holderFee);
    const creatorFee = BigInt(log.creatorFee);
    const rewardsFee = BigInt(log.rewardsFee);
    const stockerFee = BigInt(log.stockerFee);
    const platformFee = BigInt(log.platformFee);

    dailyFees.add(
      quoteAsset,
      holderFee + creatorFee + rewardsFee + stockerFee + platformFee,
      METRIC.SWAP_FEES,
    );

    dailySupplySideRevenue.add(quoteAsset, holderFee, LABEL.CoinHolders);
    dailySupplySideRevenue.add(quoteAsset, creatorFee, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.add(quoteAsset, rewardsFee, LABEL.TraderRewards);

    dailyHoldersRevenue.add(quoteAsset, stockerFee, LABEL.StockerHolders);
    dailyProtocolRevenue.add(quoteAsset, platformFee, LABEL.Protocol);

    dailyRevenue.add(quoteAsset, platformFee, LABEL.Protocol);
    dailyRevenue.add(quoteAsset, stockerFee, LABEL.StockerHolders);
  }

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
  UserFees:
    "Traders pay a 1.5% fee on the quote-asset leg of every swap in a SolStocker pool. The pool's own LP fee is zero — the SolStockerFeeHook takes the whole fee.",
  Fees: "The 1.5% swap fee charged by SolStockerFeeHook on every swap in a SolStocker-launched Uniswap v4 pool, read per swap from the five slices of the FeeCharged event and denominated in the pool's quote asset (a tokenized equity such as SPCX or NVDA). There is no launch fee and no graduation fee.",
  Revenue:
    "The 0.30% platform slice plus the 0.15% slice owed to STOCKER holders — 0.45% of the trade, 30% of the fee.",
  ProtocolRevenue: "The 0.30% platform slice of the swap fee — 20% of the fee.",
  HoldersRevenue:
    "The 0.15% slice accruing to holders of STOCKER, SolStocker's own token — 10% of the fee. It accrues to a dedicated recipient separate from platform revenue and is settled to STOCKER holders on Solana.",
  SupplySideRevenue:
    "The 1.05% routed to third parties — 0.75% to holders of the launched coin, 0.15% to that coin's creator and 0.15% to the trader rebate pool.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "1.5% fee on the quote-asset leg of every swap in a SolStocker pool (holderFee + creatorFee + rewardsFee + stockerFee + platformFee from the FeeCharged event).",
  },
  Revenue: {
    [LABEL.Protocol]: "0.30% platform slice of the swap fee.",
    [LABEL.StockerHolders]: "0.15% slice of the swap fee owed to STOCKER holders.",
  },
  ProtocolRevenue: {
    [LABEL.Protocol]: "0.30% platform slice of the swap fee, paid to SolStocker.",
  },
  HoldersRevenue: {
    [LABEL.StockerHolders]:
      "0.15% slice of the swap fee owed to holders of STOCKER, SolStocker's own token.",
  },
  SupplySideRevenue: {
    [LABEL.CoinHolders]:
      "0.75% slice of the swap fee paid to holders of the launched coin through the pool's reward vault.",
    [METRIC.CREATOR_FEES]: "0.15% slice of the swap fee paid to the launched coin's creator.",
    [LABEL.TraderRewards]:
      "0.15% slice of the swap fee paid back to traders as a pro-rata rebate.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  methodology,
  breakdownMethodology,
  start: "2026-09-01", // first pool registered against the hook (block 51894479)
};

export default adapter;
