import * as sdk from "@defillama/sdk";
import { zeroPadValue } from "ethers";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import { METRIC } from "./metrics";
import { httpPost } from "../utils/fetchURL";

// Derive v3 official API (JSON-RPC over HTTP POST): https://docs.derive.xyz/openapi.json
const API = "https://api.derive.xyz/v3/public";

export type DeriveTrade = {
  instrument_name: string; // e.g. ETH-PERP, ETH-USDC
  timestamp: number; // ms
  liquidity_role: "maker" | "taker"; // each trade is returned twice, one row per side with that side's fee
  direction: "buy" | "sell";
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
async function getTrades(options: FetchOptions, filter: Record<string, string | number>): Promise<DeriveTrade[]> {
  const from_timestamp = options.startTimestamp * 1000;
  const to_timestamp = options.endTimestamp * 1000;
  const trades: DeriveTrade[] = [];
  let numPages = 1;
  for (let page = 1; page <= numPages; page++) {
    const result = await rpc("get_trade_history", { ...filter, from_timestamp, to_timestamp, page, page_size: 1000 });
    numPages = result.pagination.num_pages;
    trades.push(...result.trades);
  }
  const inWindow = trades.filter((t) => t.timestamp >= from_timestamp && t.timestamp < to_timestamp);
  // batch_status: null = v2 trade (final), Settled = proven on Ethereum (final), ...Error = batch failed (trade dropped),
  // anything else is still in flight and can still fail, so throw and let the run retry (settlement lags ~15 min)
  const pending = inWindow.filter((t) => t.batch_status && t.batch_status !== "Settled" && !t.batch_status.endsWith("Error"));
  if (pending.length) throw new Error(`Derive ${JSON.stringify(filter)}: ${pending.length} trades not settled yet (${pending[0].batch_status})`);
  return inWindow.filter((t) => !t.batch_status?.endsWith("Error"));
}

export const getDeriveTrades = (options: FetchOptions, instrumentType: "perp" | "option" | "erc20") => getTrades(options, { instrument_type: instrumentType });

const BUYBACK_WALLET = "0x87327f19d857ae3530169acEa0EDd4ab1064229E";
const BUYBACK_SUBACCOUNTS = [62489]; // BUYBACK_WALLET's subaccount; v2-era buybacks were backfilled separately
const DRV = "0xb1d1eae60eea9525032a6dcb4c1ce336a1de71be"; // Ethereum
const COW_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41"; // GPv2Settlement on Ethereum
const COW_TRADE = "event Trade(address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)";
const COW_BUYBACK_OWNERS = [
  BUYBACK_WALLET,
  "0x20D5aE0c409B7478739512e9981EB5e871fe500C", // BUYBACK_WALLET's CoW Shed proxy, the wallet funds each order in the same tx (e.g. 0x1d8287c0f32319dbca736ae428dc98a2764837143c0dc424fa74e7ec4ac714a7)
];

export async function getDeriveBuybacks(options: FetchOptions) {
  const dailyHoldersRevenue = options.createBalances();

  for (const subaccount_id of BUYBACK_SUBACCOUNTS)
    for (const trade of await getTrades(options, { subaccount_id, instrument_name: "DRV-USDC" }))
      if (trade.direction === "buy") dailyHoldersRevenue.addUSDValue(Number(trade.trade_amount) * Number(trade.trade_price), METRIC.TOKEN_BUY_BACK);

  const provider = sdk.getProvider(CHAIN.ETHEREUM);
  for (const owner of COW_BUYBACK_OWNERS) {
    const logs = await sdk.getEventLogs({
      chain: CHAIN.ETHEREUM,
      target: COW_SETTLEMENT,
      eventAbi: COW_TRADE,
      extraTopics: [zeroPadValue(owner, 32)],
      fromTimestamp: options.startTimestamp - 60,
      toTimestamp: options.endTimestamp + 60,
      onlyArgs: false,
    });
    for (const log of logs) {
      if (log.args.owner.toLowerCase() !== owner.toLowerCase() || log.args.buyToken.toLowerCase() !== DRV) continue;
      const { timestamp } = (await provider.getBlock(log.blockNumber))!;
      if (timestamp < options.startTimestamp || timestamp >= options.endTimestamp) continue;
      dailyHoldersRevenue.addTokenVannila(`${CHAIN.ETHEREUM}:${log.args.sellToken.toLowerCase()}`, log.args.sellAmount, METRIC.TOKEN_BUY_BACK);
    }
  }

  return dailyHoldersRevenue;
}

export const deriveBuybacksMethodology = {
  methodology: { HoldersRevenue: "DRV bought back with a share of fees from all Derive markets (options, perps and spot), held by the Derive DAO treasury." },
  breakdownMethodology: { HoldersRevenue: { [METRIC.TOKEN_BUY_BACK]: "USDC spent buying DRV on the Derive orderbook and, during the v3 migration, on CoW Swap." } },
};

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
