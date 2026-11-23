import test from "node:test";
import assert from "node:assert/strict";
import { Balances } from "@defillama/sdk";
import * as tokens from "../../helpers/token";
import * as requests from "../../utils/fetchURL";
import * as receipts from "../../helpers/getTxReceipts";
import { Interface } from "ethers";
import ADDRESSES from "../../helpers/coreAssets.json";
import adapter from "./index";

const wallet = "0xfb1302f5d6c5f107a0715b8ce7303d1e3c647807";
const vault = "0x04eaa73b518783010a5a5dc471eea89c4c34ef44";
const user = "0x" + "1".repeat(40);
const helper = "0x4e86614c26f22f3bddd93aeee07479159159fa54";
const auction = "0xed6947f6ff6b0c7e861891d3f5f4cad4d8667834";
const hash = "0x" + "2".repeat(64);
const reference = "0x" + "3".repeat(64);
const fromBlock = 53998927, toBlock = fromBlock + 1799;
const usdc = ADDRESSES.base.USDC;
const units = (usd: number) => BigInt(usd) * 1_000_000n;
const amount = (balance: Balances) => Object.values(balance.getBalances()).reduce((sum, value) => sum + BigInt(String(value)), 0n);
const buy = (mode: number, gross: number) => ({ transactionHash: hash, blockNumber: fromBlock + 10,
  args: { user, paymentMode: mode, grossAmount: units(gross), onchainCost: mode ? 0n : units(gross), paymentReference: reference } });
const stripeEvidence = (recognized = 100, gross = 100) => ({ version: 1, chainId: 8453, fromBlock, toBlock, complete: true,
  stripeSales: [{ transactionHash: hash, blockNumber: fromBlock + 10, paymentReference: reference,
    grossAmount: String(units(gross)), recognizedAmount: String(units(recognized)) }] });

function setup({ chain = "base", buys = [] as any[], finalized = [] as any[], settled = [] as any[], cancelled = [] as any[],
  payments = [] as any[], listings = [] as any[], trades = [] as any[], auctions = [] as any[],
  auctionStates = [] as any[], auctionPremiums = [] as any[] } = {}) {
  const calls: any[] = [];
  const options: any = {
    chain, startTimestamp: 1794326400, endTimestamp: 1794330000,
    createBalances: () => new Balances({ chain }),
    getFromBlock: async () => fromBlock, getToBlock: async () => toBlock,
    toApi: { multiCall: async (params: any) => {
      calls.push(params);
      assert.equal(params.target.toLowerCase(), auction);
      if (params.abi.startsWith("function auctions(")) return auctionStates;
      assert.ok(params.abi.startsWith("function premium("));
      assert.deepEqual(params.calls.map((call: any) => call.params), auctions.filter(log => BigInt(log.amount) > 0n)
        .map((log, i) => [log.amount, auctionStates[i][10]]));
      return auctionPremiums;
    } },
    getLogs: async (params: any) => {
      calls.push(params);
      if (params.eventAbi.startsWith("event Bought(")) return buys;
      if (params.eventAbi.startsWith("event Finalized(")) return finalized;
      if (params.eventAbi.startsWith("event BuybackSettled(")) {
        assert.equal(params.target.toLowerCase(), helper);
        return settled;
      }
      if (params.eventAbi.startsWith("event ExpiredBuyCancelled(")) return cancelled;
      if (params.eventAbi.startsWith("event Settled(")) {
        assert.equal(params.target.toLowerCase(), auction);
        return auctions;
      }
      if (params.eventAbi.startsWith("event ListingBought(")) return listings;
      if (params.eventAbi.startsWith("event OrderAccepted(")) return trades;
      if (params.eventAbi.startsWith("event Transfer(")) return payments.filter(log => params.topics[2].toLowerCase().endsWith(log.args.to.slice(2).toLowerCase()));
      return [];
    },
  };
  return { options, calls, fetch: () => (adapter.adapter as any)[chain].fetch(options) };
}

test("counts a claim-then-sell batch once as turnover and subtracts it from net fees", async t => {
  t.mock.method(tokens, "addTokensReceived", async () => { throw Error("Base payouts must use settlement events"); });
  const run = setup({ buys: [buy(0, 100)], finalized: [{ user, totalBuyBack: 0n, totalRefund: 0n }],
    settled: [{ seller: user, payout: units(80) }] });
  const result = await run.fetch();
  assert.equal(amount(result.dailyVolume), units(180));
  assert.equal(amount(result.dailyFees), units(20));
  assert.equal(amount(result.dailyRevenue), units(20));
  assert.equal(amount(result.dailyProtocolRevenue), units(20));
  assert.ok(!run.calls.some(call => /ClaimBought|InventoryAdded|TransferSingle/.test(call.eventAbi)));
  assert.deepEqual(Object.keys(result.dailyFees._breakdownBalances), ["Card Sales"]);
  assert.deepEqual(Object.keys(result.dailyVolume._breakdownBalances), []);
});

test("adds a verified Stripe purchase once and deducts its treasury-funded sell-back", async t => {
  t.mock.method(requests, "httpGet", async () => stripeEvidence());
  const result = await setup({ buys: [buy(1, 100)], settled: [{ seller: user, payout: units(80) }] }).fetch();
  assert.equal(amount(result.dailyVolume), units(180));
  assert.equal(amount(result.dailyFees), units(20));
});

test("uses refunded Stripe goods amounts, not the full original card charge", async t => {
  t.mock.method(requests, "httpGet", async () => stripeEvidence(60));
  const result = await setup({ buys: [buy(1, 100)] }).fetch();
  assert.equal(amount(result.dailyVolume), units(60));
  assert.equal(amount(result.dailyFees), units(60));
});

test("does not count unverified prepaid purchases or arbitrary treasury outflows", async t => {
  t.mock.method(requests, "httpGet", async () => ({ ...stripeEvidence(), stripeSales: [] }));
  const result = await setup({ buys: [buy(1, 100)] }).fetch();
  assert.equal(amount(result.dailyVolume), 0n);
  assert.equal(amount(result.dailyFees), 0n);
});

test("keeps prepaid crypto and buy-side eBay receipts counted once and filters internal sweeps", async t => {
  t.mock.method(requests, "httpGet", async () => ({ ...stripeEvidence(), stripeSales: [] }));
  const payments = [[user, wallet, 100], [user, wallet, 8000], [wallet, vault, 500]].map(([from, to, value]) => ({
    transactionHash: hash, args: { from, to, value: units(Number(value)) },
  }));
  const result = await setup({ buys: [buy(1, 100)], payments }).fetch();
  assert.equal(amount(result.dailyVolume), units(8100));
  assert.equal(amount(result.dailyFees), units(8100));
});

test("excludes a verified treasury bridge from Avalanche instead of counting it as a sale", async t => {
  const sourceHash = "0x" + "5".repeat(64);
  t.mock.method(requests, "httpGet", async () => ({ transactionHash: hash, recipient: wallet,
    internalTransfer: true, sourceChainId: 43114, sourceTransactionHash: sourceHash }));
  const abi = new Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
  t.mock.method(receipts, "getTxReceiptsWithRetry", async chain => {
    assert.equal(chain, "avax");
    return [{ status: 1, logs: [{ address: ADDRESSES.avax.USDC,
      ...abi.encodeEventLog(abi.getEvent("Transfer")!, [wallet, user, units(1000)]) }] }] as any;
  });
  t.mock.method(receipts, "getTransactionsWithRetry", async () => [{ from: wallet, value: 0n }] as any);
  const result = await setup({ payments: [{ transactionHash: hash,
    args: { from: "0xf70da97812cb96acdf810712aa562db8dfa3dbef", to: wallet, value: units(999) } }] }).fetch();
  assert.equal(amount(result.dailyVolume), 0n);
  assert.equal(amount(result.dailyFees), 0n);
});

test("counts direct sell-backs separately from full and partial refund payouts", async () => {
  const result = await setup({ buys: [buy(0, 250)],
    finalized: [{ user, totalBuyBack: units(50), totalRefund: units(20) }],
    settled: [{ seller: user, payout: units(40) }], cancelled: [{ user, refund: units(30) }],
  }).fetch();
  assert.equal(amount(result.dailyVolume), units(340));
  assert.equal(amount(result.dailyFees), units(110));
});

test("allows sell-backs larger than this period's purchases without flooring fees", async () => {
  const result = await setup({ buys: [buy(0, 250)], settled: [{ seller: user, payout: units(1500) }] }).fetch();
  assert.equal(amount(result.dailyVolume), units(1750));
  assert.equal(amount(result.dailyFees), units(-1250));
  assert.equal(amount(result.dailyRevenue), units(-1250));
});

test("does not count internal customer addresses as pack sales or sell-backs", async () => {
  const result = await setup({ buys: [{ ...buy(0, 100), args: { ...buy(0, 100).args, user: wallet } }],
    finalized: [{ user: wallet, totalBuyBack: units(70), totalRefund: units(10) }],
    settled: [{ seller: wallet, payout: units(80) }], cancelled: [{ user: wallet, refund: units(20) }],
  }).fetch();
  assert.equal(amount(result.dailyVolume), 0n);
  assert.equal(amount(result.dailyFees), 0n);
});

test("keeps full secondary-marketplace volume and only its 5% commission", async () => {
  const result = await setup({ listings: [{ args: { amount: 1n, pricePerItem: units(100) } }] }).fetch();
  assert.equal(amount(result.dailyVolume), units(100));
  assert.equal(amount(result.dailyFees), units(5));
});

test("does not add the marketplace commission again as a service-wallet payment", async () => {
  const result = await setup({ listings: [{ transactionHash: hash, args: { amount: 1n, pricePerItem: units(100) } }],
    payments: [{ transactionHash: hash, args: { from: user, to: wallet, value: units(5) } }],
  }).fetch();
  assert.equal(amount(result.dailyVolume), units(100));
  assert.equal(amount(result.dailyFees), units(5));
});

test("keeps full Base P2P payment volume and only the platform commission", async t => {
  const abi = new Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
  t.mock.method(receipts, "getTxReceiptsWithRetry", async () => [{ logs: [[user, "0x" + "4".repeat(40), units(975)], [user, wallet, units(25)]].map(args => ({
    address: usdc, ...abi.encodeEventLog(abi.getEvent("Transfer")!, args),
  })) }] as any);
  const result = await setup({ trades: [{ transactionHash: hash }] }).fetch();
  assert.equal(amount(result.dailyVolume), units(1000));
  assert.equal(amount(result.dailyFees), units(25));
});

const auctionState = (seller: string, hammer: bigint, premiumBps = 1000n) =>
  [seller, 1n, hammer, 0n, 1n, user, hammer, 1n, true, false, premiumBps];

test("counts a settled external-seller auction in full but only its earned premium as fees", async () => {
  const result = await setup({ auctions: [{ id: reference, recipient: user, amount: units(100) }],
    auctionStates: [auctionState("0x" + "4".repeat(40), units(100))], auctionPremiums: [units(10)],
    payments: [{ transactionHash: hash, args: { from: auction, to: wallet, value: units(10) } }],
  }).fetch();
  assert.equal(amount(result.dailyVolume), units(110));
  assert.equal(amount(result.dailyFees), units(10));
});

test("includes DYLI-owned auction seller receipts once without counting treasury settlement twice", async () => {
  const result = await setup({ auctions: [{ id: reference, recipient: user, amount: units(100) }],
    auctionStates: [auctionState(wallet, units(100))], auctionPremiums: [units(10)],
    payments: [100, 10].map(value => ({ transactionHash: hash, args: { from: auction, to: wallet, value: units(value) } })),
  }).fetch();
  assert.equal(amount(result.dailyVolume), units(110));
  assert.equal(amount(result.dailyFees), units(110));
});

test("uses the auction's actual premium result and saved rate, including cent rounding", async () => {
  const hammer = units(100) + 10000n, premium = units(12) + 510000n;
  const result = await setup({ auctions: [{ id: reference, recipient: user, amount: hammer }],
    auctionStates: [auctionState("0x" + "4".repeat(40), hammer, 1250n)], auctionPremiums: [premium],
  }).fetch();
  assert.equal(amount(result.dailyVolume), hammer + premium);
  assert.equal(amount(result.dailyFees), premium);
});

test("does not count auction bid escrow, refunds, unsold returns or DYLI's own bids as sales", async () => {
  const run = setup({ auctions: [{ id: reference, recipient: user, amount: 0n }, { id: reference, recipient: wallet, amount: units(100) }],
    payments: [[user, auction], [auction, user], [auction, wallet]].map(([from, to]) => ({
      transactionHash: hash, args: { from, to, value: units(110) },
    })),
  });
  const result = await run.fetch();
  assert.equal(amount(result.dailyVolume), 0n);
  assert.equal(amount(result.dailyFees), 0n);
  assert.ok(!run.calls.some(call => call.abi || /event (Bid|Cancelled|RefundPending)\(/.test(call.eventAbi)));
});

test("keeps nonrefundable auction launch charges as earned service receipts", async () => {
  const result = await setup({ payments: [{ transactionHash: hash, args: { from: user, to: wallet, value: units(5) } }] }).fetch();
  assert.equal(amount(result.dailyFees), units(5));
  assert.equal(amount(result.dailyVolume), units(5));
});

test("fails closed if the auction state is absent or does not match the settlement", async () => {
  const log = { id: reference, recipient: user, amount: units(100) };
  await assert.rejects(setup({ auctions: [log] }).fetch(), /Incomplete DYLI auction settlement state/);
  await assert.rejects(setup({ auctions: [log], auctionStates: [auctionState(user, units(99))],
    auctionPremiums: [units(10)] }).fetch(), /does not match its settlement/);
});

test("fails when Stripe verification is unavailable instead of publishing partial totals", async t => {
  t.mock.method(requests, "httpGet", async () => { throw Error("evidence unavailable"); });
  await assert.rejects(setup({ buys: [buy(1, 100)] }).fetch(), /evidence unavailable/);
});

test("rejects duplicate or mismatched Stripe evidence instead of inflating either metric", async t => {
  const sale = stripeEvidence().stripeSales[0];
  for (const sales of [[sale, sale], [{ ...sale, grossAmount: "1" }],
    [{ ...sale, blockNumber: fromBlock - 1 }], [{ ...sale, recognizedAmount: "100000001" }],
    [{ ...sale, recognizedAmount: -1 }], [{ ...sale, transactionHash: "0x" + "9".repeat(64) }]]) {
    const request = t.mock.method(requests, "httpGet", async () => ({ ...stripeEvidence(), stripeSales: sales }));
    await assert.rejects(setup({ buys: [buy(1, 100)] }).fetch(), /does not match a Bought event/);
    request.mock.restore();
  }
});

test("rejects a different Stripe evidence window", async t => {
  t.mock.method(requests, "httpGet", async () => ({ ...stripeEvidence(), fromBlock: fromBlock - 1 }));
  await assert.rejects(setup({ buys: [buy(1, 100)] }).fetch(), /Incomplete DYLI Stripe evidence/);
});

test("keeps post-migration Abstract warehouse receipts without querying Base helpers", async () => {
  const run = setup({ chain: "abstract", payments: [{ transactionHash: hash, args: { from: user, to: vault, value: units(50) } }] });
  run.options.getFromBlock = async () => 87800000;
  run.options.getToBlock = async () => 87801799;
  const result = await run.fetch();
  assert.equal(amount(result.dailyVolume), units(50));
  assert.equal(amount(result.dailyFees), units(50));
  assert.ok(run.calls.every(call => call.eventAbi.startsWith("event Transfer(")));
});

test("never queries Base contracts before the migration", async () => {
  const run = setup();
  run.options.startTimestamp = 1791900000;
  run.options.endTimestamp = 1791903600;
  const result = await run.fetch();
  assert.equal(amount(result.dailyVolume), 0n);
  assert.equal(amount(result.dailyFees), 0n);
  assert.equal(run.calls.length, 0);
});

test("preserves the pre-migration Abstract payout calculation", async t => {
  const run = setup({ chain: "abstract" });
  run.options.getFromBlock = async () => 87500000;
  run.options.getToBlock = async () => 87501799;
  t.mock.method(tokens, "addTokensReceived", async (params: any) => {
    const balance = new Balances({ chain: "abstract" });
    balance.add(ADDRESSES.abstract.USDC, params.fromAdddesses ? units(80) : params.targets.length === 3 && params.targets[0].startsWith("0x4584") ? units(10) : units(100));
    return balance;
  });
  const result = await run.fetch();
  assert.equal(amount(result.dailyVolume), units(110));
  assert.equal(amount(result.dailyFees), units(30));
});
