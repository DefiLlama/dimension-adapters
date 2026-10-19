import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import * as tokens from "../../helpers/token";
import adapter from "./index";

class Balances {
  value = 0n;
  add(token: any, value?: any) { this.value += token instanceof Balances ? token.value : BigInt(value); }
  clone(multiplier = 1) { const copy = new Balances(); copy.value = this.value * BigInt(multiplier); return copy; }
}
const wallet = "0xfb1302f5d6c5f107a0715b8ce7303d1e3c647807";
const vault = "0x04eaa73b518783010a5a5dc471eea89c4c34ef44";
const user = "0x" + "4".repeat(40);
const hash = "0x" + "1".repeat(64);
const reference = "0x" + "2".repeat(64);
const cutoff = 1791907200;
const fromBlock = 52700000, toBlock = 52701799;
const bought = (mode: number, cost: bigint, gross: bigint, ref: string) => ({
  transactionHash: hash, blockNumber: fromBlock + 10,
  args: { paymentMode: mode, onchainCost: cost, grossAmount: gross, paymentReference: ref, user },
});
const transfer = (from: string, to: string, value: bigint) => ({
  transactionHash: "0x" + "3".repeat(64), blockNumber: fromBlock + 20, args: { from, to, value },
});
const fetchBase = adapter.adapter!.base.fetch!;
const fetchAbstract = adapter.adapter!.abstract.fetch!;
function options(chain: string, buys: any[], payments: any[]) {
  const seen: any[] = [];
  return {
    chain, startTimestamp: cutoff + 86400, endTimestamp: cutoff + 90000,
    getFromBlock: async () => fromBlock, getToBlock: async () => toBlock,
    createBalances: () => new Balances(), seen,
    getLogs: async (params: any) => {
      seen.push(params);
      if (params.eventAbi.startsWith("event Bought")) return buys;
      if (params.eventAbi.startsWith("event Transfer")) return payments.filter(p =>
        params.topics[2].toLowerCase().endsWith(p.args.to.slice(2).toLowerCase()));
      return [];
    },
  } as any;
}

test("counts Stripe sales and matching buybacks while prepaid crypto and eBay receipts count once", async t => {
  const crypto = bought(0, 250000000n, 250000000n, "0x" + "5".repeat(64));
  const stripe = bought(1, 0n, 100000000n, reference);
  const prepaid = bought(1, 0n, 50000000n, "0x" + "6".repeat(64));
  const opts = options("base", [crypto, stripe, prepaid], [
    transfer(user, wallet, 50000000n), // Prepaid crypto, already included in service receipts.
    transfer(user, wallet, 8000000000n), // DYLI buy-side eBay earnings.
    transfer(wallet, vault, 999000000n), // Internal sweep.
  ]);
  t.mock.method(axios, "get", async () => ({ data: {
    version: 1, complete: true, chainId: 8453, fromBlock, toBlock,
    stripeSales: [{ transactionHash: hash, blockNumber: fromBlock + 10,
      paymentReference: reference, grossAmount: "100000000", recognizedAmount: "100000000" }],
  } }));
  t.mock.method(tokens, "addTokensReceived", async (params: any) => {
    assert.ok(params.fromAdddesses); // Base purchases must use Bought, not arbitrary funding transfers.
    const out = new Balances(); out.value = 200000000n; return out as any;
  });
  const result: any = await fetchBase(opts);
  assert.equal(result.dailyVolume.value, 8400000000n);
  assert.equal(result.dailyFees.value, 8200000000n);
  assert.equal(result.dailyRevenue.value, 8200000000n);
});

test("continues only warehouse receipts on Abstract after contract migration", async () => {
  const opts = options("abstract", [], [transfer(user, vault, 50000000n), transfer(wallet, vault, 999000000n)]);
  opts.getFromBlock = async () => 87800000;
  opts.getToBlock = async () => 87801799;
  const result: any = await fetchAbstract(opts);
  assert.equal(result.dailyFees.value, 50000000n);
  assert.equal(result.dailyVolume.value, 50000000n);
  assert.ok(opts.seen.every((call: any) => call.eventAbi.startsWith("event Transfer")));
});

test("does not fetch or report Base before the migration", async () => {
  const opts = options("base", [], []);
  opts.startTimestamp = cutoff - 7200; opts.endTimestamp = cutoff - 3600;
  const result: any = await fetchBase(opts);
  assert.equal(result.dailyFees.value, 0n);
  assert.equal(opts.seen.length, 0);
});
