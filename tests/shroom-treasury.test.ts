import assert from "node:assert/strict";
import { test } from "node:test";
import { Interface, ZeroAddress, toBeHex } from "ethers";
import { feesFromTrace, treasuryOwnsAt } from "../fees/shroom-treasury";
import withdrawal from "./fixtures/shroom-withdrawal.json";

const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const POSM = "0x58daec3116aae6d93017baaea7749052e8a04fa7";
const TEAM = "0xad5bc794c2829e671a7f5c135ca85ff97a62638b";
const OTHER = "0x0000000000000000000000000000000000001234";
const abi = new Interface(["function modifyLiquidity((address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes) returns (int256,int256)"]);
const pack = (a: bigint, b: bigint) => BigInt.asIntN(256, (BigInt.asUintN(128, a) << 128n) | BigInt.asUintN(128, b));
function modification(delta: bigint, principal: bigint, fee0: bigint, fee1: bigint, hook = ZeroAddress) {
  return {
    type: "CALL", from: POSM, to: PM,
    input: abi.encodeFunctionData("modifyLiquidity", [[TEAM, OTHER, 3000, 60, hook], [-60, 60, delta, toBeHex(123, 32)], "0x"]),
    output: abi.encodeFunctionResult("modifyLiquidity", [pack(principal + fee0, principal + fee1), pack(fee0, fee1)]),
  };
}
test("withdrawals count fees and never returned principal; additions count fee credits", () => {
  for (const [delta, principal] of [[-100n, 10n ** 24n], [100n, -(10n ** 24n)], [0n, 0n]]) {
    const [result] = feesFromTrace(modification(delta, principal, 1234567n, 891011n));
    assert.equal(result.amount0, 1234567n); // Raw units: a 6-decimal token is not divided by 1e18.
    assert.equal(result.amount1, 891011n);
  }
});
test("real Robinhood withdrawal excludes 7.135292828933876549 tokens of principal", () => {
  const [fee] = feesFromTrace(withdrawal.trace);
  assert.equal(fee.amount0, 33423752494127154115851n);
  assert.equal(fee.amount1, 145011577679847408n);
  const [callerDelta] = abi.decodeFunctionResult("modifyLiquidity", withdrawal.trace.output);
  assert.equal(BigInt.asIntN(128, callerDelta) - fee.amount1, 7135292828933876549n);
});
test("batches preserve repeated calls and discard reverted subtrees and fake emitters", () => {
  const call = modification(-1n, 1000n, 5n, 7n);
  const result = feesFromTrace({ type: "CALL", calls: [call, call,
    { type: "CALL", error: "reverted", calls: [call] },
    { ...call, from: OTHER }, { ...call, type: "DELEGATECALL" },
  ] });
  assert.equal(result.length, 2);
  assert.equal(result.reduce((sum, fee) => sum + fee.amount0, 0n), 10n);
});
test("missing return data, negative fees, and liquidity-return-delta hooks fail visibly", () => {
  assert.throws(() => feesFromTrace({ ...modification(0n, 0n, 1n, 0n), output: "0x" }));
  assert.throws(() => feesFromTrace(modification(0n, 0n, -1n, 0n)), /Negative/);
  assert.throws(() => feesFromTrace(modification(-1n, 100n, 1n, 0n, toBeHex(1, 20))), /requires attribution/);
  // A dynamic swap hook with no liquidity-return-delta permission remains supported.
  assert.equal(feesFromTrace(modification(-1n, 100n, 1n, 0n, toBeHex(0x40, 20))).length, 1);
});
const change = { blockNumber: 10, logIndex: 20, transactionHash: "0xabc" };
function transfer(blockNumber: number, logIndex: number, to: string, transactionHash = "0xdef") {
  return { blockNumber, logIndex, transactionHash, args: { to } };
}
test("event-time ownership excludes sold positions and includes burns before withdrawal", () => {
  const acquired = transfer(9, 5, TEAM);
  assert.equal(treasuryOwnsAt(change, [acquired]), true);
  assert.equal(treasuryOwnsAt(change, [acquired, transfer(10, 19, OTHER)]), false);
  assert.equal(treasuryOwnsAt(change, [transfer(10, 21, TEAM)]), false);
  assert.equal(treasuryOwnsAt(change, [acquired, transfer(10, 19, ZeroAddress, "0xabc")]), true);
  assert.equal(treasuryOwnsAt(change, [acquired, transfer(10, 19, ZeroAddress)]), false);
  assert.equal(treasuryOwnsAt(change, []), false);
});
