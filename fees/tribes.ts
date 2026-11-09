import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { httpGet } from "../utils/fetchURL";

// Tribes (tribes.wtf): a social trading app. People buy and sell tokens from inside their tribes'
// chats; every trade is routed and settled through Relay (relay.link), and Tribes adds an app fee
// to the Relay quote.
//
// Fee: set on each trade when it is quoted, and the adapter sums what was recorded on each trade,
// never a rate applied to volume. The fee has two parts, under one of two arrangements:
//   - Until 2026-10-26 (and still on older app builds) Relay collects the whole fee as the app fee:
//     half is Tribes' commission, half is set aside to buy TRIBES back.
//   - Since 2026-10-26, current builds have Relay collect the commission alone, and the trader
//     pays the buyback part from their own wallet, which is swapped into TRIBES and burned
//     (TRIBES on Robinhood Chain: 0x56fcb5cC32D8ddA466dCC5FE4300576E67fcf20E).
// The commission pays the trader's cashback, the referrer's share and in-app rewards.
//
// Source: Tribes' public endpoint, which returns each completed trade in the window with its
// origin transaction hash and Relay request id (verifiable at https://relay.link/transaction/<id>),
// the app fee Relay charged on it, and the burn transaction where one was paid. Withdrawals,
// unsigned quotes, failed and refunded trades and Tribes' own test accounts are not included.
// Each trade is attributed to the chain of the token traded (what a buy bought, what a sell sold).
//
// Two databases serve the endpoint: the production app, and the TestFlight beta (real mainnet
// trades). The beta began as a copy of production, so beta serves only trades made after the copy;
// trades are also de-duplicated here by transaction hash.
const ENDPOINTS = [
  "https://mjextrnonddtcbvdrarm.supabase.co/functions/v1/defillama",
  "https://zrwjkcdvmjlvkovciems.supabase.co/functions/v1/defillama",
];

// Tribes' chain names -> DefiLlama chains.
const CHAINS: Record<string, string> = {
  solana: CHAIN.SOLANA,
  ethereum: CHAIN.ETHEREUM,
  base: CHAIN.BASE,
  bnb: CHAIN.BSC,
  arbitrum: CHAIN.ARBITRUM,
  optimism: CHAIN.OPTIMISM,
  polygon: CHAIN.POLYGON,
  monad: CHAIN.MONAD,
  robinhood: CHAIN.ROBINHOOD,
};

const LABELS = {
  TRADING_FEES: METRIC.TRADING_FEES,
  TRADING_FEES_TO_TREASURY: "Trading Fees To Treasury",
  TOKEN_BUY_BACK: METRIC.TOKEN_BUY_BACK,
  TOKEN_BURN: "Token Burn",
  CASHBACK_PAYOUTS: "Cashback Payouts",
  REFERRAL_PAYOUTS: "Referral Payouts",
  USER_REWARDS: "User Rewards",
};

type Trade = {
  settledAt: string;
  chain: string;
  txHash: string;
  volumeUsd: number;
  appFeeUsd: number;
  burnUsd: number;
  buybackUsd: number;
  cashbackUsd: number;
  referralUsd: number;
  rewardsUsd: number;
};

const NUMERIC_FIELDS: (keyof Trade)[] = [
  "volumeUsd", "appFeeUsd", "burnUsd", "buybackUsd", "cashbackUsd", "referralUsd", "rewardsUsd",
];

// One request per endpoint per window, shared by every chain.
async function prefetch(options: FetchOptions): Promise<any> {
  const trades = new Map<string, Trade>();
  for (const endpoint of ENDPOINTS) {
    const data = await httpGet(`${endpoint}?start=${options.startTimestamp}&end=${options.endTimestamp}`);
    // A failed or malformed answer must fail the window, not be stored as a day of zero fees.
    if (!data || !Array.isArray(data.trades)) {
      throw new Error(`Tribes endpoint ${endpoint} returned no trades array: ${JSON.stringify(data)?.slice(0, 200)}`);
    }
    for (const trade of data.trades as Trade[]) {
      const malformed =
        !trade.txHash ||
        NUMERIC_FIELDS.some((field) => typeof trade[field] !== "number" || !Number.isFinite(trade[field]) || (trade[field] as number) < 0);
      if (malformed) {
        throw new Error(`Tribes endpoint ${endpoint} returned a malformed trade: ${JSON.stringify(trade)}`);
      }
      // The buyback share and the payouts all come out of the app fee; more than it would be a bad record,
      // and would show as negative treasury revenue. Allow a micro-dollar of rounding.
      const outOfFee = trade.buybackUsd + trade.cashbackUsd + trade.referralUsd + trade.rewardsUsd;
      if (outOfFee > trade.appFeeUsd + 1e-6) {
        throw new Error(`Tribes trade ${trade.txHash} pays out more than its app fee: ${JSON.stringify(trade)}`);
      }
      if (!CHAINS[trade.chain]) throw new Error(`Tribes trade on an unmapped chain: ${trade.chain}`);
      trades.set(trade.txHash, trade);
    }
  }
  return [...trades.values()];
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const trades = (options.preFetchedResults as Trade[]).filter((trade) => CHAINS[trade.chain] === options.chain);
  for (const trade of trades) {
    const payouts = trade.cashbackUsd + trade.referralUsd + trade.rewardsUsd;
    const treasury = trade.appFeeUsd - trade.buybackUsd - payouts;

    dailyFees.addUSDValue(trade.appFeeUsd + trade.burnUsd, LABELS.TRADING_FEES);

    dailySupplySideRevenue.addUSDValue(trade.cashbackUsd, LABELS.CASHBACK_PAYOUTS);
    dailySupplySideRevenue.addUSDValue(trade.referralUsd, LABELS.REFERRAL_PAYOUTS);
    dailySupplySideRevenue.addUSDValue(trade.rewardsUsd, LABELS.USER_REWARDS);

    dailyProtocolRevenue.addUSDValue(treasury, LABELS.TRADING_FEES_TO_TREASURY);
    dailyHoldersRevenue.addUSDValue(trade.buybackUsd, LABELS.TOKEN_BUY_BACK);
    dailyHoldersRevenue.addUSDValue(trade.burnUsd, LABELS.TOKEN_BURN);

    dailyRevenue.addUSDValue(treasury, LABELS.TRADING_FEES_TO_TREASURY);
    dailyRevenue.addUSDValue(trade.buybackUsd, LABELS.TOKEN_BUY_BACK);
    dailyRevenue.addUSDValue(trade.burnUsd, LABELS.TOKEN_BURN);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "The fees Tribes users pay on every completed buy, sell or swap, as recorded on each trade: the app fee Relay charged, plus (on trades since 2026-10-26) the TRIBES burn the trader paid, counted only once it is burned. Withdrawals and deposits carry no fee and are not counted.",
  UserFees: "Same as Fees: all of it is paid by traders.",
  Revenue: "Fees minus the cashback, referral and in-app rewards paid back to users.",
  ProtocolRevenue: "Tribes' commission (the app fee less its buyback share) minus the cashback, referral and in-app rewards it pays.",
  HoldersRevenue: "The part of each trade's fee that goes to TRIBES, as recorded on the trade: the app fee's share set aside to buy TRIBES back (trades priced before 2026-10-26 and on older builds), or the burn the trader paid, swapped into TRIBES and burned (current builds).",
  SupplySideRevenue: "Cashback to traders, the referrer's share of their referrals' fees, and in-app rewards for calls, shared trades, theses and tribe activity.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.TRADING_FEES]: "Fees recorded on every completed trade: the app fee collected by Relay, plus the TRIBES burn paid by the trader on trades since 2026-10-26, once burned.",
  },
  UserFees: {
    [LABELS.TRADING_FEES]: "Fees recorded on every completed trade (app fee plus any burn paid), all paid by traders.",
  },
  Revenue: {
    [LABELS.TRADING_FEES_TO_TREASURY]: "Tribes' commission (the app fee less its buyback share) after cashback, referral and reward payouts.",
    [LABELS.TOKEN_BUY_BACK]: "The share of the app fee set aside to buy TRIBES back, as recorded on each trade priced before 2026-10-26 or on an older build.",
    [LABELS.TOKEN_BURN]: "The amount the trader paid to buy TRIBES and send it to the dead address, as recorded once burned, on trades since 2026-10-26.",
  },
  ProtocolRevenue: {
    [LABELS.TRADING_FEES_TO_TREASURY]: "Tribes' commission (the app fee less its buyback share) after cashback, referral and reward payouts.",
  },
  HoldersRevenue: {
    [LABELS.TOKEN_BUY_BACK]: "The share of the app fee set aside to buy TRIBES back, as recorded on each trade priced before 2026-10-26 or on an older build.",
    [LABELS.TOKEN_BURN]: "The amount the trader paid to buy TRIBES and send it to the dead address, as recorded once burned, on trades since 2026-10-26.",
  },
  SupplySideRevenue: {
    [LABELS.CASHBACK_PAYOUTS]: "Cashback credited to traders from the commission.",
    [LABELS.REFERRAL_PAYOUTS]: "The referrer's share of the commission on their referrals' trades.",
    [LABELS.USER_REWARDS]: "In-app rewards from the commission for calls, shared trades, theses and tribe activity.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  // The endpoint takes any window, so each hour is pulled once.
  pullHourly: true,
  prefetch,
  fetch,
  chains: Object.values(CHAINS),
  start: "2026-09-22",
  methodology,
  breakdownMethodology,
};

export default adapter;
