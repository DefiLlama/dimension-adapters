import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";
import "../../helpers/env";

// XRP Ledger AMM pools (XLS-30). An AMM keeps its trading fees inside the pool, so they show up as growth of
// sqrt(amount * amount2) / LP token supply, the pool value per LP token. Price moves and proportional deposits or
// withdrawals leave it unchanged. For each pool: fees = growth over the period x pool value at the end, counted in the
// pool's priced asset (XRP, else RLUSD; a 50/50 pool is worth twice its priced side). All fees go to liquidity providers.
//
// Discovery: XRPScan's pool list (listing AMMs on chain needs a full ledger_data walk). Its XRP balance is only used to
// skip pools below MIN_POOL_XRP; amounts come from amm_info at the two ledgers that bound the period.
const POOL_LIST_URL = "https://api.xrpscan.com/api/v1/amm/pools";
const PAGE_SIZE = 5000;
const MIN_POOL_XRP = 1000; // pool value, in XRP or RLUSD units; pools at or above it hold about 85% of AMM TVL
const XRP = "XRP";
const RLUSD = "524C555344000000000000000000000000000000.rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const RLUSD_DECIMALS = 6;

const { xrpl } = sdk.chains;

const isXrp = (asset: any) => typeof asset === "string" || (asset?.currency === XRP && !asset?.issuer);
const keyOf = (asset: any) => (isXrp(asset) ? XRP : asset?.mpt_issuance_id ?? `${asset?.currency}.${asset?.issuer}`);
const amountOf = (side: any) => Number(typeof side === "string" ? side : side.value); // XRP in drops

async function listPools(): Promise<any[]> {
  const pools: any[] = [];
  for (let offset = 0; offset < 20 * PAGE_SIZE; offset += PAGE_SIZE) {
    const data = await httpGet(POOL_LIST_URL, { params: { limit: PAGE_SIZE, offset }, timeout: 60_000 });
    if (!Array.isArray(data)) throw new Error("xrpl-dex: unexpected XRPScan pool list response");
    pools.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return pools;
}

// XRP pools need MIN_POOL_XRP by the list's balance; RLUSD pools without XRP are always read
function isCandidate(pool: any): boolean {
  if (!pool?.Account || !pool.Asset || !pool.Asset2) return false;
  const keys = [keyOf(pool.Asset), keyOf(pool.Asset2)];
  if (keys.includes(XRP)) return (2 * Number(pool.Balance ?? 0)) / 1e6 >= MIN_POOL_XRP;
  return keys.includes(RLUSD);
}

async function getAmm(account: string, ledgerIndex: number): Promise<any | null> {
  try {
    const { amm } = await xrpl.rpc("amm_info", { amm_account: account }, { ledgerIndex });
    return amm;
  } catch (e: any) {
    if (e?.error === "actMalformed" || e?.error === "actNotFound") return null; // not an AMM at that ledger
    throw e;
  }
}

function valuePerLpToken(amm: any): number | null {
  const lpSupply = Number(amm?.lp_token?.value);
  if (!(lpSupply > 0)) return null;
  const value = (Math.sqrt(amountOf(amm.amount)) * Math.sqrt(amountOf(amm.amount2))) / lpSupply;
  return Number.isFinite(value) && value > 0 ? value : null;
}

// pool value in its priced asset: { xrp } in XRP or { rlusd } in RLUSD
function pricedValue(amm: any): { xrp?: number; rlusd?: number } | null {
  for (const side of [amm.amount, amm.amount2]) if (isXrp(side)) return { xrp: (2 * amountOf(side)) / 1e6 };
  for (const side of [amm.amount, amm.amount2]) if (keyOf(side) === RLUSD) return { rlusd: 2 * amountOf(side) };
  return null;
}

const fetch = async (options: FetchOptions) => {
  const [start, end] = await Promise.all([
    xrpl.getLedgerAtTimestamp({ timestamp: options.startTimestamp }),
    xrpl.getLedgerAtTimestamp({ timestamp: options.endTimestamp }),
  ]);
  const accounts = [...new Set((await listPools()).filter(isCandidate).map((p) => p.Account))];
  if (!accounts.length) throw new Error("xrpl-dex: no pools listed");

  let feesXrp = 0;
  let feesRlusd = 0;
  let pools = 0;
  for (let i = 0; i < accounts.length; i += 50) {
    await Promise.all(accounts.slice(i, i + 50).map(async (account) => {
      const [ammEnd, ammStart] = await Promise.all([getAmm(account, end.number), getAmm(account, start.number)]);
      if (!ammEnd || !ammStart) return; // created or deleted inside the period
      const value = pricedValue(ammEnd);
      const vEnd = valuePerLpToken(ammEnd);
      const vStart = valuePerLpToken(ammStart);
      if (!value || !vEnd || !vStart) return;
      const growth = vEnd / vStart - 1;
      // fees never lower the value per LP token; a drop means the pool was emptied and refunded, so skip it
      if (growth <= 0) return;
      const sizeEnd = value.xrp ?? value.rlusd!;
      if (sizeEnd < MIN_POOL_XRP) return;
      pools++;
      if (value.xrp !== undefined) feesXrp += growth * value.xrp;
      else feesRlusd += growth * value.rlusd!;
    }));
  }
  if (!pools) throw new Error(`xrpl-dex: no pool fees measured between ledgers ${start.number} and ${end.number}`);

  const dailyFees = options.createBalances();
  dailyFees.addCGToken("ripple", feesXrp, METRIC.LP_FEES);
  if (feesRlusd) dailyFees.add(RLUSD, feesRlusd * 10 ** RLUSD_DECIMALS, METRIC.LP_FEES);
  return { dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  // each run reads every listed pool at the two ledgers bounding the period (about 2,500 amm_info calls), so it runs
  // once a day instead of hourly
  pullHourly: false,
  fetch,
  chains: [CHAIN.RIPPLE],
  start: "2026-11-01",
  methodology: {
    Fees: "Trading fees kept by XRP Ledger AMM pools, measured on-chain as the growth of pool value per LP token (sqrt(amount * amount2) / LP supply) between the ledgers that bound the day, times the pool value. Covers pools worth at least 1,000 XRP (or RLUSD), about 85% of AMM TVL. Order book trades pay no fee.",
    Revenue: "The protocol takes no fee; all AMM fees stay with liquidity providers.",
    SupplySideRevenue: "All AMM fees go to liquidity providers.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.LP_FEES]: "AMM trading fees kept by the pools." },
    SupplySideRevenue: { [METRIC.LP_FEES]: "AMM trading fees kept by the pools." },
  },
};

export default adapter;
