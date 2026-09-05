import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeBytes32String } from "ethers";
import { Balances } from "@defillama/sdk";
import { accountSuite, Fee } from "./accounting";
import { chainConfig, Suite, ZERO } from "./config";
import { EventKind, events, Log } from "./events";
import adapter from "./index";
import type { FetchOptions } from "../../adapters/types";

// Synthetic identities and integer amounts; these fixtures never access a chain.
const creator = "0x0000000000000000000000000000000000000001";
const treasury = "0x0000000000000000000000000000000000000002";
const referrer = "0x0000000000000000000000000000000000000003";
const stock = "0x0000000000000000000000000000000000000004";
const poolId = "0x" + "11".repeat(32);
const suite: Suite = { factory: "0x" + "aa".repeat(20), hook: "0x" + "bb".repeat(20), escrow: "0x" + "cc".repeat(20),
  firstBlock: 1, minimal: true, route: "dual", launchFee: "native" };
function log(kind: EventKind, args: Record<string, any>, blockNumber: number, logIndex = 0, transactionHash = `tx-${blockNumber}`): Log {
  return { kind, args, blockNumber, logIndex, transactionHash,
    address: kind === "credit" ? suite.escrow : ["trade", "pool", "component"].includes(kind) ? suite.hook : suite.factory };
}
function history(quote = ZERO, originalCreator = creator): Log[] {
  return [log("supply", { supply: 10n ** 27n }, 1),
    log("minimalQuote", { quote, decimals: 18, tick: 0, revision: 1n }, 2),
    log("pool", { poolId, creator: originalCreator, treasury }, 3),
    log("launch", { poolId, quote, creator: originalCreator, supply: 10n ** 27n }, 4)];
}
function bundle(block = 100, currency = ZERO, minimal = true, recipients = [creator, referrer, treasury], amounts = [30n, 10n, 61n]): Log[] {
  const result: Log[] = [];
  let index = 0;
  for (let i = 0; i < recipients.length; i++) {
    const data = { recipient: recipients[i], currency, amount: amounts[i] };
    result.push(log("credit", data, block, index++));
    if (minimal) result.push(log("component", { ...data, poolId, componentId: encodeBytes32String(["CREATOR", "REFERRER", "PLATFORM"][i]) }, block, index++));
  }
  result.push(log("trade", { poolId, feeCurrency: currency, referrer, totalFee: amounts.reduce((x, y) => x + y, 0n) }, block, index));
  return result;
}
function totals(fees: Fee[]) {
  return fees.reduce((t, f) => ({ fees: t.fees + f.fees, revenue: t.revenue + f.revenue,
    creator: t.creator + f.creator, referrer: t.referrer + f.referrer }), { fees: 0n, revenue: 0n, creator: 0n, referrer: 0n });
}
const historical: Suite = { ...suite, minimal: false, route: "standard", launchFee: "none" };

test("minimal fees count credits once and preserve actual surcharge/remainder", () => {
  const result = accountSuite(suite, [ZERO], [...bundle(), ...history()], 100, 100);
  assert.deepEqual(totals(result), { fees: 101n, creator: 30n, referrer: 10n, revenue: 61n });
  assert.equal(result[0].market, "Crypto");
});

test("historical creator and treasury sharing a wallet remain separate destinations", () => {
  const result = accountSuite(historical, [ZERO], [...history(ZERO, treasury), ...bundle(100, ZERO, false, [treasury, referrer, treasury])], 100, 100);
  assert.deepEqual(totals(result), { fees: 101n, creator: 30n, referrer: 10n, revenue: 61n });
});

test("earliest historical referral overlaps retain the event-order attribution", () => {
  for (const shared of [creator, treasury]) {
    const data = bundle(100, ZERO, false, [creator, shared, treasury]).map(l => l.kind === "trade"
      ? { ...l, args: { ...l.args, referrer: shared } } : l);
    assert.deepEqual(totals(accountSuite(historical, [ZERO], [...history(), ...data], 100, 100)),
      { fees: 101n, creator: 30n, referrer: 10n, revenue: 61n });
  }
});

test("new CREATOR component follows its actual recipient after rights transfer", () => {
  const result = accountSuite(suite, [ZERO], [...history(), ...bundle(100, ZERO, true, [stock, referrer, treasury])], 100, 100);
  assert.equal(result[0].creator, 30n);
});

test("unused referral allocation is counted only through the actual platform credit", () => {
  for (const minimal of [false, true]) {
    const data = bundle(100, ZERO, minimal).filter(l => l.args.recipient !== referrer).map(l => {
      if (l.args.recipient === treasury) return { ...l, args: { ...l.args, amount: 71n } };
      if (l.kind === "trade") return { ...l, args: { ...l.args, referrer: ZERO } };
      return l;
    });
    assert.deepEqual(totals(accountSuite(minimal ? suite : historical, [ZERO], [...history(), ...data], 100, 100)),
      { fees: 101n, creator: 30n, referrer: 0n, revenue: 71n });
  }
});

test("multiple same-pool swaps in one transaction do not share credits", () => {
  const first = bundle(), second = bundle().map(l => ({ ...l, logIndex: l.logIndex + 10 }));
  const result = accountSuite(suite, [ZERO], [...history(), ...first, ...second], 100, 100);
  assert.equal(result.length, 2);
  assert.equal(totals(result).fees, 202n);
});

test("zero-fee swaps emitting no hook events cannot shift later fee attribution", () => {
  const first = bundle().map(l => ({ ...l, logIndex: l.logIndex + 20 }));
  assert.equal(accountSuite(suite, [ZERO], [...history(), ...first], 100, 100)[0].fees, 101n);
});

test("missing, duplicate and cross-pool components are rejected", () => {
  const good = [...history(), ...bundle()];
  assert.throws(() => accountSuite(suite, [ZERO], good.filter(l => !(l.kind === "component" && l.logIndex === 1)), 100, 100), /orphan component|component total/);
  const duplicate = good.map(l => l.kind === "component" && l.logIndex === 3
    ? { ...l, args: { ...l.args, componentId: encodeBytes32String("CREATOR") } } : l);
  assert.throws(() => accountSuite(suite, [ZERO], duplicate, 100, 100), /duplicate fee component/);
  const crossPool = good.map(l => l.kind === "component" ? { ...l, args: { ...l.args, poolId: "different-pool" } } : l);
  assert.throws(() => accountSuite(suite, [ZERO], crossPool, 100, 100), /cross-pool/);
  assert.throws(() => accountSuite(suite, [ZERO], [...good, good[good.length - 1]], 100, 100), /duplicate log/);
});

test("orphan credits, mismatched totals/currencies and unknown pools fail closed", () => {
  assert.throws(() => accountSuite(suite, [ZERO], [...history(), ...bundle().filter(l => l.kind !== "trade")], 100, 100), /without Trade/);
  const wrongTotal = bundle().map(l => l.kind === "trade" ? { ...l, args: { ...l.args, totalFee: 102n } } : l);
  assert.throws(() => accountSuite(suite, [ZERO], [...history(), ...wrongTotal], 100, 100), /credits do not match/);
  const wrongCurrency = bundle().map(l => l.kind === "trade" ? { ...l, args: { ...l.args, feeCurrency: stock } } : l);
  assert.throws(() => accountSuite(suite, [ZERO], [...history(), ...wrongCurrency], 100, 100), /credits do not match/);
  assert.throws(() => accountSuite(suite, [ZERO], bundle(), 100, 100), /unknown pool/);
});

test("protocol fixed components retain their role with arbitrary IDs and different destination wallets", () => {
  const b = bundle();
  b.forEach(l => { if (l.kind === "trade") { l.logIndex += 2; l.args.totalFee += 7n; } });
  b.splice(b.length - 1, 0, log("credit", { recipient: treasury, currency: ZERO, amount: 7n }, 100, 6),
    log("component", { recipient: treasury, currency: ZERO, amount: 7n, poolId, componentId: "0x" + "ff".repeat(32) }, 100, 7));
  assert.equal(accountSuite(suite, [ZERO], [...history(), ...b], 100, 100)[0].revenue, 68n);
  const external = b.map(l => l.logIndex === 6 || l.logIndex === 7 ? { ...l, args: { ...l.args, recipient: stock } } : l);
  assert.equal(accountSuite(suite, [ZERO], [...history(), ...external], 100, 100)[0].revenue, 68n);
});

test("registered Base crypto majors retain Crypto classification", () => {
  for (const quote of chainConfig.base.cryptoQuotes) {
    assert.equal(accountSuite(suite, chainConfig.base.cryptoQuotes, [...history(quote), ...bundle(100, quote)], 100, 100)[0].market, "Crypto");
  }
  assert.throws(() => accountSuite(suite, [], [...history(stock).filter(l => l.kind !== "minimalQuote"), ...bundle(100, stock)], 100, 100), /unknown launch quote/);
});

test("stock prices follow intra-block ticks and the supply at each price-bearing event", () => {
  const old = bundle(100, stock);
  const update = log("tick", { quote: stock, tick: 100, previousTick: 0, revision: 2n }, 100, 10);
  const next = bundle(100, stock).map(l => ({ ...l, logIndex: l.logIndex + 20 }));
  const supplyChange = log("supply", { supply: 2n * 10n ** 27n }, 90);
  const result = accountSuite(suite, [], [...history(stock), supplyChange, ...old, update, ...next], 100, 100);
  assert.equal(result[0].stockPrice, 4000 / 1e27);
  assert.equal(result[1].stockPrice, 4000 / (Math.pow(1.0001, 100) * 2e27));
});

test("unregistration closes pricing and re-registration opens a new interval", () => {
  const unregistered = log("minimalUnregister", { quote: stock, revision: 2n }, 90);
  const register = log("minimalQuote", { quote: stock, decimals: 8, tick: 200, revision: 3n }, 110);
  const result = accountSuite(suite, [], [...history(stock), unregistered, ...bundle(100, stock), register, ...bundle(120, stock)], 100, 120);
  assert.equal(result[0].stockPrice, undefined);
  assert.equal(result[1].stockPrice, 4000 / (Math.pow(1.0001, 200) * 1e27));
  assert.throws(() => accountSuite(suite, [], [...history(stock), log("tick", { quote: stock, tick: 1, revision: 1n }, 100)], 100, 100), /revision/);
});

test("ordinary and atomic native launch fees match before and after Launched", () => {
  for (const paymentIndex of [0, 20]) {
    const data = history();
    data.pop();
    data.push(log("nativeFeeConfig", { amount: 12n }, 80));
    data.push(log("launch", { poolId, quote: ZERO, creator }, 100, 1));
    data.push(log("nativeLaunchFee", { payer: creator, recipient: treasury, amount: 12n }, 100, paymentIndex));
    if (paymentIndex > 1) data.push(...bundle().map(l => ({ ...l, logIndex: l.logIndex + 2 })),
      log("launchBuy", { poolId, originalCreator: creator }, 100, paymentIndex + 1));
    const result = accountSuite(suite, [ZERO], data, 100, 100);
    assert.equal(result.filter(f => f.launch).length, 1);
    assert.equal(result.find(f => f.launch)!.revenue, 12n);
  }
});

test("missing, wrong-payer, wrong-amount and orphan launch payments fail", () => {
  const data = history();
  data.pop();
  data.push(log("nativeFeeConfig", { amount: 12n }, 80), log("launch", { poolId, quote: ZERO, creator }, 100, 1));
  assert.throws(() => accountSuite(suite, [ZERO], data, 100, 100), /missing or ambiguous launch fee/);
  for (const [payer, paid] of [[referrer, 12n], [creator, 13n]] as const) {
    assert.throws(() => accountSuite(suite, [ZERO], [...data, log("nativeLaunchFee", { payer, amount: paid }, 100, 2)], 100, 100), /launch fee/);
  }
  assert.throws(() => accountSuite(suite, [ZERO], [...history(), log("nativeLaunchFee", { payer: creator, amount: 12n }, 100)], 100, 100), /without Launched/);
});

test("bundled atomic and ordinary creations by the same payer have disjoint launch payments", () => {
  const data = history().filter(l => l.kind !== "launch");
  data.push(log("nativeFeeConfig", { amount: 12n }, 80));
  for (const [index, id, atomic] of [[0, poolId, true], [10, "second-pool", false], [20, "third-pool", true]] as const) {
    data.push(log("launch", { poolId: id, quote: ZERO, creator }, 100, index + 1),
      log("nativeLaunchFee", { payer: creator, recipient: treasury, amount: 12n }, 100, index + (atomic ? 2 : 0)));
    if (atomic) data.push(log("launchBuy", { poolId: id, originalCreator: creator }, 100, index + 3));
  }
  const result = accountSuite(suite, [ZERO], data, 100, 100);
  assert.equal(result.length, 3);
  assert.equal(totals(result).revenue, 36n);
  assert.throws(() => accountSuite(suite, [ZERO], data.filter(l => l.kind !== "launchBuy"), 100, 100), /launch fee/);
});

test("zero launch fees need no payment event", () => {
  const data = history();
  data[data.length - 1].blockNumber = 100;
  assert.deepEqual(accountSuite(suite, [ZERO], data, 100, 100), []);
});

test("historical per-quote launch fee survives tick updates but resets after re-registration", () => {
  const s: Suite = { ...historical, launchFee: "quote" };
  const data = history(stock).filter(l => l.kind !== "launch");
  data.push(log("quoteFeeConfig", { quote: stock, amount: 12n }, 80), log("quote", { quote: stock, decimals: 18, tick: 3 }, 90));
  data.push(log("launchFee", { payer: creator, recipient: treasury, currency: stock, amount: 12n }, 100, 0),
    log("launch", { poolId, quote: stock, creator }, 100, 1));
  assert.equal(accountSuite(s, [], data, 100, 100)[0].fees, 12n);
  data.push(log("unregister", { quote: stock }, 110), log("quote", { quote: stock, decimals: 18, tick: 4 }, 120),
    log("launch", { poolId: "second-pool", quote: stock, creator }, 130));
  assert.equal(accountSuite(s, [], data, 100, 130).length, 1);
});

test("legacy non-quote fees retain the documented exclusion; current suites reject them", () => {
  const data = [...history(), ...bundle(100, stock, false)];
  assert.deepEqual(accountSuite(historical, [ZERO], data, 100, 100), []);
  assert.throws(() => accountSuite(suite, [ZERO], [...history(), ...bundle(100, stock)], 100, 100), /unexpected non-quote/);
});

test("adapter uses disjoint windows, returns four dimensions and preserves stock token breakdown", async () => {
  const deployed = chainConfig.base.suites.find(s => s.minimal)!;
  const offset = deployed.firstBlock;
  const data = [...history(stock), ...bundle(100, stock), ...bundle(101, stock)].map(l => ({ ...l, blockNumber: l.blockNumber + offset }));
  const requests: { fromBlock?: number; toBlock?: number }[] = [];
  const run = async (start: number, end: number, conflict = false) => {
    const options = {
      chain: "base", getFromBlock: async () => offset + start, getToBlock: async () => offset + end,
      createBalances: () => new Balances({ chain: "base", timestamp: 1788613200 }),
      getLogs: async (p: any) => {
        assert.equal(p.noTarget, undefined);
        assert.ok(p.eventAbi && p.targets?.length);
        requests.push(p);
        const kind = (Object.entries(events).find(([, abi]) => abi === p.eventAbi))![0];
        const target = kind === "credit" ? deployed.escrow : ["trade", "pool", "component"].includes(kind) ? deployed.hook : deployed.factory;
        if (p.targets[0] !== target) return [];
        return data.filter(l => l.kind === kind && l.blockNumber >= p.fromBlock && l.blockNumber <= p.toBlock)
          .flatMap(l => [{ ...l, address: target }, { ...l, address: target,
            args: conflict && l.kind === "trade" ? { ...l.args, totalFee: l.args.totalFee + 1n } : l.args }]);
      },
    } as unknown as FetchOptions;
    return await adapter.fetch!(options) as Record<string, Balances>;
  };
  const first = await run(99, 100), second = await run(100, 101), together = await run(99, 101);
  assert.deepEqual(Object.keys(together).sort(), ["dailyFees", "dailyRevenue", "dailyProtocolRevenue", "dailySupplySideRevenue"].sort());
  const id = `base:${stock}`;
  for (const key of Object.keys(together)) assert.equal(together[key]._usdBalances[id], Number(first[key]._usdBalances[id]) + Number(second[key]._usdBalances[id]));
  assert.equal(together.dailyFees._usdBalances[id], 202 * 4000 / 1e27);
  assert.ok(requests.some(p => p.fromBlock === offset + 100 && p.toBlock === offset + 101));
  assert.equal(adapter.version, 2);
  assert.equal(adapter.pullHourly, true);
  assert.equal(adapter.dependencies, undefined);
  assert.equal(adapter.prefetch, undefined);
  assert.equal(chainConfig.base.suites.length + chainConfig.robinhood.suites.length, 11);
  await assert.rejects(run(99, 100, true), /Conflicting o1 Launchpad log/);
});

test("failed block resolution never becomes a scan from genesis", async () => {
  const options = { chain: "base", getFromBlock: async () => null, getToBlock: async () => 50000000,
    getLogs: async () => { throw new Error("must not query logs"); } } as unknown as FetchOptions;
  await assert.rejects(adapter.fetch!(options), /Invalid o1 Launchpad block interval/);
});

test("historical pool lookup follows the creation block of the traded pool", async () => {
  const deployed = chainConfig.base.suites[0], offset = deployed.firstBlock;
  const data = [...history(), ...bundle(100, ZERO, false)].map(l => ({ ...l,
    blockNumber: offset + (l.kind === "pool" ? 4 : l.blockNumber), logIndex: l.kind === "launch" ? 1 : l.logIndex }));
  data.push(log("launch", { poolId: "inactive-pool", quote: ZERO, creator }, offset + 90));
  const poolRequests: any[] = [];
  const options = {
    chain: "base", getFromBlock: async () => offset + 99, getToBlock: async () => offset + 100,
    createBalances: () => new Balances({ chain: "base" }),
    getLogs: async (p: any) => {
      const kind = Object.entries(events).find(([, abi]) => abi === p.eventAbi)![0];
      const target = kind === "credit" ? deployed.escrow : ["trade", "pool", "component"].includes(kind) ? deployed.hook : deployed.factory;
      if (p.targets[0] !== target) return [];
      if (kind === "pool") poolRequests.push(p);
      return data.filter(l => l.kind === kind && l.blockNumber >= p.fromBlock && l.blockNumber <= p.toBlock)
        .map(l => ({ ...l, address: target }));
    },
  } as unknown as FetchOptions;
  const result = await adapter.fetch!(options) as Record<string, Balances>;
  assert.equal(Object.values(result.dailyFees.getBalances()).map(Number).reduce((a, b) => a + b, 0), 101);
  assert.equal(poolRequests.length, 1);
  assert.equal(poolRequests[0].fromBlock, offset + 3); // SDK single-block workaround includes the preceding block.
  assert.equal(poolRequests[0].toBlock, offset + 4);
});
