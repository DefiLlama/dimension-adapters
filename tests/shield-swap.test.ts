// Run: pnpm exec ts-node --transpile-only tests/shield-swap.test.ts
import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { Balances } from "@defillama/sdk";
import axios from "axios";
import { FetchOptions } from "../adapters/types";
import * as aleo from "../helpers/aleo";
import adapter from "../dexs/shield-swap";
import fixture from "./fixtures/shield-swap.json";

const AMM = "shield_swap.aleo";
const TERMS = "shield_swap_pricing_terms.aleo";
const USD = "212707628815602939926313406778312270053663804591730917421274098438979020915field";
const ZEC = "2679721602684747572764973622859521753039207964435861502200550930344051field";
const ALEO = "724721105858008932013114020280511843613117371369744086165619field";
const timestamp = 1793705000;
const options = { fromTimestamp: timestamp - 3600, toTimestamp: timestamp + 3600,
  startTimestamp: timestamp - 3600, endTimestamp: timestamp + 3601,
  createBalances: () => new Balances({ chain: "aleo" }) } as FetchOptions;
const n = (value: string) => BigInt(value.replace(/[ui]\d+$/, ""));
function plaintext(value: any): string {
  if (Array.isArray(value)) return `[${value.map(plaintext).join(", ")}]`;
  if (typeof value === "object") return `{ ${Object.entries(value).map(([k, v]) => `${k}: ${plaintext(v)}`).join(", ")} }`;
  return String(value);
}
function transition(program: string, fn: string, args: any[], id?: string): aleo.AleoTransition {
  return { program, function: fn, inputs: [], outputs: [
    ...(id ? [{ type: "public", value: id }] : []),
    { type: "future", value: plaintext({ _program_id: program, _function_name: fn, arguments: args }) },
  ] };
}
function setup(rows = structuredClone(fixture.swaps)) {
  const mappings = new Map<string, string | null>();
  const txs: Record<string, aleo.AleoTransition[]> = {};
  const calls = rows.map(r => ({ ...r.call, block_timestamp: timestamp }));
  for (const [key, pool] of Object.entries(fixture.pools)) mappings.set(`pools/${key}`, plaintext(pool));
  for (const row of rows) {
    txs[row.call.transaction_id] = [transition(AMM, row.call.function_id, [row.request], row.swap_id)];
    mappings.set(`swap_execution_headers/${row.swap_id}`, plaintext(row.header));
    row.hops.forEach((hop, i) => mappings.set(
      `swap_execution_hops/{ swap_id: ${row.swap_id}, hop_index: ${i}u8 }`, plaintext(hop)));
  }
  const reads: string[] = [];
  mock.method(aleo, "getAleoProgramCallsSince", async () => calls);
  mock.method(aleo, "getAleoTransactionTransitions", async (ids: string[]) => Object.fromEntries(ids.map(id => [id, txs[id]])));
  mock.method(aleo, "getAleoMappingValue", async (program: string, mapping: string, key: string) => {
    assert.equal(program, AMM);
    reads.push(`${mapping}/${key}`);
    const value = mappings.get(`${mapping}/${key}`);
    if (value === undefined) throw new Error(`Unexpected mapping read: ${mapping}/${key}`);
    return value;
  });
  const policy = (row: typeof rows[number], bps: bigint) => {
    const auth = transition(TERMS, "authorize_policy", [row.swap_id, row.hops[0].pool, `${bps}u16`]);
    auth.inputs = [row.swap_id, row.hops[0].pool, `${bps}u16`].map(value => ({ type: "public", value }));
    txs[row.call.transaction_id].push(auth, transition(TERMS, "clear_policy_permit", [row.swap_id]));
    return auth;
  };
  return { rows, calls, txs, mappings, reads, policy };
}
async function run() { return await adapter.fetch!(options) as Record<string, Balances>; }
function balance(result: Record<string, Balances>, metric: string, token: string) {
  return Number(result[metric].getBalances()[`coingecko:${token}`] ?? 0);
}
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) <= Math.max(1e-15, Math.abs(expected) * 1e-12), `${actual} != ${expected}`);
}
afterEach(() => mock.restoreAll());

test("all 21 mainnet swaps match their 28 recorded hop fees, including partial fills and three-hop routes", async () => {
  const { rows, reads } = setup();
  const result = await run();
  const tokens: Record<string, [string, number]> = {
    [USD]: ["usd-coin", 6], [ALEO]: ["aleo", 6], [ZEC]: ["zcash", 8],
    "1926848598207449231969field": ["ethereum", 18], "2000279227181771747937field": ["solana", 9],
  };
  const expected: Record<string, Record<string, number>> = {};
  for (const row of rows) for (const hop of row.hops) {
    const pool = fixture.pools[hop.pool as keyof typeof fixture.pools];
    const [token, decimals] = tokens[hop.zero_for_one === "true" ? pool.token0 : pool.token1];
    const amounts = { dailyVolume: n(hop.amount_in), dailyFees: n(hop.fee_paid), dailyRevenue: n(hop.protocol_fee),
      dailySupplySideRevenue: n(hop.fee_paid) - n(hop.protocol_fee) };
    for (const [metric, amount] of Object.entries(amounts)) {
      expected[metric] ??= {};
      expected[metric][token] = (expected[metric][token] ?? 0) + Number(amount) / 10 ** decimals;
    }
  }
  for (const [metric, tokens] of Object.entries(expected)) for (const [token, value] of Object.entries(tokens))
    near(balance(result, metric, token), value);
  assert.ok(reads.every(r => !r.startsWith("slots/") && !r.startsWith("pool_metadata/")));
  assert.notEqual(result.dailyUserFees, result.dailyFees);
  assert.deepEqual(result.dailyUserFees.getBalances(), result.dailyFees.getBalances());
  assert.notEqual(result.dailyProtocolRevenue, result.dailyRevenue);
  assert.deepEqual(result.dailyProtocolRevenue.getBalances(), result.dailyRevenue.getBalances());
});

test("the audited USDCx trade reports 0.153075 fees and 0.047835 revenue", async () => {
  setup([structuredClone(fixture.swaps[6])]);
  const result = await run();
  near(balance(result, "dailyVolume", "usd-coin"), 127.562125);
  near(balance(result, "dailyFees", "usd-coin"), 0.153075);
  near(balance(result, "dailyRevenue", "usd-coin"), 0.047835);
});

test("new swaps reflect fee changes, discounts and protocol splits across consecutive fetches", async () => {
  const s = setup([structuredClone(fixture.swaps[6])]);
  await run();
  for (const [id, fee, revenue] of [["900field", "250000u128", "125000u128"], ["901field", "0u128", "0u128"]]) {
    const row = s.rows[0];
    s.calls.splice(0, s.calls.length, { ...s.calls[0], transaction_id: id });
    s.txs[id] = [transition(AMM, "swap", [row.request], id)];
    s.mappings.set(`swap_execution_headers/${id}`, plaintext(row.header));
    s.mappings.set(`swap_execution_hops/{ swap_id: ${id}, hop_index: 0u8 }`,
      plaintext({ ...row.hops[0], fee_paid: fee, protocol_fee: revenue }));
    const result = await run();
    near(balance(result, "dailyFees", "usd-coin"), Number(n(fee)) / 1e6);
    near(balance(result, "dailyRevenue", "usd-coin"), Number(n(revenue)) / 1e6);
    near(balance(result, "dailyVolume", "usd-coin"), 127.562125);
  }
});

test("ZEC-input swaps are priced rather than skipped", async () => {
  const row = structuredClone(fixture.swaps[10]);
  row.request.zero_for_one = "true";
  row.request.amount_in = "100000000u128";
  Object.assign(row.hops[0], { zero_for_one: "true", amount_in: "100000000u128", fee_paid: "80000u128", protocol_fee: "25000u128" });
  setup([row]);
  const result = await run();
  near(balance(result, "dailyVolume", "zcash"), 1);
  near(balance(result, "dailyFees", "zcash"), 0.0008);
  near(balance(result, "dailyRevenue", "zcash"), 0.00025);
});

const policyRoutes = ["swap_arc20_with_policy", "swap_wrapped_with_policy", "swap_arc20_terms_and_policy", "swap_wrapped_terms_and_policy",
  "swap_mh_arc20_with_policy", "swap_mh_wrapped_with_policy", "swap_mh_arc20_terms_and_policy", "swap_mh_wrap_terms_and_policy"];
for (const route of policyRoutes) test(`${route}: additional charge accrues once to protocol, without LP fees or volume`, async () => {
  const row = structuredClone(fixture.swaps[route.startsWith("swap_mh_") ? 3 : 6]);
  const s = setup([row]);
  const baseline = await run();
  s.txs[row.call.transaction_id].push(transition("shield_swap_router.aleo", route, [], row.swap_id));
  s.policy(row, 20n);
  const result = await run();
  const charge = Number(n(row.request.amount_in) * 20n / 10000n) / 1e6;
  near(balance(result, "dailyFees", "usd-coin"), balance(baseline, "dailyFees", "usd-coin") + charge);
  near(balance(result, "dailyRevenue", "usd-coin"), balance(baseline, "dailyRevenue", "usd-coin") + charge);
  assert.deepEqual(result.dailyVolume.getBalances(), baseline.dailyVolume.getBalances());
  assert.deepEqual(result.dailySupplySideRevenue.getBalances(), baseline.dailySupplySideRevenue.getBalances());
});

test("a policy partial fill charges gross input, with bigint flooring, at the historical rate", async () => {
  const row = structuredClone(fixture.swaps[8]);
  row.request.amount_in = "900719925474099312345u128";
  const s = setup([row]);
  const auth = s.policy(row, 37n);
  const baseline = Number(n(row.hops[0].fee_paid)) / 1e6;
  let result = await run();
  near(balance(result, "dailyFees", "usd-coin"), baseline + Number(n(row.request.amount_in) * 37n / 10000n) / 1e6);
  auth.inputs[2].value = "0u16";
  result = await run();
  near(balance(result, "dailyFees", "usd-coin"), baseline);
});

test("policy fee remains payable when the whole net input is refunded", async () => {
  const row = structuredClone(fixture.swaps[6]);
  Object.assign(row.hops[0], { amount_in: "0u128", fee_paid: "0u128", protocol_fee: "0u128" });
  const s = setup([row]);
  s.policy(row, 20n);
  const result = await run();
  near(balance(result, "dailyFees", "usd-coin"), 0.255124);
  near(balance(result, "dailyRevenue", "usd-coin"), 0.255124);
  near(balance(result, "dailyVolume", "usd-coin"), 0);
  near(balance(result, "dailySupplySideRevenue", "usd-coin"), 0);
});

test("duplicate call rows do not double-count a router swap", async () => {
  const s = setup([structuredClone(fixture.swaps[6])]);
  s.calls.push({ ...s.calls[0] });
  near(balance(await run(), "dailyFees", "usd-coin"), 0.153075);
});

test("rejected swaps and calls outside the time window are excluded", async () => {
  const s = setup();
  for (const c of s.calls) c.status = "Rejected";
  s.calls[0].status = "Accepted";
  s.calls[0].block_timestamp = options.toTimestamp + 1;
  s.calls[1].status = "Accepted";
  s.calls[1].block_timestamp = options.fromTimestamp - 1;
  assert.deepEqual((await run()).dailyFees.getBalances(), {});
});

test("the runner's inclusive start and end seconds are counted", async () => {
  const s = setup([structuredClone(fixture.swaps[6])]);
  s.calls[0].block_timestamp = options.fromTimestamp;
  near(balance(await run(), "dailyFees", "usd-coin"), 0.153075);
  s.calls[0].block_timestamp = options.toTimestamp;
  near(balance(await run(), "dailyFees", "usd-coin"), 0.153075);
});

test("missing recent receipts fail rather than reporting estimated fees", async () => {
  const s = setup([structuredClone(fixture.swaps[6])]);
  s.mappings.set(`swap_execution_headers/${s.rows[0].swap_id}`, null);
  await assert.rejects(run, /missing execution receipt/);
});

test("missing or inconsistent hop receipts fail rather than omitting fees", async () => {
  const s = setup([structuredClone(fixture.swaps[6])]);
  const key = `swap_execution_hops/{ swap_id: ${s.rows[0].swap_id}, hop_index: 0u8 }`;
  s.mappings.set(key, null);
  await assert.rejects(run, /missing hop/);
  s.mappings.set(key, plaintext({ ...s.rows[0].hops[0], protocol_fee: "153076u128" }));
  await assert.rejects(run, /inconsistent hop/);
});

test("an unknown input token fails rather than silently lowering revenue", async () => {
  const s = setup([structuredClone(fixture.swaps[6])]);
  s.mappings.set(`pools/${s.rows[0].hops[0].pool}`, plaintext({ token0: ALEO, token1: "999field", fee: "800u16" }));
  await assert.rejects(run, /no price feed for token 999field/);
});

test("policy authorization must match the swap and first pool", async () => {
  const s = setup([structuredClone(fixture.swaps[6])]);
  const auth = s.policy(s.rows[0], 20n);
  auth.inputs[0].value = "123field";
  await assert.rejects(run, /no matching swap/);
  auth.inputs[0].value = s.rows[0].swap_id;
  auth.inputs[1].value = "999field";
  await assert.rejects(run, /invalid policy authorization/);
});

test("a missing policy rate fails instead of counting a zero charge", async () => {
  const s = setup([structuredClone(fixture.swaps[6])]);
  const auth = s.policy(s.rows[0], 20n);
  delete auth.inputs[2].value;
  await assert.rejects(run, /malformed policy authorization/);
});

test("a policy route without its authorization fails instead of omitting the additional charge", async () => {
  const s = setup([structuredClone(fixture.swaps[6])]);
  const row = s.rows[0];
  s.txs[row.call.transaction_id].push(transition("shield_swap_router.aleo", "swap_arc20_with_policy", [], row.swap_id));
  await assert.rejects(run, /missing policy authorization/);
});

test("pre-receipt estimates retain claims and use historical split changes rather than today's split", async () => {
  const row = structuredClone(fixture.swaps[6]);
  row.call.block_number = 21000000;
  const s = setup([row]);
  s.calls.push({ ...s.calls[0], transaction_id: "claim", function_id: "claim_swap_output" });
  s.txs.claim = [transition(AMM, "claim_swap_output", [row.swap_id, USD, ALEO, "1u128", "27562125u128"])];
  s.calls.push({ ...s.calls[0], transaction_id: "setter", function_id: "set_fee_protocol", block_number: 20999999 });
  s.txs.setter = [transition(AMM, "set_fee_protocol", ["aleo1admin", row.hops[0].pool, "8u8"])];
  const result = await run();
  near(balance(result, "dailyVolume", "usd-coin"), 100);
  near(balance(result, "dailyFees", "usd-coin"), 0.08);
  near(balance(result, "dailyRevenue", "usd-coin"), 0.04);
  assert.ok(s.reads.every(r => !r.startsWith("slots/")));
});

test("mapping struct keys are URL encoded", async () => {
  mock.restoreAll();
  const key = "{ swap_id: 123field, hop_index: 0u8 }";
  const get = mock.method(axios, "get", async (url: string) => {
    assert.equal(url, `https://api.provable.com/v2/mainnet/program/${AMM}/mapping/swap_execution_hops/${encodeURIComponent(key)}`);
    return { data: null };
  });
  assert.equal(await aleo.getAleoMappingValue(AMM, "swap_execution_hops", key), null);
  assert.equal(get.mock.callCount(), 1);
});
