import { FetchOptions } from "../adapters/types";
import { httpPost } from "../utils/fetchURL";

// Derive v3 official API (JSON-RPC over HTTP POST): https://docs.derive.xyz/openapi.json
const API = "https://api.derive.xyz/v3/public";

export type DeriveTrade = {
  instrument_name: string; // e.g. ETH-PERP, ETH-USDC
  timestamp: number; // ms
  liquidity_role: "maker" | "taker"; // each trade is returned twice, one row per side with that side's fee
  trade_price: string;
  trade_amount: string;
  index_price: string;
  trade_fee: string;
  extra_fee: string; // builder fee set by the submitting app, paid to that app
  expected_rebate: string; // maker rebate
  batch_status: string | null;
};

async function rpc(method: string, params: object) {
  const { result, error } = await httpPost(`${API}/${method}`, params);
  if (error) throw new Error(`Derive ${method}: ${JSON.stringify(error)}`);
  return result;
}

// https://docs.derive.xyz/api-reference/market-data/publicget_trade_history.md (pages start at 1, max page_size 1000)
export async function getDeriveTrades(options: FetchOptions, instrumentType: "perp" | "option" | "erc20"): Promise<DeriveTrade[]> {
  const from_timestamp = options.startTimestamp * 1000;
  const to_timestamp = options.endTimestamp * 1000;
  const trades: DeriveTrade[] = [];
  let numPages = 1;
  for (let page = 1; page <= numPages; page++) {
    const result = await rpc("get_trade_history", { instrument_type: instrumentType, from_timestamp, to_timestamp, page, page_size: 1000 });
    numPages = result.pagination.num_pages;
    trades.push(...result.trades);
  }
  const inWindow = trades.filter((t) => t.timestamp >= from_timestamp && t.timestamp < to_timestamp);
  // batch_status: null = v2 trade (final), Settled = proven on Ethereum (final), ...Error = batch failed (trade dropped),
  // anything else is still in flight and can still fail, so throw and let the run retry (settlement lags ~15 min)
  const pending = inWindow.filter((t) => t.batch_status && t.batch_status !== "Settled" && !t.batch_status.endsWith("Error"));
  if (pending.length) throw new Error(`Derive ${instrumentType}: ${pending.length} trades not settled yet (${pending[0].batch_status})`);
  return inWindow.filter((t) => !t.batch_status?.endsWith("Error"));
}

export async function getDeriveFees(options: FetchOptions, instrumentType: "perp" | "option" | "erc20", isTracked = (_: DeriveTrade) => true) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const trade of await getDeriveTrades(options, instrumentType)) {
    if (!isTracked(trade)) continue;
    const fee = Number(trade.trade_fee);
    const builderFee = Number(trade.extra_fee);
    const rebate = Number(trade.expected_rebate);
    dailyFees.addUSDValue(fee, "Trading Fees");
    dailyFees.addUSDValue(builderFee, "Builder Fees");
    dailySupplySideRevenue.addUSDValue(rebate, "Maker Rebates");
    dailySupplySideRevenue.addUSDValue(builderFee, "Builder Fees To Builders");
    dailyRevenue.addUSDValue(fee - rebate, "Trading Fees Net Of Rebates");
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

export const deriveFeesMethodology = (market: string) => ({
  methodology: {
    Fees: `Trading fees and builder fees paid on Derive ${market} trades.`,
    UserFees: `Trading fees and builder fees paid on Derive ${market} trades.`,
    Revenue: `Trading fees minus maker rebates.`,
    ProtocolRevenue: `Trading fees minus maker rebates.`,
    SupplySideRevenue: `Maker rebates and builder fees.`,
  },
  breakdownMethodology: {
    Fees: {
      "Trading Fees": `Trading fees on ${market} trades.`,
      "Builder Fees": `Fees set by third-party apps on the orders they submit.`,
    },
    Revenue: { "Trading Fees Net Of Rebates": "Trading fees minus maker rebates." },
    SupplySideRevenue: {
      "Maker Rebates": "Rebates paid to market makers.",
      "Builder Fees To Builders": "Builder fees paid to the apps that set them.",
    },
  },
});

// current one-sided open interest in USD (oi is in underlying units)
export async function getDeriveOpenInterest(instrumentType: "perp" | "option") {
  const currencies = await rpc("get_all_currencies", {});
  let openInterest = 0;
  for (const currency of currencies)
    for (const universe of currency[instrumentType]?.universes ?? [])
      openInterest += Number(universe.oi.current_open_interest) * Number(currency.spot_price);
  return openInterest;
}
