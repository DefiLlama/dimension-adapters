/**
 * Overtime (formerly Thales): onchain sportsbook, casino and Speed Markets on Optimism, Arbitrum, Base and Polygon.
 *
 * Every product is backed by protocol liquidity, so the protocol's income is the house result of settled bets
 * (stakes minus payouts), not a fee on top of them:
 * - Sportsbook: from 2026-07-21 the Overtime treasury is the only liquidity provider of the SportsAMMV2 pools (OIP-265),
 *   so the whole result of settled tickets is counted. Before that date the pools' result was shared with external LPs and
 *   only the SafeBox trading fee and the SafeBox share of profitable pool rounds are counted.
 * - Casino and Speed Markets: bankrolls have always been funded by the treasury, so their house result is counted for all dates.
 * - Free bets are funded by the protocol: they are not counted as stakes, and the net winnings paid on them are deducted.
 * - Sportsbook and casino referral fees are paid out of the house result and are supply side. Speed Markets referral fees
 *   (a share of the SafeBox fee on referred positions) are not tracked, so they stay in fees and revenue.
 * - Holders revenue is the stablecoin (USDC, sUSD before December 2024) spent by the SafeBoxBuyback contracts to buy back and
 *   burn OVER (THALES before the migration).
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { chainConfig, TREASURY_ONLY_LIQUIDITY_START } from './config';
import { EVENTS, ABIS } from './abis';

const ONE = 10n ** 18n;

const LABELS = {
  SPORTSBOOK_GGR: 'Sportsbook Gross Gaming Revenue',
  SPORTSBOOK_GGR_TO_PROTOCOL: 'Sportsbook Gross Gaming Revenue To Protocol',
  SPORTSBOOK_FEES: 'Sportsbook Trading Fees',
  SPORTSBOOK_FEES_TO_SAFEBOX: 'Sportsbook Trading Fees To SafeBox',
  SPORTSBOOK_PERFORMANCE_FEES: 'Sportsbook LP Performance Fees',
  SPORTSBOOK_PERFORMANCE_FEES_TO_SAFEBOX: 'Sportsbook LP Performance Fees To SafeBox',
  SPORTSBOOK_REFERRALS: 'Sportsbook Referral Fees To Referrers',
  CASINO_GGR: 'Casino Gross Gaming Revenue',
  CASINO_GGR_TO_PROTOCOL: 'Casino Gross Gaming Revenue To Protocol',
  CASINO_REFERRALS: 'Casino Referral Fees To Referrers',
  SPEED_GGR: 'Speed Markets Gross Gaming Revenue',
  SPEED_GGR_TO_PROTOCOL: 'Speed Markets Gross Gaming Revenue To Protocol',
  FREE_BET_WINNINGS: 'Free Bet Winnings',
  FREE_BET_WINNINGS_PAID: 'Free Bet Winnings Paid By Protocol',
};

type Balances = ReturnType<FetchOptions['createBalances']>;

type Metrics = {
  dailyVolume: Balances;
  dailyNotionalVolume: Balances;
  dailyFees: Balances;
  dailyRevenue: Balances;
  dailySupplySideRevenue: Balances;
  dailyHoldersRevenue: Balances;
};

const isSameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// house result of settled bets: positive when bettors lost, negative when they won
function addHouseResult(m: Metrics, token: string, amount: bigint, feesLabel: string, revenueLabel: string) {
  m.dailyFees.add(token, amount, feesLabel);
  m.dailyRevenue.add(token, amount, revenueLabel);
}

// referral fees are paid out of the house result
function addReferralFee(m: Metrics, token: string, amount: bigint, supplySideLabel: string, revenueLabel: string) {
  m.dailySupplySideRevenue.add(token, amount, supplySideLabel);
  m.dailyRevenue.add(token, -amount, revenueLabel);
}

// net winnings paid out on protocol-funded free bets (the free bet stake itself goes back to the protocol)
function addFreeBetWinnings(m: Metrics, token: string, earned: bigint) {
  m.dailyFees.add(token, -earned, LABELS.FREE_BET_WINNINGS);
  m.dailyRevenue.add(token, -earned, LABELS.FREE_BET_WINNINGS_PAID);
}

// ChainedSpeedMarketsAMM._getPayout, for chained markets created before payout() was stored on the market
function chainedPayout(buyinAmount: bigint, payoutMultiplier: bigint, numOfDirections: number) {
  let payout = buyinAmount;
  for (let i = 0; i < numOfDirections; i++) payout = (payout * payoutMultiplier) / ONE;
  return payout;
}

async function addSportsbook(options: FetchOptions, m: Metrics) {
  const { sportsAMMV2, freeBetsHolder, liquidityPools = [] } = chainConfig[options.chain];
  if (!sportsAMMV2) return;

  // volume: tickets bought, excluding tickets bought with protocol-funded free bets
  const tickets = await options.getLogs({ target: sportsAMMV2, eventAbi: EVENTS.ticketCreated });
  for (const ticket of tickets) {
    if (isSameAddress(ticket.recipient, freeBetsHolder)) continue;
    m.dailyVolume.add(ticket.collateral, ticket.buyInAmount);
    m.dailyNotionalVolume.add(ticket.collateral, ticket.payout);
  }

  const referrals = await options.getLogs({ target: sportsAMMV2, eventAbi: EVENTS.sportsbookReferrerPaid });

  // runs are hour/day aligned and the cutover is a day boundary (startTimestamp is 1s before the window start, so compare the end)
  if (options.endTimestamp <= TREASURY_ONLY_LIQUIDITY_START) {
    // external LPs owned the pools' result: count the SafeBox trading fee (incl. the referral share paid out of it)
    // and the SafeBox share of profitable rounds
    const safeBoxFees = await options.getLogs({ target: sportsAMMV2, eventAbi: EVENTS.safeBoxFeePaid });
    for (const fee of safeBoxFees) {
      m.dailyFees.add(fee.collateral, fee.safeBoxAmount, LABELS.SPORTSBOOK_FEES);
      m.dailyRevenue.add(fee.collateral, fee.safeBoxAmount, LABELS.SPORTSBOOK_FEES_TO_SAFEBOX);
    }
    for (const referral of referrals) {
      m.dailyFees.add(referral.collateral, referral.amount, LABELS.SPORTSBOOK_FEES);
      m.dailySupplySideRevenue.add(referral.collateral, referral.amount, LABELS.SPORTSBOOK_REFERRALS);
    }
    const performanceFees = await options.getLogs({ targets: liquidityPools.map(({ pool }) => pool), eventAbi: EVENTS.safeBoxSharePaid, flatten: false });
    performanceFees.forEach((logs: any[], i: number) => {
      for (const log of logs) {
        m.dailyFees.add(liquidityPools[i].collateral, log.safeBoxAmount, LABELS.SPORTSBOOK_PERFORMANCE_FEES);
        m.dailyRevenue.add(liquidityPools[i].collateral, log.safeBoxAmount, LABELS.SPORTSBOOK_PERFORMANCE_FEES_TO_SAFEBOX);
      }
    });
    return;
  }

  // treasury is the only LP: buy-in minus what was paid back (winnings, cash-outs, refunds) on every ticket settled in the period
  const resolved = await options.getLogs({ target: sportsAMMV2, eventAbi: EVENTS.ticketResolved });
  const settled = resolved.filter((log: any) => !isSameAddress(log.ticketOwner, freeBetsHolder)).map((log: any) => log.ticket);
  if (settled.length) {
    const buyIns = await options.api.multiCall({ abi: ABIS.ticket.buyInAmount, calls: settled });
    const finalPayouts = await options.api.multiCall({ abi: ABIS.ticket.finalPayout, calls: settled });
    const cancelled = await options.api.multiCall({ abi: ABIS.ticket.cancelled, calls: settled });
    const collaterals = await options.api.multiCall({ abi: ABIS.ticket.collateral, calls: settled });
    settled.forEach((_: string, i: number) => {
      const buyIn = BigInt(buyIns[i]);
      const paidOut = cancelled[i] ? buyIn : BigInt(finalPayouts[i]);
      addHouseResult(m, collaterals[i], buyIn - paidOut, LABELS.SPORTSBOOK_GGR, LABELS.SPORTSBOOK_GGR_TO_PROTOCOL);
    });
  }
  for (const referral of referrals)
    addReferralFee(m, referral.collateral, BigInt(referral.amount), LABELS.SPORTSBOOK_REFERRALS, LABELS.SPORTSBOOK_GGR_TO_PROTOCOL);

  const freeBets = (await options.getLogs({ target: freeBetsHolder, eventAbi: EVENTS.freeBetTicketResolved })).filter((log: any) => BigInt(log.earned) > 0n);
  if (freeBets.length) {
    const collaterals = await options.api.multiCall({ abi: ABIS.ticket.collateral, calls: freeBets.map((log: any) => log.ticket) });
    freeBets.forEach((log: any, i: number) => addFreeBetWinnings(m, collaterals[i], BigInt(log.earned)));
  }
}

// games with their own bankroll: stake minus payout of every bet settled in the period, read back from the game
async function addStandaloneCasinoBets(options: FetchOptions, m: Metrics, game: string, ids: any[], baseAbi: string, isBlackjack = false) {
  if (!ids.length) return;
  const calls = ids.map((id) => ({ target: game, params: [id.toString()] }));
  const bets = await options.api.multiCall({ abi: baseAbi, calls });
  const isFreeBet = await options.api.multiCall({ abi: ABIS.casino.isFreeBet, calls });
  // stake of the second hand of a split hand (the hand payout already covers both hands)
  const splits = isBlackjack ? await options.api.multiCall({ abi: ABIS.casino.getSplitDetails, calls }) : [];
  bets.forEach((bet: any, i: number) => {
    if (isFreeBet[i]) return; // counted through the free bet winnings paid by the FreeBetsHolder
    const stake = BigInt(bet.amount) + (isBlackjack ? BigInt(splits[i].amount2) : 0n);
    addHouseResult(m, bet.collateral, stake - BigInt(bet.payout), LABELS.CASINO_GGR, LABELS.CASINO_GGR_TO_PROTOCOL);
  });
}

async function addCasino(options: FetchOptions, m: Metrics) {
  const { casinoV1, casinoCoreV2, freeBetsHolder } = chainConfig[options.chain];
  const referralSources: string[] = [];

  if (casinoV1) {
    const [diceBets, rouletteBets] = await options.getLogs({ targets: [casinoV1.dice, casinoV1.roulette], eventAbi: EVENTS.diceRouletteBetResolved, flatten: false });
    await addStandaloneCasinoBets(options, m, casinoV1.dice, diceBets.map((log: any) => log.betId), ABIS.casino.getBetBase);
    await addStandaloneCasinoBets(options, m, casinoV1.roulette, rouletteBets.map((log: any) => log.betId), ABIS.casino.getBetBase);
    const baccaratBets = await options.getLogs({ target: casinoV1.baccarat, eventAbi: EVENTS.baccaratBetResolved });
    await addStandaloneCasinoBets(options, m, casinoV1.baccarat, baccaratBets.map((log: any) => log.betId), ABIS.casino.getBetBase);
    const hands = await options.getLogs({ target: casinoV1.blackjack, eventAbi: EVENTS.blackjackHandResolved });
    await addStandaloneCasinoBets(options, m, casinoV1.blackjack, hands.map((log: any) => log.handId), ABIS.casino.getHandBase, true);
    const spins = await options.getLogs({ target: casinoV1.slots, eventAbi: EVENTS.slotsSpinResolved });
    await addStandaloneCasinoBets(options, m, casinoV1.slots, spins.map((log: any) => log.spinId), ABIS.casino.getSpinBase);
    referralSources.push(...Object.values(casinoV1));
  }

  if (casinoCoreV2) {
    // shared bankroll: stakes pulled from players' wallets minus payouts sent to them (cancelled bets net to zero);
    // free bet stakes and payouts go through the FreeBetsHolder and are left out here
    const stakes = await options.getLogs({ target: casinoCoreV2, eventAbi: EVENTS.casinoStakePulled });
    for (const stake of stakes)
      addHouseResult(m, stake.collateral, BigInt(stake.amount), LABELS.CASINO_GGR, LABELS.CASINO_GGR_TO_PROTOCOL);
    const payouts = await options.getLogs({ target: casinoCoreV2, eventAbi: EVENTS.casinoPayoutSent });
    for (const payout of payouts) {
      if (payout.isFreeBet) continue;
      addHouseResult(m, payout.collateral, -BigInt(payout.amount), LABELS.CASINO_GGR, LABELS.CASINO_GGR_TO_PROTOCOL);
    }
    referralSources.push(casinoCoreV2);
  }

  if (!referralSources.length) return;
  const referrals = await options.getLogs({ targets: referralSources, eventAbi: EVENTS.casinoReferrerPaid });
  for (const referral of referrals)
    addReferralFee(m, referral.collateral, BigInt(referral.amount), LABELS.CASINO_REFERRALS, LABELS.CASINO_GGR_TO_PROTOCOL);

  const freeBets = await options.getLogs({ target: freeBetsHolder, eventAbi: EVENTS.freeBetCasinoBetResolved });
  for (const freeBet of freeBets)
    if (BigInt(freeBet.earned) > 0n) addFreeBetWinnings(m, freeBet.collateral, BigInt(freeBet.earned));
}

async function addSpeedMarkets(options: FetchOptions, m: Metrics) {
  const { speedMarketsAMM, chainedSpeedMarketsAMM, freeBetsHolder } = chainConfig[options.chain];

  const created = await options.getLogs({ target: speedMarketsAMM, eventAbi: EVENTS.speedMarketCreated });
  const createdChained = await options.getLogs({ target: chainedSpeedMarketsAMM, eventAbi: EVENTS.chainedMarketCreated });
  const resolved = await options.getLogs({ target: speedMarketsAMM, eventAbi: EVENTS.speedMarketResolved });
  const resolvedChained = await options.getLogs({ target: chainedSpeedMarketsAMM, eventAbi: EVENTS.chainedMarketResolved });
  const freeBets = (await options.getLogs({ target: freeBetsHolder, eventAbi: EVENTS.freeBetSpeedMarketResolved })).filter((log: any) => BigInt(log.earned) > 0n);
  if (!created.length && !createdChained.length && !resolved.length && !resolvedChained.length && !freeBets.length) return;

  // markets created before multi-collateral support have no collateral() / payout(): they were always in the AMM's sUSD
  // (the chain's USDC) and paid out 2x the buy-in (chained: buy-in x multiplier per direction)
  const speedCollateral = await options.api.call({ target: speedMarketsAMM, abi: ABIS.sUSD });
  const chainedCollateral = await options.api.call({ target: chainedSpeedMarketsAMM, abi: ABIS.sUSD });
  const readMarkets = (abi: string, markets: string[], permitFailure = false) => markets.length ? options.api.multiCall({ abi, calls: markets, permitFailure }) : Promise.resolve([]);

  // volume, when positions are bought
  const createdMarkets = created.map((log: any) => log._market);
  const createdCollaterals = await readMarkets(ABIS.speedMarket.collateral, createdMarkets, true);
  const createdPayouts = await readMarkets(ABIS.speedMarket.payout, createdMarkets, true);
  created.forEach((log: any, i: number) => {
    if (isSameAddress(log._user, freeBetsHolder)) return;
    const collateral = createdCollaterals[i] ?? speedCollateral;
    const buyinAmount = BigInt(log._buyinAmount);
    m.dailyVolume.add(collateral, buyinAmount);
    m.dailyNotionalVolume.add(collateral, createdPayouts[i] ?? buyinAmount * 2n);
  });
  const createdChainedMarkets = createdChained.map((log: any) => log.market);
  const createdChainedCollaterals = await readMarkets(ABIS.speedMarket.collateral, createdChainedMarkets, true);
  const createdChainedPayouts = await readMarkets(ABIS.speedMarket.payout, createdChainedMarkets, true);
  createdChained.forEach((log: any, i: number) => {
    if (isSameAddress(log.user, freeBetsHolder)) return;
    const collateral = createdChainedCollaterals[i] ?? chainedCollateral;
    const buyinAmount = BigInt(log.buyinAmount);
    m.dailyVolume.add(collateral, buyinAmount);
    m.dailyNotionalVolume.add(collateral, createdChainedPayouts[i] ?? chainedPayout(buyinAmount, BigInt(log.payoutMultiplier), log.directions.length));
  });

  // result, when positions are resolved: the buyer paid buy-in x (1 + SafeBox fee + LP fee) and gets the payout if right.
  // The referral fee on a referred position is paid out of the SafeBox fee and is not tracked, so it is not deducted.
  const markets = resolved.map((log: any) => log._market);
  if (markets.length) {
    const users = await readMarkets(ABIS.speedMarket.user, markets);
    const buyins = await readMarkets(ABIS.speedMarket.buyinAmount, markets);
    const safeBoxImpacts = await readMarkets(ABIS.speedMarket.safeBoxImpact, markets);
    const lpFees = await readMarkets(ABIS.speedMarket.lpFee, markets);
    const payouts = await readMarkets(ABIS.speedMarket.payout, markets, true);
    const collaterals = await readMarkets(ABIS.speedMarket.collateral, markets, true);
    resolved.forEach((log: any, i: number) => {
      if (isSameAddress(users[i], freeBetsHolder)) return;
      const buyinAmount = BigInt(buyins[i]);
      const paidByUser = (buyinAmount * (ONE + BigInt(safeBoxImpacts[i]) + BigInt(lpFees[i]))) / ONE;
      const payout = payouts[i] !== null && payouts[i] !== undefined ? BigInt(payouts[i]) : buyinAmount * 2n;
      addHouseResult(m, collaterals[i] ?? speedCollateral, paidByUser - (log._userIsWinner ? payout : 0n), LABELS.SPEED_GGR, LABELS.SPEED_GGR_TO_PROTOCOL);
    });
  }
  const chainedMarkets = resolvedChained.map((log: any) => log.market);
  if (chainedMarkets.length) {
    const users = await readMarkets(ABIS.speedMarket.user, chainedMarkets);
    const buyins = await readMarkets(ABIS.speedMarket.buyinAmount, chainedMarkets);
    const safeBoxImpacts = await readMarkets(ABIS.speedMarket.safeBoxImpact, chainedMarkets);
    const payoutMultipliers = await readMarkets(ABIS.speedMarket.payoutMultiplier, chainedMarkets);
    const numOfDirections = await readMarkets(ABIS.speedMarket.numOfDirections, chainedMarkets);
    const payouts = await readMarkets(ABIS.speedMarket.payout, chainedMarkets, true);
    const collaterals = await readMarkets(ABIS.speedMarket.collateral, chainedMarkets, true);
    resolvedChained.forEach((log: any, i: number) => {
      if (isSameAddress(users[i], freeBetsHolder)) return;
      const buyinAmount = BigInt(buyins[i]);
      const paidByUser = (buyinAmount * (ONE + BigInt(safeBoxImpacts[i]))) / ONE;
      const payout = payouts[i] !== null && payouts[i] !== undefined ? BigInt(payouts[i]) : chainedPayout(buyinAmount, BigInt(payoutMultipliers[i]), Number(numOfDirections[i]));
      addHouseResult(m, collaterals[i] ?? chainedCollateral, paidByUser - (log.userIsWinner ? payout : 0n), LABELS.SPEED_GGR, LABELS.SPEED_GGR_TO_PROTOCOL);
    });
  }

  if (freeBets.length) {
    const collaterals = await readMarkets(ABIS.speedMarket.collateral, freeBets.map((log: any) => log.speedMarket), true);
    freeBets.forEach((log: any, i: number) => addFreeBetWinnings(m, collaterals[i] ?? speedCollateral, BigInt(log.earned)));
  }
}

// legacy Thales digital options, volume only (their LP pools belonged to external LPs)
async function addDigitalOptions(options: FetchOptions, m: Metrics) {
  const { digitalOptionsAMMs } = chainConfig[options.chain];
  if (!digitalOptionsAMMs) return;
  const trades = await options.getLogs({ targets: digitalOptionsAMMs, eventAbi: EVENTS.boughtFromAmm });
  for (const trade of trades) {
    m.dailyVolume.add(trade.susd, trade.sUSDPaid);
    m.dailyNotionalVolume.addUSDValue(Number(trade.amount) / 1e18); // each position token pays out 1 USD
  }
}

async function addBuybacks(options: FetchOptions, m: Metrics) {
  const { safeBoxBuyback } = chainConfig[options.chain];
  if (!safeBoxBuyback) return;
  const buybacks = await options.getLogs({ target: safeBoxBuyback, eventAbi: EVENTS.buybackExecuted });
  if (!buybacks.length) return;
  const usdc = await options.api.call({ target: safeBoxBuyback, abi: ABIS.sUSD });
  for (const buyback of buybacks) m.dailyHoldersRevenue.add(usdc, buyback._amountIn, METRIC.TOKEN_BUY_BACK);
}

const fetch = async (options: FetchOptions) => {
  const m: Metrics = {
    dailyVolume: options.createBalances(),
    dailyNotionalVolume: options.createBalances(),
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
    dailyHoldersRevenue: options.createBalances(),
  };

  await addSportsbook(options, m);
  await addCasino(options, m);
  await addSpeedMarkets(options, m);
  await addDigitalOptions(options, m);
  await addBuybacks(options, m);

  // revenue spent on buybacks moves to holders revenue; the rest stays with the treasury
  const dailyProtocolRevenue = m.dailyRevenue.clone();
  dailyProtocolRevenue.subtract(m.dailyHoldersRevenue, METRIC.TOKEN_BUY_BACK);

  return { ...m, dailyProtocolRevenue };
};

const methodology = {
  Volume: "Stakes paid by bettors on sportsbook tickets and Speed Markets positions (and legacy Thales digital options), excluding protocol-funded free bets and casino wagers.",
  NotionalVolume: "Maximum payout of the sportsbook tickets and Speed Markets positions bought, excluding protocol-funded free bets.",
  Fees: "What bettors lost to the house on settled sportsbook, casino and Speed Markets bets (stakes minus payouts, less winnings paid on protocol-funded free bets), negative when bettors win more than they lose; before 2026-07-21, while the sportsbook pools were shared with external liquidity providers, the sportsbook only counts its SafeBox trading fee and the SafeBox share of profitable pool rounds.",
  Revenue: "Fees minus sportsbook and casino referral fees, all kept by the Overtime treasury, which has been the only sportsbook liquidity provider since 2026-07-21 (OIP-265) and has always funded the casino and Speed Markets bankrolls. Speed Markets referral fees are not tracked and are not deducted.",
  SupplySideRevenue: "Referral fees paid to the referrers of bettors on the sportsbook and casino. Speed Markets referral fees are not tracked.",
  HoldersRevenue: "Stablecoins (USDC, sUSD before December 2024) spent by the SafeBoxBuyback contracts to buy back and burn OVER (THALES before the token migration).",
  ProtocolRevenue: "Revenue minus what is spent on OVER buybacks, i.e. what stays in the treasury, negative when buybacks or bettor wins exceed the period's revenue.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.SPORTSBOOK_GGR]: "From 2026-07-21: buy-in minus final payout (winnings, cash-out or refund) of every sportsbook ticket settled in the period, excluding free bet tickets.",
    [LABELS.SPORTSBOOK_FEES]: "Before 2026-07-21: SafeBox fee charged on sportsbook ticket buy-ins, including the share paid to referrers.",
    [LABELS.SPORTSBOOK_PERFORMANCE_FEES]: "Before 2026-07-21: share of each profitable weekly liquidity pool round sent to the SafeBox.",
    [LABELS.CASINO_GGR]: "Stakes minus payouts of casino bets (Roulette, Dice, Blackjack, Baccarat, Slots and the CasinoCoreV2 games: Plinko, Hi-Lo, Keno, Video Poker, Three Card Poker, Ultimate and Bonus Hold'em, Penalty Shootout), excluding free bets.",
    [LABELS.SPEED_GGR]: "Buy-in plus SafeBox and LP fees minus payout of every Speed Markets and Chained Speed Markets position resolved in the period, excluding free bets.",
    [LABELS.FREE_BET_WINNINGS]: "Net winnings paid to users on protocol-funded free bets (negative).",
  },
  Revenue: {
    [LABELS.SPORTSBOOK_GGR_TO_PROTOCOL]: "From 2026-07-21: sportsbook result kept by the protocol, the treasury being the only liquidity provider, net of referral fees.",
    [LABELS.SPORTSBOOK_FEES_TO_SAFEBOX]: "Before 2026-07-21: SafeBox fee on sportsbook buy-ins, net of the referral share.",
    [LABELS.SPORTSBOOK_PERFORMANCE_FEES_TO_SAFEBOX]: "Before 2026-07-21: SafeBox share of profitable liquidity pool rounds.",
    [LABELS.CASINO_GGR_TO_PROTOCOL]: "Casino result kept by the treasury-funded bankrolls, net of referral fees.",
    [LABELS.SPEED_GGR_TO_PROTOCOL]: "Speed Markets result kept by the treasury-funded AMMs. Referral fees paid out of the SafeBox fee on referred positions are not tracked and are not deducted.",
    [LABELS.FREE_BET_WINNINGS_PAID]: "Net winnings paid to users on protocol-funded free bets (negative).",
  },
  SupplySideRevenue: {
    [LABELS.SPORTSBOOK_REFERRALS]: "Share of the sportsbook SafeBox fee paid to the referrer of the bettor.",
    [LABELS.CASINO_REFERRALS]: "Share of lost casino stakes paid to the referrer of the player.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "Stablecoins (USDC, sUSD before December 2024) spent by the SafeBoxBuyback contracts to buy back and burn OVER (THALES before the migration).",
  },
  ProtocolRevenue: {
    [LABELS.SPORTSBOOK_GGR_TO_PROTOCOL]: "From 2026-07-21: sportsbook result kept by the protocol, net of referral fees.",
    [LABELS.SPORTSBOOK_FEES_TO_SAFEBOX]: "Before 2026-07-21: SafeBox fee on sportsbook buy-ins, net of the referral share.",
    [LABELS.SPORTSBOOK_PERFORMANCE_FEES_TO_SAFEBOX]: "Before 2026-07-21: SafeBox share of profitable liquidity pool rounds.",
    [LABELS.CASINO_GGR_TO_PROTOCOL]: "Casino result kept by the treasury-funded bankrolls, net of referral fees.",
    [LABELS.SPEED_GGR_TO_PROTOCOL]: "Speed Markets result kept by the treasury-funded AMMs, not net of referral fees (not tracked).",
    [LABELS.FREE_BET_WINNINGS_PAID]: "Net winnings paid to users on protocol-funded free bets (negative).",
    [METRIC.TOKEN_BUY_BACK]: "Stablecoins spent on OVER buybacks, moved to holders revenue (negative).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  // the protocol is the counterparty of every bet: fees and revenue are negative in periods when bettors win more than they
  // lose, and protocol revenue is negative when the fixed-rate buybacks exceed the period's revenue
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
