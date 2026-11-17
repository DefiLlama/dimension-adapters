import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { LONG_HOLD_FEE_EVENT, LONG_HOLD_START, PARCHMENT_START, PARCHMENT_USDC, closeFeesCollected, getParchmentEvents, getParchmentMarketFilter, getParchmentTxEvents, isParchmentExchange, matchLongHoldFees, matchQueuedFees } from "../../helpers/parchment";

// Fee schedule (https://docs.parchment.trade/trading/fees and /house-pool). Rates change over time and are per
// market or per position, so every amount is read from events rather than assumed:
// - open fee: market taker fee on notional (0 since launch)
// - close fee: a small charge on the notional of every close (rate stamped on the position at open)
// - win fee: a share of adjusted profit on a winning close (rate stamped on the position at open)
// - long-hold fee: an add-on to the win fee once a position is held past a free period (since 2026-11-15), in place of
//   a funding or borrow fee. Settled with the win fee but reported in its own event (`ChargeLongHoldFeeEventV1`)
// - loss fee: a share of the margin a trader loses (closes and liquidations), a protocol cut routed like the fees
//   above; not pool P&L
// - execution fee: flat fee per filled order, paid to the order keeper (config `exec_fee_recipient`) to
//   reimburse the gas of filling it, so it is supply side, not revenue
// - builder fee: optional on-top fee on profit for orders routed through a builder code
// Retained fees (everything above except execution and builder fees, net of referral shares) are split on chain
// between the house pool, stakers and the treasury, see `FeesRoutedEventV1`. The house pool is Parchment's own
// trading capital (it has no deposit shares), so its share is protocol revenue.
// The house pool's trading P&L (including the size cost, which only lowers what a win pays), the profit haircut and
// surplus sweeps out of pool cash are not fees.

const LABELS = {
  OPEN: "Open Fees",
  CLOSE: "Close Fees",
  WIN: "Win Fees",
  LONG_HOLD: "Long-Hold Fees",
  QUEUED: "Queued Win Fees",
  LOSS: "Loss Fees",
  EXEC: "Execution Fees",
  BUILDER: "Builder Fees",
  LIQ: "Liquidation Bounties",
  TO_STAKERS: "Trading Fees To Stakers",
  TO_TREASURY: "Trading Fees To Treasury",
  TO_POOL: "Trading Fees To House Pool",
  EXEC_TO_KEEPER: "Execution Fees To Keeper",
  REFERRAL: "Referral Fees To Referrers",
  BUILDER_TO_BUILDERS: "Builder Fees To Builders",
  LIQ_TO_LIQUIDATORS: "Liquidation Bounties To Liquidators",
};

// `parchment_trade::order` constants `KIND_OPEN` and `OUTCOME_FILLED` (order kind / finalized outcome of a filled open).
const KIND_OPEN = 0;
const OUTCOME_FILLED = 0;
// A two-step open is filled at most 10 s after its request (`fill_deadline_ms`); 60 s of lookback finds the
// request of every open filled in the window.
const REQUEST_LOOKBACK_SECONDS = 60;

const fetch = async (options: FetchOptions) => {
  const { startTimestamp: start, endTimestamp: end } = options;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const add = (balances: any, amount: any, label: string) => {
    if (BigInt(amount) > 0n) balances.add(PARCHMENT_USDC, String(amount), label);
  };

  const [isParchmentMarket, closeFees, enqueued, longHoldCharges, builderPaid, liquidations, harvestFees, opens, finalized, requests, routed, referralPayouts] = await Promise.all([
    getParchmentMarketFilter(end),
    // With transaction digests and event indexes, to match each queued payout to its own close.
    getParchmentTxEvents("CloseFeesEventV2", start, end),
    getParchmentTxEvents("EnqueuePayoutEventV2", start, end),
    end > LONG_HOLD_START ? getParchmentTxEvents(LONG_HOLD_FEE_EVENT, start, end) : [],
    getParchmentEvents("BuilderOnTopAccruedEventV1", start, end),
    getParchmentEvents("LiquidationDetailEventV1", start, end),
    getParchmentEvents("HarvestFeesEventV2", start, end),
    getParchmentEvents("OpenPositionEventV1", start, end),
    getParchmentEvents("OrderFinalizedEventV1", start, end),
    getParchmentEvents("OrderRequestedEventV1", start - REQUEST_LOOKBACK_SECONDS, end),
    getParchmentEvents("FeesRoutedEventV1", start, end),
    // Carries neither `exchange_id` nor `market_id`; only paid out of the Exchange's fees.
    getParchmentEvents("ReferralPayoutEventV1", start, end),
  ]);
  // Events with `exchange_id` are kept for the Parchment Exchange, events with only `market_id` for its markets.
  const byExchange = (events: any[]) => events.filter(isParchmentExchange);
  const byMarket = (events: any[]) => events.filter(isParchmentMarket);

  // Close, win and loss fees, recognized when collected, which is also when they are split and routed. A winning
  // close paid out at once collects all of them at the close. A winning close whose profit is queued (payout queue
  // non-empty or pool cash short) collects at the close only the part of the close fee its margin covers; the win
  // fee and the part of the close fee taken out of profit (`EnqueuePayoutEventV2.fee`) are collected, split and
  // routed when the claim is harvested (`HarvestFeesEventV2.fee`), possibly in parts and in later periods.
  // Referee discounts are credited straight back to the trader, so fees are counted net of them (see
  // `closeFeesCollected`; `HarvestFeesEventV2.fee` includes the discount on a queued fee).
  const closes = closeFees.filter(({ event }) => isParchmentExchange(event));
  const queuedFees = matchQueuedFees(closes, enqueued.filter(({ event }) => isParchmentExchange(event)));
  const longHoldFees = matchLongHoldFees(closes, longHoldCharges);
  closes.forEach(({ event }, i) => {
    const collected = closeFeesCollected(event, queuedFees[i], longHoldFees[i]);
    add(dailyFees, collected.close, LABELS.CLOSE);
    add(dailyFees, collected.win, LABELS.WIN);
    add(dailyFees, collected.longHold, LABELS.LONG_HOLD);
    add(dailyFees, collected.loss, LABELS.LOSS);
  });
  for (const e of byExchange(harvestFees)) add(dailyFees, BigInt(e.fee) - BigInt(e.referral_discount), LABELS.QUEUED);

  // Liquidations: loss fee on the forfeited margin, and the liquidator's bounty.
  for (const e of byMarket(liquidations)) {
    add(dailyFees, e.loss_fee, LABELS.LOSS);
    add(dailyFees, e.bounty, LABELS.LIQ);
    add(dailySupplySideRevenue, e.bounty, LABELS.LIQ_TO_LIQUIDATORS);
  }

  // Open fee charged = gross margin escrowed by the request - margin locked on the position.
  const requestMargin = new Map<string, bigint>();
  for (const r of byMarket(requests)) if (Number(r.kind) === KIND_OPEN) requestMargin.set(r.order_id, BigInt(r.margin));
  const openMargin = new Map<string, bigint>();
  for (const o of byMarket(opens)) openMargin.set(String(o.position_id), BigInt(o.margin));
  for (const f of byMarket(finalized)) {
    // Execution fee actually paid (0 when it was refunded on a cancel / expiry / halted fill).
    add(dailyFees, f.exec_fee, LABELS.EXEC);
    add(dailySupplySideRevenue, f.exec_fee, LABELS.EXEC_TO_KEEPER);
    if (Number(f.kind) !== KIND_OPEN || Number(f.outcome) !== OUTCOME_FILLED) continue;
    const gross = requestMargin.get(f.order_id);
    const locked = openMargin.get(String(f.position_id));
    if (gross === undefined || locked === undefined) throw new Error(`Parchment: open ${f.order_id} without its request or position event`);
    add(dailyFees, gross - locked, LABELS.OPEN);
  }

  // Builder on-top fees, counted when credited to the builder (at the close, or at harvest for a queued win).
  // An on-top that is refunded to the trader instead (builder revoked while queued) is never credited.
  for (const e of byExchange(builderPaid)) {
    add(dailyFees, e.amount, LABELS.BUILDER);
    add(dailySupplySideRevenue, e.amount, LABELS.BUILDER_TO_BUILDERS);
  }

  // Trading-referral shares paid out of fees (direct and second level).
  for (const e of referralPayouts) add(dailySupplySideRevenue, e.amount, LABELS.REFERRAL);

  // What the protocol keeps, split on chain between the house pool, stakers and the treasury.
  for (const e of byExchange(routed)) {
    add(dailyProtocolRevenue, e.to_pool, LABELS.TO_POOL);
    add(dailyRevenue, e.to_pool, LABELS.TO_POOL);
    add(dailyHoldersRevenue, e.to_stakers, LABELS.TO_STAKERS);
    add(dailyRevenue, e.to_stakers, LABELS.TO_STAKERS);
    add(dailyProtocolRevenue, e.to_treasury, LABELS.TO_TREASURY);
    add(dailyRevenue, e.to_treasury, LABELS.TO_TREASURY);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Fees paid by Parchment traders: open fees (0 since launch), close fees on notional, win fees on profit, long-hold fees added to the win fee on positions held past a free period (since 2026-11-15), loss fees on margin lost, liquidation bounties, the flat execution fee per filled order and optional builder fees, net of the discount referred traders get back on close and win fees. The house pool's own trading profit is not counted.",
  Revenue: "Open, close, win, long-hold and loss fees kept by Parchment after referral shares, split on chain between the house pool, stakers and the treasury: since 2026-11-13, 80% to the house pool, 10% to stakers and 10% to the treasury; before that, 30% to 70% to stakers by house pool coverage and the rest to the treasury.",
  ProtocolRevenue: "House pool and treasury shares of the open, close, win, long-hold and loss fees Parchment keeps. The house pool is Parchment's own trading capital, with no outside depositors (house pool share since 2026-11-13). Later surplus sweeps out of the pool are not counted again.",
  HoldersRevenue: "Share of the open, close, win, long-hold and loss fees Parchment keeps that is paid in USDC to PARCHMENT stakers.",
  SupplySideRevenue: "Execution fees reimbursing the order keeper's gas, referral fees paid to referrers, builder fees paid to builders and liquidation bounties paid to liquidators.",
};

const FEE_SOURCES = {
  [LABELS.OPEN]: "Open fee charged on position notional at open (market taker fee, 0 since launch).",
  [LABELS.CLOSE]: "Close fee on position notional, charged on every close, net of any referee discount.",
  [LABELS.WIN]: "Win fee on adjusted profit on winning closes paid out at once, net of any referee discount.",
  [LABELS.LONG_HOLD]: "Long-hold fee added to the win fee on winning closes of positions held past the free period, paid out at once, net of any referee discount.",
  [LABELS.QUEUED]: "Win and long-hold fees, and the part of the close fee taken out of profit, on winning closes whose profit was queued; counted when the queued claim is paid out, net of any referee discount.",
  [LABELS.LOSS]: "Loss fee on the margin a trader loses on a losing close or a liquidation, a protocol cut taken before the rest goes to the house pool.",
  [LABELS.EXEC]: "Flat execution fee per filled two-step order, refunded when the order is not filled.",
  [LABELS.BUILDER]: "On-top fee on profit for orders placed through a builder code.",
  [LABELS.LIQ]: "Bounty paid to the liquidator out of a liquidated position's margin.",
};

const breakdownMethodology = {
  Fees: FEE_SOURCES,
  Revenue: {
    [LABELS.TO_POOL]: "Share of retained fees added to the cash of the house pool, Parchment's own trading capital.",
    [LABELS.TO_STAKERS]: "Share of retained fees paid in USDC to stakers.",
    [LABELS.TO_TREASURY]: "Share of retained fees kept by the Parchment treasury.",
  },
  ProtocolRevenue: {
    [LABELS.TO_POOL]: "Share of retained fees added to the cash of the house pool, Parchment's own trading capital.",
    [LABELS.TO_TREASURY]: "Share of retained fees kept by the Parchment treasury.",
  },
  HoldersRevenue: {
    [LABELS.TO_STAKERS]: "Share of retained fees paid in USDC to stakers.",
  },
  SupplySideRevenue: {
    [LABELS.EXEC_TO_KEEPER]: "Execution fees paid to the order keeper, which pays the gas of order fills.",
    [LABELS.REFERRAL]: "Part of the fee paid to the trader's referrer and second-level referrer.",
    [LABELS.BUILDER_TO_BUILDERS]: "Builder on-top fees paid to the builder.",
    [LABELS.LIQ_TO_LIQUIDATORS]: "Liquidation bounties paid to the liquidator.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: PARCHMENT_START,
  methodology,
  breakdownMethodology,
};

export default adapter;
