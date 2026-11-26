import { PromisePool } from "@supercharge/promise-pool";
import fetchURL from "../../utils/fetchURL";

// Project GUA/BCH pool and treasury used by the buyback verifier at https://guanaco.fi/gua.
const gua = "742a7585d0d5cb35b2a45d26425e23b059b72e82d7036dd97e85da5ab57a8d6c";
const treasuryScript = "76a914748e3dffdc1ab726e8d7d8d381e56034871fe62388ac";
const projectPoolScript = "aa2065e10ee37a522d27573df932433dd8de92e43159162a9b69eef08af4cf9df85287";
const firstBuybackHeight = 978934;
const firstBuybackDay = 1795564800; // 2026-11-25 UTC.
const explorer = "https://explorer.selene.cash/api/v1/tx";
const txidPattern = /^[0-9a-f]{64}$/;

type Output = { n: number; satoshis: number; tokenData?: { category: string; amount: string }; scriptPubKey: { hex: string } };
type Trade = { txid: string; time: number; satoshisDelta: string; tokenUnitsDelta: string };
type Input = { txid: string; vout: number };
type Tx = { txid: string; height: number; input_count: number; output_count: number; vin: Input[]; vout: Output[] };

async function transaction(id: string, neededOutputs?: number[]): Promise<Tx> {
  if (!txidPattern.test(id)) throw new Error("Invalid Guanaco transaction ID");
  const tx = await fetchURL(explorer + "/" + id);
  if (tx.txid !== id || !Number.isSafeInteger(tx.height) || tx.height <= 0 ||
      !Array.isArray(tx.vin) || !Array.isArray(tx.vout))
    throw new Error("Incomplete confirmed transaction " + id);
  if (neededOutputs) {
    const size = tx.pagination?.outputs?.page_size;
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error("Invalid output page size");
    const pages = new Set(neededOutputs.map(n => Math.floor(n / size) + 1));
    for (const page of pages) {
      if (page === 1) continue;
      const next = await fetchURL(explorer + "/" + id + "?output_page=" + page);
      if (next.txid !== id || next.blockhash !== tx.blockhash || next.pagination?.outputs?.page !== page)
        throw new Error("Invalid parent transaction page " + id);
      tx.vout.push(...next.vout);
    }
    return tx;
  }
  // Selene paginates inputs and outputs independently (100 items by default).
  for (const [field, param, count] of [
    ["vin", "input_page", tx.input_count], ["vout", "output_page", tx.output_count],
  ] as const) {
    const size = tx[field].length;
    if (!Number.isSafeInteger(count) || count < size || (count && !size))
      throw new Error("Invalid Guanaco transaction pagination " + id);
    for (let page = 2; tx[field].length < count; page++) {
      const next = await fetchURL(explorer + "/" + id + "?" + param + "=" + page);
      if (next.txid !== id || next.blockhash !== tx.blockhash ||
          next.pagination?.[field === "vin" ? "inputs" : "outputs"]?.page !== page ||
          !Array.isArray(next[field]) || !next[field].length)
        throw new Error("Missing Guanaco transaction page " + id);
      tx[field].push(...next[field]);
    }
    if (tx[field].length !== count || tx[field].some((row, index) => row.n !== index))
      throw new Error("Invalid Guanaco transaction ordering " + id);
  }
  return tx;
}

const guaUnits = (out: Output) => out.tokenData?.category === gua ? BigInt(out.tokenData.amount) : 0n;

async function buybackCost(trade: Trade) {
  const tx = await transaction(trade.txid);
  if (tx.height < firstBuybackHeight) return 0n;
  const treasury = tx.vout.filter(out => out.scriptPubKey.hex === treasuryScript);
  const received = treasury.reduce((sum, out) => sum + guaUnits(out), 0n);
  if (!received) return 0n;
  const after = tx.vout.filter(out => out.scriptPubKey.hex === projectPoolScript);
  if (!after.length) return 0n;

  // Resolve input outpoints to distinguish purchases paid by the treasury from third-party gifts.
  const ids = [...new Set(tx.vin.map(input => input.txid))];
  const { results, errors } = await PromisePool.withConcurrency(2).for(ids).process(id =>
    transaction(id, tx.vin.filter(input => input.txid === id).map(input => input.vout)));
  if (errors.length) throw errors[0];
  const parents = new Map(results.map(parent => [parent.txid, parent]));
  const inputs = tx.vin.map(({ txid, vout }) => {
    const output = parents.get(txid)?.vout.find(out => out.n === vout);
    if (!output) throw new Error("Missing Guanaco purchase input " + txid + ":" + vout);
    return output;
  });
  if (!inputs.some(out => out.scriptPubKey.hex === treasuryScript && !out.tokenData)) return 0n;
  const before = inputs.filter(out => out.scriptPubKey.hex === projectPoolScript);
  if (before.length !== after.length || inputs.some(out =>
    out.scriptPubKey.hex !== projectPoolScript && (out.scriptPubKey.hex !== treasuryScript || out.tokenData)))
    throw new Error("Unrecognized treasury purchase structure " + tx.txid);

  const amount = (outs: Output[]) => outs.reduce((sum, out) => sum + guaUnits(out), 0n);
  const sats = (outs: Output[]) => outs.reduce((sum, out) => {
    if (!Number.isSafeInteger(out.satoshis) || out.satoshis < 0) throw new Error("Invalid BCH amount");
    return sum + BigInt(out.satoshis);
  }, 0n);
  const cost = sats(after) - sats(before);
  if (cost <= 0n || amount(before) - amount(after) !== received ||
      BigInt(trade.tokenUnitsDelta) !== -received || BigInt(trade.satoshisDelta) !== cost)
    throw new Error("Unreconciled treasury purchase " + tx.txid);
  return cost;
}

// The indexer timestamps confirmed swaps by block-inclusive median time, like Guanaco DEX volume.
async function confirmedTrades(indexer: string, start: number, end: number): Promise<Trade[]> {
  const data = await fetchURL(indexer + "/trades/" + gua + "?protocol=guanaco&limit=100&start=" + start + "&end=" + end);
  if (data.protocol !== "guanaco" || data.includesMempool !== false || data.start !== start ||
      data.end !== end || !Array.isArray(data.trades) || typeof data.truncated !== "boolean" ||
      data.timestampSource !== "block_inclusive_median")
    throw new Error("Invalid confirmed Guanaco trade window");
  if (data.truncated) {
    const mid = Math.floor((start + end) / 2);
    if (mid === start) throw new Error("Guanaco trade feed exceeds its paging limit within one second");
    return [...await confirmedTrades(indexer, start, mid), ...await confirmedTrades(indexer, mid, end)];
  }
  for (const trade of data.trades) {
    if (!Number.isSafeInteger(trade.time) || trade.time < start || trade.time > end)
      throw new Error("Trade outside the requested Guanaco purchase window");
  }
  return data.trades.filter((trade: Trade) => trade.time < end);
}

export async function treasuryBuybacks(indexer: string, start: number, end: number): Promise<bigint> {
  if (end <= firstBuybackDay) return 0n;
  const records = await confirmedTrades(indexer, Math.max(start, firstBuybackDay), end);
  const seen = new Set<string>();
  for (const trade of records) {
    if (!txidPattern.test(trade.txid) || seen.has(trade.txid) ||
        !/^-?\d+$/.test(trade.tokenUnitsDelta) || !/^-?\d+$/.test(trade.satoshisDelta))
      throw new Error("Invalid or duplicate Guanaco trade");
    seen.add(trade.txid);
  }
  const purchases = records.filter(trade => BigInt(trade.tokenUnitsDelta) < 0n);
  const { results, errors } = await PromisePool.withConcurrency(2).for(purchases).process(buybackCost);
  if (errors.length) throw errors[0];
  return results.reduce((sum, cost) => sum + cost, 0n);
}
