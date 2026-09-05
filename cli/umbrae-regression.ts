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

// Real addresses identify fixtures only; no network calls are made by these tests.
// DAMM factory: https://basescan.org/address/0xD14322b444415d78DBBF646BB369Ec325a1aCD5c#code
const FACTORY = "0xD14322b444415d78DBBF646BB369Ec325a1aCD5c";
// U1/WETH DAMM pair: https://basescan.org/address/0x296964C34a571fCf85d3F74FB815ee871F5A08d4#code
const PAIR = "0x296964C34a571fCf85d3F74FB815ee871F5A08d4";
// Legacy DLMM factory: https://basescan.org/address/0x17Da44dcbdffD8c715be7A368E19F252C2940Fee#code
const DLMM_FACTORY = "0x17Da44dcbdffD8c715be7A368E19F252C2940Fee";
// U1/WETH DLMM pair: https://basescan.org/address/0x697B72320656e6Dc60Db7A4Bfb95084C9D9C55A0#code
const DLMM_PAIR = "0x697B72320656e6Dc60Db7A4Bfb95084C9D9C55A0";
// Canonical U1 token: https://basescan.org/address/0x14a4e80d633af55ace1160c320f5a36d41cced3e#code
const TOKEN_X = "0x14a4e80d633af55ace1160c320f5a36d41cced3e";
// Canonical Base WETH: https://basescan.org/address/0x4200000000000000000000000000000000000006#code
const TOKEN_Y = "0x4200000000000000000000000000000000000006";
// Holder vault: https://basescan.org/address/0xf771F202e8B49612e83f18B68D6b268765A40F72#code
const VAULT = "0xf771F202e8B49612e83f18B68D6b268765A40F72";
// Fee treasury: https://basescan.org/address/0x4247dba63CeD88B862c7578B77187AFf0C745014#code
const TREASURY = "0x4247dba63CeD88B862c7578B77187AFf0C745014";
// Synthetic external donor; not a deployed protocol address or a funded account.
const EXTERNAL_FUNDER = "0x000000000000000000000000000000000000beef";
// Synthetic window after all configured deployments, not a historical fixture.
// Events occupy its first included block; 100 blocks leave both bounds distinct.
const FROM_BLOCK = 51000000;
const TO_BLOCK = FROM_BLOCK + 100;
// Event amounts, fee splits and bin IDs are synthetic inputs, not historical measurements.
const EVENTS = {
  token: "event FeeTokenUpdated(address indexed feeToken)",
  protocol: "event ProtocolFeesClaimed(address indexed recipient,uint256 amount)",
  lp: "event LPFeesClaimed(address indexed holder,address indexed recipient,uint256 amount)",
  swap: "event Swap(address indexed sender,address indexed recipient,uint256 amountXIn,uint256 amountYIn,uint256 amountXOut,uint256 amountYOut,uint16 feeBps)",
  dlmm: "event SwapDetailed(address indexed sender,address indexed recipient,uint256 amountIn,uint256 amountOut,uint24 startBinId,uint24 endBinId,uint256 binsTraversed,uint256 totalFee,uint256 protocolFee,uint256 lpFee,bool swapForY)",
  rewards: "event RewardsAdded(address indexed funder,uint256 amount,uint256 newRewardIndex)",
};
type Snapshot = { token: string; protocol: bigint; lp: bigint };
type FixtureLog = { data: string; topics: string[]; address: string; blockNumber: number; logIndex: number };

/**
 * Encode a fixture event so the installed SDK must decode the real ABI shape.
 * @param kind Event type and emitting contract.
 * @param values Event arguments in ABI order.
 * @param logIndex Position within the synthetic block, including same-block updates.
 * @returns Encoded log in the adapter's requested window.
 */
function log(kind: keyof typeof EVENTS, values: (string | bigint | boolean)[], logIndex: number): FixtureLog {
  const iface = new Interface([EVENTS[kind]]);
  const address = kind === "rewards" ? VAULT : kind === "dlmm" ? DLMM_PAIR : PAIR;
  return { ...iface.encodeEventLog(iface.fragments[0].format(), values), address, blockNumber: FROM_BLOCK + 1, logIndex };
}

/**
 * Exercise the adapter against explicit snapshots and ABI-decoded logs, without IO.
 * @param after Ending DAMM fee state.
 * @param logs Window events; DLMM events also enable that pair in discovery.
 * @param before Opening DAMM state, absent when the pair is newly created.
 * @returns Native balance objects from the unchanged adapter entry point.
 */
async function fetchCase(after: Snapshot, logs: ReturnType<typeof log>[], before?: Snapshot): Promise<FetchResultV2> {
  // Only the IO boundary is supplied. Unknown calls fail rather than receiving
  // scripted answers by call index; all logs pass through the installed SDK.
  /**
   * Supply only the contract reads this fixture defines; reject unexpected reads.
   * @param start Whether to expose the opening rather than ending snapshot.
   * @returns SDK client with network methods replaced by deterministic responses.
   */
  function api(start: boolean): ChainApi {
    return Object.assign(new ChainApi({ chain: "base", block: start ? FROM_BLOCK : TO_BLOCK }), {
      call: async (params: { target: string; abi: string }): Promise<string> => {
        assert.equal(params.target, VAULT);
        assert.equal(params.abi, "address:rewardToken");
        return TOKEN_Y;
      },
      fetchList: async (params: { targets: string[]; lengthAbi: string; itemAbi: string }): Promise<string[]> => {
        assert.equal(params.lengthAbi, "uint256:allPairsLength");
        assert.equal(params.itemAbi, "function allPairs(uint256) view returns (address)");
        if (params.targets.includes(DLMM_FACTORY) && logs.some(event => event.address === DLMM_PAIR)) return [DLMM_PAIR];
        return params.targets.includes(FACTORY) && (!start || before) ? [PAIR] : [];
      },
      multiCall: async (params: { calls: string[]; abi: string }): Promise<string[]> => params.calls.map(target => {
        assert.ok(target === PAIR || target === DLMM_PAIR);
        if (params.abi === "address:tokenX") return TOKEN_X;
        if (params.abi === "address:tokenY") return TOKEN_Y;
        assert.equal(target, PAIR);
        const state = start ? before : after;
        assert.ok(state, "A new pair must not be called at the opening snapshot");
        switch (params.abi) {
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
    getFromBlock: async (): Promise<number> => FROM_BLOCK, getToBlock: async (): Promise<number> => TO_BLOCK,
    createBalances: () => new Balances({ chain: "base" }),
    getLogs: async (params: Parameters<FetchOptions["getLogs"]>[0]) => {
      assert.equal(params.fromBlock, FROM_BLOCK + 1);
      assert.equal(params.toBlock, TO_BLOCK);
      const { transformLog, topics } = await getLogParams({ ...params, chain: "base", onlyArgs: !params.entireLog });
      const result = (params.targets ?? [params.target]).map(target => logs
        .filter(event => event.address === target && event.topics[0] === topics![0])
        .map(event => transformLog({ ...event })));
      return params.flatten === false ? result : result.flat();
    },
  } as FetchOptions;
  return adapter.fetch!(options);
}

/**
 * Read an exact token amount while requiring the requested metric to exist.
 * @param result Adapter balances.
 * @param metric Required dimension name.
 * @param token Token address within Base.
 * @returns Raw token units, or zero for an absent token in an existing metric.
 */
function amount(result: FetchResultV2, metric: string, token: string): bigint {
  const balance = result[metric];
  assert.ok(balance instanceof Balances);
  return BigInt(balance.getBalances()[`base:${token}`] ?? 0);
}

/**
 * Assert fee conservation and gross treasury accrual independently of funding.
 * @param result Adapter balances.
 * @param token Fee denomination.
 * @param protocol Expected non-LP swap-fee accrual, excluding holder funding.
 * @param lp Expected LP swap-fee accrual.
 * @returns Nothing; throws when any accounting assertion fails.
 */
function expectFees(result: FetchResultV2, token: string, protocol: bigint, lp: bigint): void {
  assert.equal(amount(result, "dailyRevenue", token), protocol);
  assert.equal(amount(result, "dailyProtocolRevenue", token), protocol);
  assert.equal(amount(result, "dailySupplySideRevenue", token), lp);
  assert.equal(amount(result, "dailyFees", token), protocol + lp);
  assert.equal(amount(result, "dailyUserFees", token), protocol + lp);
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

test("DAMM gross treasury accrual excludes nonzero holder funding", async () => {
  const result = await fetchCase({ token: TOKEN_Y, protocol: 5n, lp: 95n }, [
    log("swap", [PAIR, PAIR, 0n, 10000n, 1n, 0n, 100n], 1),
    log("rewards", [TREASURY, 200n, 200n], 2),
  ]);
  expectFees(result, TOKEN_Y, 5n, 95n);
  expectFees(result, TOKEN_X, 0n, 0n);
  assert.equal(amount(result, "dailyHoldersRevenue", TOKEN_Y), 200n);
});

for (const swapForY of [true, false]) {
  test(`DLMM ${swapForY ? "X to Y" : "Y to X"} gross treasury accrual excludes external holder funding`, async () => {
    const result = await fetchCase({ token: TOKEN_Y, protocol: 0n, lp: 0n }, [
      log("dlmm", [DLMM_PAIR, DLMM_PAIR, 10000n, 9900n, 8388608n, 8388608n, 0n, 100n, 5n, 95n, swapForY], 1),
      log("rewards", [EXTERNAL_FUNDER, 200n, 200n], 2),
    ]);
    expectFees(result, swapForY ? TOKEN_X : TOKEN_Y, 5n, 95n);
    expectFees(result, swapForY ? TOKEN_Y : TOKEN_X, 0n, 0n);
    assert.equal(amount(result, "dailyHoldersRevenue", TOKEN_Y), 200n);
    assert.equal(amount(result, "dailyVolume", swapForY ? TOKEN_X : TOKEN_Y), 10000n);
  });
}

for (const funder of [TREASURY, EXTERNAL_FUNDER]) {
  test(`holder-only ${funder === TREASURY ? "delayed treasury" : "external"} funding creates no new fee revenue`, async () => {
    const state = { token: TOKEN_Y, protocol: 10n, lp: 90n };
    const result = await fetchCase(state, [log("rewards", [funder, 200n, 200n], 1)], state);
    expectFees(result, TOKEN_Y, 0n, 0n);
    expectFees(result, TOKEN_X, 0n, 0n);
    assert.equal(amount(result, "dailyHoldersRevenue", TOKEN_Y), 200n);
  });
}
