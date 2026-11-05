// Yellow Onchain (https://onchain.yellow.pro) platform fees, read straight from the XRP Ledger (RPC, no API of ours).
// A Yellow Onchain swap is one XRPL Batch (ALLORNOTHING) whose inner transactions are the OfferCreate and an XRP Payment of
// the platform fee (0.3% of the swap's XRP side) to FEE_ACCOUNT. A Batch applies whole or not at all, so an inner fee
// Payment with tesSUCCESS in a validated ledger is a fee paid for a swap that filled. Sample:
// 6387860C46927EC5B0F5FB9E018A9073E446A1750CE92D8D23A4C5EB19665E72 (2026-11-01, 18,869 drops). Fee-waived members pay
// no platform fee: their swaps add volume (dexs/yellow-onchain) and no fees.
//
// Only inner Batch Payments count (tfInnerBatchTxn), so the account's other inflows are left out, and none from
// Yellow Onchain's own referral rewards account (its test swaps and top-ups are internal transfers). SourceTag 58900000 is
// on every app transaction from 2026-11-05 (88888888 from 2026-11-03 to 2026-11-05, counted up to the end of that day).
// Counting starts 2026-11-04, the first full day with the tag (the release went out late on 2026-11-03).
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { rpcCall } from "../../helpers/ripple";

const FEE_ACCOUNT = "rH2Nst52mNKRgmKVp2TzRVNgZGBNxSdj28"; // Yellow Onchain's platform fee account (https://onchain.yellow.pro/.well-known/xrp-ledger.toml)
const REWARDS_ACCOUNT = "rpsWtAtg2mJQkbypLGAdHXHP2P86kLnPEv"; // Yellow Onchain's referral rewards account: its swaps and top-ups are internal
const SOURCE_TAG = 58900000;
const OLD_SOURCE_TAG = 88888888; // the app's tag 2026-11-03 to 2026-11-05 (Bithomp already used it for another app's name)
const OLD_TAG_UNTIL = Date.UTC(2026, 10, 6) / 1e3; // 2026-11-06 00:00 UTC
const TF_INNER_BATCH_TXN = 0x40000000; // XLS-56: set on every inner transaction of a Batch
// XRPL close times count seconds from 2000-01-01 00:00 UTC, which is unix 946684800
// (https://xrpl.org/docs/references/protocol/data-types/basic-data-types#specifying-time)
const RIPPLE_EPOCH = 946_684_800;
// A rough average ledger interval (ledgers close every 3 to 5 seconds), used only as the first guess of where a
// timestamp lies; ledgerNear then refines it against real close times, so its exact value only changes the step count.
const SECONDS_PER_LEDGER = 3.9;
const PAD_LEDGERS = 100; // ~6.5 minutes either side of the window: transactions are then kept by their ledger's close time

/* A ledger's index and close time (unix seconds). */
async function ledgerTime(ledgerIndex: number | "validated") {
  const { result } = await rpcCall("ledger", [{ ledger_index: ledgerIndex }]);
  return { index: Number(result.ledger.ledger_index), time: Number(result.ledger.close_time) + RIPPLE_EPOCH };
}

/* The index of a ledger that closed within a minute of `ts`, by secant steps back from `from`. */
async function ledgerNear(ts: number, from: { index: number; time: number }) {
  let at = from;
  for (let i = 0; i < 10; i++) {
    const diff = at.time - ts;
    if (Math.abs(diff) <= 60) return at.index;
    at = await ledgerTime(Math.max(1, at.index - Math.round(diff / SECONDS_PER_LEDGER)));
  }
  throw new Error(`No XRPL ledger found near ${new Date(ts * 1e3).toISOString()}`);
}

/* A platform fee: an inner Batch Payment of XRP to the fee account that applied, tagged as Yellow Onchain's. */
function isPlatformFee(tx: any, meta: any, time: number) {
  const tagOk = tx?.SourceTag === SOURCE_TAG || (time < OLD_TAG_UNTIL && tx?.SourceTag === OLD_SOURCE_TAG);
  return tx?.TransactionType === "Payment" && tx.Destination === FEE_ACCOUNT && tx.Account !== FEE_ACCOUNT && tx.Account !== REWARDS_ACCOUNT
    && (Number(tx.Flags) & TF_INNER_BATCH_TXN) !== 0 && tagOk
    && meta?.TransactionResult === "tesSUCCESS" && typeof meta.delivered_amount === "string";
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const latest = await ledgerTime("validated");
  if (latest.time < endTimestamp) throw new Error("The XRPL node has not closed a ledger past the end of this window yet");
  const min = Math.max(1, (await ledgerNear(startTimestamp, latest)) - PAD_LEDGERS);
  const max = Math.min(latest.index, (await ledgerNear(endTimestamp, latest)) + PAD_LEDGERS); // never past the node's last validated ledger

  let drops = 0n;
  let marker: any = undefined;
  do {
    const { result } = await rpcCall("account_tx", [{
      account: FEE_ACCOUNT, ledger_index_min: min, ledger_index_max: max, forward: true, limit: 400, api_version: 2, ...(marker ? { marker } : {}),
    }]);
    // A node without the full history answers for a narrower range: never report a partial day.
    if (!(Number(result.ledger_index_min) <= min && Number(result.ledger_index_max) >= max))
      throw new Error(`The XRPL node searched ledgers ${result.ledger_index_min}-${result.ledger_index_max}, not ${min}-${max}`);
    for (const t of result.transactions ?? []) {
      const time = Date.parse(t.close_time_iso) / 1e3;
      if (!(time >= startTimestamp && time < endTimestamp) || !isPlatformFee(t.tx_json, t.meta, time)) continue;
      drops += BigInt(t.meta.delivered_amount);
    }
    marker = result.marker;
  } while (marker);

  const xrp = Number(drops) / 1e6;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyFees.addCGToken("ripple", xrp, METRIC.TRADING_FEES);
  dailyRevenue.addCGToken("ripple", xrp, "Trading Fees To Protocol");
  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
};

const methodology = {
  Fees: "Platform fee paid by Yellow Onchain users on swaps: 0.3% of the swap's XRP side, paid in XRP to Yellow Onchain's fee account inside the same XRP Ledger Batch as the swap and read from that account's validated transactions. The XRPL network fee is not included.",
  Revenue: "All platform fees paid by Yellow Onchain users on swaps, received by Yellow Onchain's fee account.",
  ProtocolRevenue: "All platform fees paid by Yellow Onchain users on swaps, kept in Yellow Onchain's fee account.",
};

const breakdownMethodology = {
  Fees: { [METRIC.TRADING_FEES]: "Platform fee (0.3% of the XRP side) on swaps made in Yellow Onchain, paid in XRP to the fee account." },
  Revenue: { "Trading Fees To Protocol": "Platform fees received by Yellow Onchain's fee account." },
  ProtocolRevenue: { "Trading Fees To Protocol": "Platform fees received by Yellow Onchain's fee account." },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.RIPPLE],
  start: "2026-11-04", // the first full day with the SourceTag (88888888, then 58900000 from 2026-11-05)
  methodology,
  breakdownMethodology,
};

export default adapter;
