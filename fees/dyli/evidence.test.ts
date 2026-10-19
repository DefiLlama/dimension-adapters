import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { Interface } from "ethers";
import * as receipts from "../../helpers/getTxReceipts";
import ADDRESSES from "../../helpers/coreAssets.json";
import { excludeInternalBridges, getStripePackSales } from "./evidence";

const hash = "0x" + "1".repeat(64);
const sourceHash = "0x" + "2".repeat(64);
const reference = "0x" + "3".repeat(64);
const wallet = "0xfb1302f5d6c5f107a0715b8ce7303d1e3c647807";
const user = "0x" + "4".repeat(40);
const internal = new Set([wallet]);
const options: any = { chain: "base", getFromBlock: async () => 52558927, getToBlock: async () => 52560726 };
const bought = { transactionHash: hash, blockNumber: 52559000,
  args: { user, paymentMode: 1n, grossAmount: 250000000n, onchainCost: 0n, paymentReference: reference } };
const sale = { transactionHash: hash, blockNumber: bought.blockNumber, paymentReference: reference,
  grossAmount: "250000000", recognizedAmount: "250000000" };
const response = (sales: any[]) => ({ data: { version: 1, chainId: 8453, fromBlock: 52558927, toBlock: 52560726,
  complete: true, stripeSales: sales } });

test("counts only verified Stripe amounts, not every prepaid purchase", async t => {
  t.mock.method(axios, "get", async () => response([sale]));
  const prepaidCrypto = { ...bought, args: { ...bought.args, paymentReference: sourceHash } };
  assert.equal(await getStripePackSales(options, [bought, prepaidCrypto], internal), 250000000n);
});

test("makes no evidence call for crypto-only or free purchases", async t => {
  const request = t.mock.method(axios, "get", async () => { throw Error("unexpected request"); });
  assert.equal(await getStripePackSales(options, [{ ...bought, args: { ...bought.args, paymentMode: 0n } }], internal), 0n);
  assert.equal(await getStripePackSales(options, [{ ...bought, args: { ...bought.args, grossAmount: 0n } }], internal), 0n);
  assert.equal(request.mock.callCount(), 0);
});

test("rejects duplicate, inflated, foreign, incomplete and malformed Stripe evidence", async t => {
  for (const sales of [
    [sale, sale], [{ ...sale, recognizedAmount: "250000001" }], [{ ...sale, transactionHash: sourceHash }],
    [{ ...sale, paymentReference: sourceHash }], [{ ...sale, blockNumber: bought.blockNumber + 1 }],
    [{ ...sale, grossAmount: "1" }], [{ ...sale, recognizedAmount: -1 }], [{ ...sale, recognizedAmount: 25 }],
  ]) {
    const mock = t.mock.method(axios, "get", async () => response(sales));
    await assert.rejects(getStripePackSales(options, [bought], internal), /does not match/);
    mock.mock.restore();
  }
  t.mock.method(axios, "get", async () => ({ data: { ...response([]).data, complete: false } }));
  await assert.rejects(getStripePackSales(options, [bought], internal), /Incomplete/);
});

test("reversed Stripe payments can contribute zero without removing buybacks", async t => {
  t.mock.method(axios, "get", async () => response([{ ...sale, recognizedAmount: "0" }]));
  assert.equal(await getStripePackSales(options, [bought], internal), 0n);
});

test("fails on an unavailable payment evidence endpoint", async t => {
  t.mock.method(axios, "get", async () => { throw Error("unavailable"); });
  await assert.rejects(getStripePackSales(options, [bought], internal), /unavailable/);
});

const bridgeLog = { transactionHash: hash, args: {
  from: "0xf70da97812cb96acdf810712aa562db8dfa3dbef", to: wallet, value: 688210687n,
} };
const bridgeProof = { version: 1, chainId: 8453, transactionHash: hash, recipient: wallet,
  internalTransfer: true, sourceChainId: 2741, sourceTransactionHash: sourceHash };
const transfers = new Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
const sourceReceipt = (from: string) => ({ status: 1, logs: [{ address: ADDRESSES.abstract.USDC,
  ...transfers.encodeEventLog(transfers.getEvent("Transfer")!, [from, user, 700000000n]) }] });

test("excludes a treasury bridge only after checking its onchain source", async t => {
  t.mock.method(axios, "get", async () => ({ data: bridgeProof }));
  t.mock.method(receipts, "getTxReceiptsWithRetry", async () => [sourceReceipt(wallet)] as any);
  const exclude = await excludeInternalBridges(options, [bridgeLog], internal);
  assert.equal(exclude(bridgeLog), true);
  assert.equal(exclude({ ...bridgeLog, transactionHash: sourceHash }), false);
});

test("retains a customer bridge payment", async t => {
  t.mock.method(axios, "get", async () => ({ data: { ...bridgeProof, internalTransfer: false } }));
  const exclude = await excludeInternalBridges(options, [bridgeLog], internal);
  assert.equal(exclude(bridgeLog), false);
});

test("rejects missing or non-internal source receipts instead of guessing", async t => {
  t.mock.method(axios, "get", async () => ({ data: bridgeProof }));
  const missing = t.mock.method(receipts, "getTxReceiptsWithRetry", async () => [null]);
  await assert.rejects(excludeInternalBridges(options, [bridgeLog], internal), /receipt is missing/);
  missing.mock.restore();
  t.mock.method(receipts, "getTxReceiptsWithRetry", async () => [sourceReceipt(user)] as any);
  t.mock.method(receipts, "getTransactionsWithRetry", async () => [{ from: user, value: 100n }] as any);
  await assert.rejects(excludeInternalBridges(options, [bridgeLog], internal), /not an internal/);
});

test("verifies internal native-ETH bridge funding without treating gas alone as funding", async t => {
  t.mock.method(axios, "get", async () => ({ data: bridgeProof }));
  t.mock.method(receipts, "getTxReceiptsWithRetry", async () => [{ status: 1, logs: [] }] as any);
  const funded = t.mock.method(receipts, "getTransactionsWithRetry", async () => [{ from: wallet, value: 50000000000000000n }] as any);
  const excluded = await excludeInternalBridges(options, [bridgeLog], internal);
  assert.equal(excluded(bridgeLog), true);
  funded.mock.restore();
  t.mock.method(receipts, "getTransactionsWithRetry", async () => [{ from: wallet, value: 0n }] as any);
  await assert.rejects(excludeInternalBridges(options, [bridgeLog], internal), /not an internal/);
});

test("does not accept a reverted source transaction", async t => {
  t.mock.method(axios, "get", async () => ({ data: bridgeProof }));
  t.mock.method(receipts, "getTxReceiptsWithRetry", async () => [{ ...sourceReceipt(wallet), status: 0 }] as any);
  await assert.rejects(excludeInternalBridges(options, [bridgeLog], internal), /transaction failed/);
});
