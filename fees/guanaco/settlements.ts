import { createHash } from "crypto";
import { confirmedTrades, transaction, treasuryScript } from "./buybacks";
import { PromisePool } from "@supercharge/promise-pool";
import fetchURL from "../../utils/fetchURL";

// Guanaco v1 swap branch: a single pushed covenant; the owner-spend branch takes additional arguments.
// https://github.com/DefiLlama/DefiLlama-Adapters/tree/main/projects/guanaco
const swap = /^4c([a-f0-9]{2})(746376a914[a-f0-9]{40}88ac67c0d1c0ce88c25288c0cdc0c788c0c6c0cc9490([a-f0-9]+)765a96c48cc09476cc5279a269cd1976a914748e3dffdc1ab726e8d7d8d381e56034871fe62388ac8894c0c6c0d095c0cc527994c0d395a17768)$/;
// Decode only the covenant's optional positive-integer OP_MUL followed by OP_DIV.
const positivePush = "(5[1-9a-f]|60|01[0-7][0-9a-f]|02[0-9a-f]{2}[0-7][0-9a-f])";
const rateProgram = new RegExp("^(?:" + positivePush + "95)?" + positivePush + "96$");
function operand(push: string) {
  const bytes = Buffer.from(push, "hex");
  return bytes.length === 1 ? bytes[0] - 0x50 : bytes.readUIntLE(1, bytes.length - 1);
}
export const tierBps = [1, 5, 30, 100, 10, 20, 50];
function feeRate(program: string) {
  const match = rateProgram.exec(program);
  if (!match) throw new Error("Unknown Guanaco fee program " + program);
  const rate = 10000 * (match[1] ? operand(match[1]) : 1) / operand(match[2]);
  if (!tierBps.includes(rate)) throw new Error("Unsupported Guanaco fee tier " + program);
  return rate;
}
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest();

function sats(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid BCH reserve");
  return BigInt(value);
}

export async function settlements(indexer: string, start: number, end: number) {
  const history = await fetchURL(indexer + "/market-history?protocol=guanaco");
  if (history.protocol !== "guanaco" || history.includesMempool !== false ||
      history.volumeDefinition !== "gross_swap_legs" || !(history.indexedThrough >= end) || !history.assets?.length)
    throw new Error("Incomplete confirmed Guanaco inventory");
  const expected = new Map<string, Map<string, bigint>>();
  const seen = new Set<string>();
  const { errors } = await PromisePool.withConcurrency(2).for(history.assets as { category: string; firstPoolAt: number }[])
    .process(async ({ category, firstPoolAt }) => {
      if (!/^[a-f0-9]{64}$/.test(category) || seen.has(category) || !Number.isSafeInteger(firstPoolAt))
        throw new Error("Invalid Guanaco market");
      seen.add(category);
      if (firstPoolAt >= end) return;
      for (const row of await confirmedTrades(indexer, category, start, end)) {
        if (!/^\d+$/.test(row.grossVolumeSatoshis)) throw new Error("Invalid indexed volume");
        const markets = expected.get(row.txid) ?? new Map<string, bigint>();
        if (markets.has(category)) throw new Error("Duplicate indexed Guanaco swap " + row.txid);
        markets.set(category, BigInt(row.grossVolumeSatoshis));
        expected.set(row.txid, markets);
      }
    });
  if (errors.length) throw errors[0];

  const fees = new Map<number, bigint>();
  let revenue = 0n;
  let dust = 0n;
  for (const [id, volumes] of expected) {
    const tx = await transaction(id);
    for (const [i, input] of tx.vin.entries()) {
      const match = swap.exec(input.scriptSig.hex);
      if (!match) continue;
      const [, length, script, program] = match;
      const bps = feeRate(program);
      if (parseInt(length, 16) !== script.length / 2) throw new Error("Unknown Guanaco covenant " + id);
      const lock = "aa20" + sha(sha(Buffer.from(script, "hex"))).toString("hex") + "87";
      const after = tx.vout[i];
      const payment = tx.vout[tx.output_count - 1 - i];
      const before = input.prevout ?? (await transaction(input.txid, [input.vout])).vout.find(out => out.n === input.vout);
      const category = before?.tokenData?.category;
      if (!before || !category || after?.scriptPubKey.hex !== lock || after.tokenData?.category !== category ||
          !volumes.has(category) || payment?.scriptPubKey.hex !== treasuryScript)
        throw new Error("Unverified Guanaco settlement " + id);
      const delta = sats(after.satoshis) - sats(before.satoshis);
      const gross = delta < 0n ? -delta : delta;
      const fee = gross * BigInt(bps) / 10000n;
      const allocated = fee / 10n;
      const lp = fee - allocated;
      if (sats(payment.satoshis) < allocated ||
          (sats(after.satoshis) - lp) * BigInt(after.tokenData.amount) < sats(before.satoshis) * BigInt(before.tokenData!.amount))
        throw new Error("Guanaco fee does not satisfy swap covenant " + id);
      // Only a dedicated BCH payment can be attributed to the trade. Separate observed 546-sat
      // dust top-ups from the nominal treasury allocation; reject unexplained excess.
      const extra = sats(payment.satoshis) - allocated;
      if (payment.tokenData || (extra && payment.satoshis !== 546))
        throw new Error("Ambiguous treasury output " + id + ":" + payment.n);
      dust += extra;
      fees.set(bps, (fees.get(bps) ?? 0n) + fee + extra);
      revenue += allocated;
      volumes.set(category, volumes.get(category)! - gross);
    }
    if ([...volumes.values()].some(remaining => remaining !== 0n))
      throw new Error("Unmatched Guanaco swap legs in " + id);
  }
  return { fees, revenue, dust };
}
