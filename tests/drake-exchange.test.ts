import assert from "node:assert/strict";
import { test } from "node:test";
import { Interface } from "ethers";
import { setProvider } from "@defillama/sdk";
import { getCommissionTransfers, ASSET_TRANSFERRED_EVENT } from "../fees/drake-exchange/feeTransfers";
import adapter from "../fees/drake-exchange";
import type { FetchOptions } from "../adapters/types";

const TOKEN = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a";
const VAULT = "0x8379c32A965a7Bac7289893AA3861f01dD470049";
const HELPER = "0x4939AEf78CD2Dc2bAE5bf9DA51C61A113Cae909a";
const PORTFOLIO = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const token = new Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
const helper = new Interface([ASSET_TRANSFERRED_EVENT]);
function transfer(to: string, amount: bigint, from = PORTFOLIO, address = TOKEN) {
    return { address, ...token.encodeEventLog(token.getEvent("Transfer")!, [from, to, amount]) };
}
function fee(amount: bigint, action = 3) {
    return { address: HELPER, ...helper.encodeEventLog(helper.getEvent("AssetTransferred")!, [PORTFOLIO, action, -amount]) };
}
function sequence(vaultAmount: bigint, revenue: bigint, recipient = OPERATOR) {
    return [...(vaultAmount ? [transfer(VAULT, vaultAmount)] : []), ...(revenue ? [transfer(recipient, revenue)] : []), fee(vaultAmount + revenue)];
}
const parse = (logs: ReturnType<typeof fee>[]) => getCommissionTransfers(logs, TOKEN, HELPER, VAULT);

test("mixed taker and maker retain their separate venue allocations", () => {
    const rows = parse([...sequence(350000n, 650000n), ...sequence(100000n, 900000n)]);
    assert.deepEqual(rows.map(r => [r.vaultAmount, r.revenue]), [[350000n, 650000n], [100000n, 900000n]]);
});
test("multiple fills do not overwrite the earlier allocation", () => {
    assert.deepEqual(parse([...sequence(100n, 900n), ...sequence(600n, 400n)]).map(r => r.revenue), [900n, 400n]);
});
test("preserves contract rounding exactly", () => {
    assert.deepEqual(parse(sequence(1001n, 9000n)).map(r => [r.amount, r.vaultAmount, r.revenue]), [[10001n, 1001n, 9000n]]);
});
test("historical split changes require no hardcoded schedule", () => {
    for (const vaultAmount of [600n, 400n, 200n, 300n, 600n])
        assert.equal(parse(sequence(vaultAmount, 1000n - vaultAmount))[0].vaultAmount, vaultAmount);
});
test("captures a rate change within one transaction", () => {
    assert.deepEqual(parse([...sequence(200n, 800n), ...sequence(600n, 400n)]).map(r => r.revenue), [800n, 400n]);
});
test("operator recipient changes are read from actual transfers", () => {
    assert.equal(parse(sequence(100n, 900n, OTHER))[0].revenue, 900n);
});
test("zero operator allocation routes everything to the vault", () => {
    assert.equal(parse(sequence(1000n, 0n))[0].vaultAmount, 1000n);
});
test("zero vault allocation routes everything to the operator", () => {
    assert.equal(parse(sequence(0n, 1000n))[0].revenue, 1000n);
});
test("zero fee does not consume preceding unrelated transfers", () => {
    assert.equal(parse([transfer(VAULT, 200n), fee(0n)])[0].amount, 0n);
});
test("does not count earlier PnL or other fee-category transfers", () => {
    assert.equal(parse([transfer(VAULT, 9000n), fee(9000n, 4), ...sequence(100n, 900n)])[0].amount, 1000n);
});
test("rejects an incomplete transfer sequence", () => {
    assert.throws(() => parse([transfer(VAULT, 100n), fee(1000n)]), /do not reconcile/);
});
test("rejects a transfer from another portfolio", () => {
    assert.throws(() => parse([transfer(VAULT, 1000n, OTHER), fee(1000n)]), /do not reconcile/);
});
test("rejects a transfer of another token", () => {
    assert.throws(() => parse([transfer(VAULT, 1000n, PORTFOLIO, OTHER), fee(1000n)]), /do not reconcile/);
});
test("rejects excess transfers instead of treating PnL as fees", () => {
    assert.throws(() => parse([transfer(VAULT, 2000n), fee(1000n)]), /do not reconcile/);
});

class Balances {
    amount = 0n;
    labels = new Set<string>();
    add(_token: string, amount: bigint, label: string) { this.amount += BigInt(amount); this.labels.add(label); }
}
async function fetchFixture(receipt: any, feeAmount = 10001n) {
    let requests = 0;
    setProvider("monad", { getTransactionReceipt: async () => { requests++; return receipt; } } as any);
    const options = {
        chain: "monad", createBalances: () => new Balances(),
        getLogs: async ({ eventAbi }: { eventAbi: string }) => {
            if (eventAbi.includes("TakerOrderExecuted")) return [{ args: { orderbookVolume: "5000", vaultVolume: "5000", executionPrice: "1000000" } }];
            if (eventAbi.includes("AssetTransferred")) return [
                { transactionHash: "0xabc", args: { _actionType: "3", _amountIn: -feeAmount } },
                { transactionHash: "0xabc", args: { _actionType: 4n, _amountIn: -20n } },
            ];
            if (eventAbi.includes("totalFBFee")) return [{ totalFBFee: "10" }, { totalFBFee: "-10" }];
            return [{ fundingFee: "-20", borrowingFee: "50" }, { fundingFee: "-50", borrowingFee: "20" }];
        },
    } as unknown as FetchOptions;
    const result = await adapter.fetch!(options) as any;
    return { result, requests };
}
test("adapter preserves one-sided volume, decoder types, both FB ABIs and exact invariant", async () => {
    const { result, requests } = await fetchFixture({ transactionHash: "0xabc", logs: sequence(1001n, 9000n) });
    assert.equal(requests, 1);
    assert.equal(result.dailyVolume.amount, 1000000n);
    assert.equal(result.dailyFees.amount, 10061n);
    assert.equal(result.dailyRevenue.amount, 9000n);
    assert.equal(result.dailySupplySideRevenue.amount, 1061n);
    assert.equal(result.dailyFees.amount, result.dailyRevenue.amount + result.dailySupplySideRevenue.amount);
    assert.equal(result.dailyProtocolRevenue, result.dailyRevenue);
    const methodology = adapter.breakdownMethodology as Record<string, Record<string, string>>;
    for (const [dimension, balances] of Object.entries(result)) {
        const name = dimension.replace(/^daily/, "");
        for (const label of (balances as Balances).labels) assert.ok(methodology[name]?.[label], `${name}: ${label}`);
    }
});
test("adapter fails on receipt/log disagreement", async () => {
    await assert.rejects(fetchFixture({ transactionHash: "0xabc", logs: sequence(100n, 900n) }), /logs do not reconcile/);
});
test("adapter retries missing receipts and fails rather than returning incomplete data", async () => {
    await assert.rejects(fetchFixture(null), /Missing Drake commission receipt/);
});
