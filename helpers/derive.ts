import { FetchOptions } from "../adapters/types";
import { httpPost } from "../utils/fetchURL";

// Derive v3 official API (JSON-RPC over HTTP POST): https://docs.derive.xyz/openapi.json
const API = "https://api.derive.xyz/v3/public";

export type DeriveTrade = {
  instrument_name: string; // e.g. ETH-PERP, ETH-USDC
  timestamp: number; // ms
  liquidity_role: "maker" | "taker"; // every trade is returned twice, once per side
  trade_price: string;
  trade_amount: string;
  index_price: string;
  trade_fee: string;
  extra_fee: string;
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
  // half-open window, and skip batches that failed and never settled
  return trades.filter((t) => t.timestamp >= from_timestamp && t.timestamp < to_timestamp && !t.batch_status?.endsWith("Error"));
}

// referral/builder code performance, in USD
export async function getDeriveBuilderFees(referral_code: string, options: FetchOptions) {
  const res = await rpc("get_referral_performance", { referral_code, start_ms: options.fromTimestamp * 1000, end_ms: options.toTimestamp * 1000 });
  return Number(res.total_referred_fees) + Number(res.total_fee_rewards);
}

// current one-sided open interest in USD, from get_all_currencies (oi is in underlying units)
export async function getDeriveOpenInterest(instrumentType: "perp" | "option") {
  const currencies = await rpc("get_all_currencies", {});
  let openInterest = 0;
  for (const currency of currencies)
    for (const universe of currency[instrumentType]?.universes ?? [])
      openInterest += Number(universe.oi.current_open_interest) * Number(currency.spot_price);
  return openInterest;
}
