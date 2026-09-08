import assert from "node:assert/strict";
import { test } from "node:test";
import { Interface } from "ethers";
import dividendReceipt from "./fixtures/shroom-dividend.json";
import { Balances } from "@defillama/sdk";
import token from "../fees/shroom";
import treasury, { fetchTreasuryDividends } from "../fees/shroom-treasury";
import { FetchOptions } from "../adapters/types";

const MU = "0xff080c8ce2e5feadaca0da81314ae59d232d4afd";
const DISTRIBUTOR = "0xea4036b0fccdb5f90421d5b9c35e05758e40ce18";
const wallets = ["0xad5bc794c2829e671a7f5c135ca85ff97a62638b", "0xfca196eacf630f67b505023c4f2cf7eb36da2f9f"];
const pad = (address: string) => "0x" + address.slice(2).padStart(64, "0");
const createBalances = () => new Balances({ chain: "robinhood" });
const amount = (balance: any) => BigInt(balance.getBalances()[`robinhood:${MU}`] || 0);
const receipt = (to: string, value: bigint) => ({ address: MU, args: { from: DISTRIBUTOR, to, value } });

test("token scope reports only dividend allocations, not LP income or treasury receipts", async () => {
  const result = await token.fetch!({ createBalances,
    api: { call: async () => 3000 },
    getLogs: async (query: any) => {
      assert.equal(query.target, "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044");
      assert.equal(query.topics[1], "0xbacecf788d2279f65da62d7bf69f4de28580a88bec56847c8d2ba6fbdd73f6eb");
      return [{ protocolAmount: 30n, creatorAmount: 403n, buybackAmount: 0n, tokensLocked: 0n }];
    },
  } as unknown as FetchOptions);
  assert.equal(amount(result.dailyFees), 433n);
  assert.equal(amount(result.dailyRevenue), 403n);
  assert.equal(amount(result.dailyHoldersRevenue), 403n);
  assert.equal(amount(result.dailySupplySideRevenue), 30n);
  assert.equal(result.dailyProtocolRevenue, undefined);
});

test("treasury receipts can land without a hook sweep or an LP collection in the window", async () => {
  const result = await treasury.fetch!({ createBalances,
    getLogs: async (query: any) => {
      assert.equal(query.noTarget, undefined);
      if (query.target !== MU) return []; // No treasury LP NFT history in this fixture.
      assert.match(query.eventAbi, /uint256 value/); // ERC20 value is not indexed.
      assert.deepEqual(query.topics.slice(1), [pad(DISTRIBUTOR), wallets.map(pad)]);
      return [receipt(wallets[0], 123n), receipt(wallets[1], 456n)];
    },
  } as unknown as FetchOptions);
  for (const key of ["dailyFees", "dailyRevenue", "dailyProtocolRevenue"]) assert.equal(amount(result[key]), 579n);
  assert.equal(result.dailyHoldersRevenue, undefined);
  assert.deepEqual(Object.keys((result.dailyRevenue as Balances).getBreakdownBalances()), ["MU Dividends To Treasury"]);
});

test("treasury dividend accounting rejects a wrong token, payer, or recipient", async () => {
  for (const invalid of [
    { ...receipt(wallets[0], 1n), address: wallets[0] },
    { address: MU, args: { from: wallets[1], to: wallets[0], value: 1n } },
    receipt(DISTRIBUTOR, 1n),
  ]) {
    await assert.rejects(fetchTreasuryDividends({ createBalances, getLogs: async () => [invalid] } as unknown as FetchOptions), /Unexpected transfer/);
  }
});

test("an unknown non-dividend hook allocation fails rather than inventing token revenue", async () => {
  await assert.rejects(token.fetch!({ createBalances, api: { call: async () => 3000 },
    getLogs: async () => [{ protocolAmount: 30n, creatorAmount: 403n, buybackAmount: 1n, tokensLocked: 0n }],
  } as unknown as FetchOptions), /non-dividend/);
});

test("a real MU dividend log decodes the non-indexed ERC20 amount", async () => {
  const balance = await fetchTreasuryDividends({ createBalances,
    getLogs: async (query: any) => {
      const decoded = new Interface([query.eventAbi]).parseLog(dividendReceipt)!;
      return [{ ...dividendReceipt, args: decoded.args }];
    },
  } as unknown as FetchOptions);
  assert.equal(amount(balance), BigInt(dividendReceipt.data));
});
