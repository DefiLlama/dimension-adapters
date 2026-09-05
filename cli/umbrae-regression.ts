// GPT-6 Astra via opencode. Run: node -r ts-node/register cli/umbrae-regression.ts
// Deterministic contract-boundary regressions with native SDK decoding/Balances;
// real-chain validation remains: npm test -- fees umbrae <YYYY-MM-DD>.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Balances, ChainApi } from "@defillama/sdk";
import { getLogParams } from "@defillama/sdk/build/util/logs";
import { Interface } from "ethers";
import { FetchOptions, FetchResultV2 } from "../adapters/types";
import adapter from "../dexs/umbrae";

const FACTORY = "0xD14322b444415d78DBBF646BB369Ec325a1aCD5c";
const PAIR = "0x296964C34a571fCf85d3F74FB815ee871F5A08d4";
const TOKEN_X = "0x14a4e80d633af55ace1160c320f5a36d41cced3e";
const TOKEN_Y = "0x4200000000000000000000000000000000000006";
const FROM_BLOCK = 51000000;
const EVENTS = {
  token: "event FeeTokenUpdated(address indexed feeToken)",
  protocol: "event ProtocolFeesClaimed(address indexed recipient,uint256 amount)",
  lp: "event LPFeesClaimed(address indexed holder,address indexed recipient,uint256 amount)",
  swap: "event Swap(address indexed sender,address indexed recipient,uint256 amountXIn,uint256 amountYIn,uint256 amountXOut,uint256 amountYOut,uint16 feeBps)",
};
type Snapshot = { token: string; protocol: bigint; lp: bigint };

function log(kind: keyof typeof EVENTS, values: (string | bigint)[], logIndex: number) {
  const iface = new Interface([EVENTS[kind]]);
  return { ...iface.encodeEventLog(iface.fragments[0].format(), values), address: PAIR, blockNumber: FROM_BLOCK + 1, logIndex };
}

async function fetchCase(after: Snapshot, logs: ReturnType<typeof log>[], before?: Snapshot): Promise<FetchResultV2> {
  // Only the IO boundary is supplied. Unknown calls fail rather than receiving
  // scripted answers by call index; all logs pass through the installed SDK.
  function api(start: boolean): ChainApi {
    return Object.assign(new ChainApi({ chain: "base", block: FROM_BLOCK + (start ? 0 : 100) }), {
      call: async (): Promise<never> => { throw new Error("Unexpected regression call"); },
      fetchList: async (params: { targets: string[]; lengthAbi: string; itemAbi: string }): Promise<string[]> => {
        assert.equal(params.lengthAbi, "uint256:allPairsLength");
        assert.equal(params.itemAbi, "function allPairs(uint256) view returns (address)");
        return params.targets.includes(FACTORY) && (!start || before) ? [PAIR] : [];
      },
      multiCall: async (params: { calls: string[]; abi: string }): Promise<string[]> => params.calls.map(target => {
        assert.equal(target, PAIR);
        const state = start ? before : after;
        assert.ok(state, "A new pair must not be called at the opening snapshot");
        switch (params.abi) {
          case "address:tokenX": return TOKEN_X;
          case "address:tokenY": return TOKEN_Y;
          case "address:feeToken": return state.token;
          case "uint256:protocolFeesAccumulated": return state.protocol.toString();
          case "uint256:lpFeesAccumulated": return state.lp.toString();
          default: throw new Error("Unexpected regression ABI");
        }
      }),
    });
  }
  // Fetch only consumes this subset; other FetchOptions fields are intentionally absent.
  const options = {
    api: api(false), fromApi: api(true),
    getFromBlock: async () => FROM_BLOCK, getToBlock: async () => FROM_BLOCK + 100,
    createBalances: () => new Balances({ chain: "base" }),
    getLogs: async (params: Parameters<FetchOptions["getLogs"]>[0]) => {
      assert.equal(params.fromBlock, FROM_BLOCK + 1);
      assert.equal(params.toBlock, FROM_BLOCK + 100);
      const { transformLog, topics } = await getLogParams({ ...params, chain: "base", onlyArgs: !params.entireLog });
      const result = (params.targets ?? [params.target]).map(target => logs
        .filter(event => event.address === target && event.topics[0] === topics![0])
        .map(event => transformLog({ ...event })));
      return params.flatten === false ? result : result.flat();
    },
  } as FetchOptions;
  return adapter.fetch!(options);
}

function amount(result: FetchResultV2, metric: string, token: string): bigint {
  const balance = result[metric];
  assert.ok(balance instanceof Balances);
  return BigInt(balance.getBalances()[`base:${token}`] ?? 0);
}

function expectFees(result: FetchResultV2, token: string, protocol: bigint, lp: bigint): void {
  assert.equal(amount(result, "dailyRevenue", token), protocol);
  assert.equal(amount(result, "dailySupplySideRevenue", token), lp);
  assert.equal(amount(result, "dailyFees", token), protocol + lp);
}

test("GPT-6 Astra: new pair, first update, then swap succeeds", async () => {
  const result = await fetchCase({ token: TOKEN_X, protocol: 5n, lp: 95n }, [
    log("token", [TOKEN_X], 1),
    log("swap", [PAIR, PAIR, 10000n, 0n, 0n, 1n, 100n], 2),
  ]);
  expectFees(result, TOKEN_X, 5n, 95n);
  expectFees(result, TOKEN_Y, 0n, 0n);
  assert.equal(amount(result, "dailyVolume", TOKEN_X), 10000n);
});

test("new pair handles multiple same-block updates, repeated tokens and claims", async () => {
  const result = await fetchCase({ token: TOKEN_Y, protocol: 3n, lp: 57n }, [
    log("token", [TOKEN_X], 1), log("token", [TOKEN_X], 2),
    log("swap", [PAIR, PAIR, 10000n, 0n, 0n, 1n, 100n], 3),
    log("protocol", [PAIR, 5n], 4), log("lp", [PAIR, PAIR, 95n], 5),
    log("token", [TOKEN_Y], 6),
    log("swap", [PAIR, PAIR, 0n, 6000n, 1n, 0n, 100n], 7),
  ].reverse());
  expectFees(result, TOKEN_X, 5n, 95n);
  expectFees(result, TOKEN_Y, 3n, 57n);
  assert.equal(amount(result, "dailyVolume", TOKEN_X), 10000n);
  assert.equal(amount(result, "dailyVolume", TOKEN_Y), 6000n);
});

test("zero claims before the first update do not require the initial token", async () => {
  const result = await fetchCase({ token: TOKEN_X, protocol: 5n, lp: 95n }, [
    log("protocol", [PAIR, 0n], 1), log("token", [TOKEN_X], 2),
    log("swap", [PAIR, PAIR, 10000n, 0n, 0n, 1n, 100n], 3),
  ]);
  expectFees(result, TOKEN_X, 5n, 95n);
});

for (const kind of ["protocol", "lp"] as const) {
  test(`nonzero initial ${kind} claims fail instead of guessing the opposite token`, async () => {
    await assert.rejects(fetchCase({ token: TOKEN_X, protocol: 0n, lp: 0n }, [
      log(kind, kind === "protocol" ? [PAIR, 1n] : [PAIR, PAIR, 1n], 1),
      log("token", [TOKEN_X], 2),
    ]), /nonzero DAMM claims.*initialization history/);
  });
}

test("existing pair retains known pre-update claims across rotations", async () => {
  const result = await fetchCase({ token: TOKEN_X, protocol: 2n, lp: 38n }, [
    log("swap", [PAIR, PAIR, 0n, 10000n, 1n, 0n, 100n], 1),
    log("protocol", [PAIR, 15n], 2), log("lp", [PAIR, PAIR, 185n], 3), log("token", [TOKEN_X], 4),
    log("swap", [PAIR, PAIR, 4000n, 0n, 0n, 1n, 100n], 5),
  ], { token: TOKEN_Y, protocol: 10n, lp: 90n });
  expectFees(result, TOKEN_Y, 5n, 95n);
  expectFees(result, TOKEN_X, 2n, 38n);
});

test("new pair without updates can attribute its initial claims", async () => {
  const result = await fetchCase({ token: TOKEN_Y, protocol: 3n, lp: 57n }, [
    log("swap", [PAIR, PAIR, 0n, 10000n, 1n, 0n, 100n], 1),
    log("protocol", [PAIR, 2n], 2), log("lp", [PAIR, PAIR, 38n], 3),
  ]);
  expectFees(result, TOKEN_Y, 5n, 95n);
});
