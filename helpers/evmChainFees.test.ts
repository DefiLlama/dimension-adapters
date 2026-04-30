import assert from "assert/strict";
import { Balances } from "@defillama/sdk";
import {
  EVM_CHAIN_METRIC_CONFIGS,
  createEvmChainFeesAdapter,
  fetchEvmChainMetrics,
  getReceiptMetrics,
  hydrateReceiptsWithTransactions,
  makeBlockChunks,
} from "./evmChainFees";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const receiptMetrics = getReceiptMetrics([
    {
      from: "0x1111111111111111111111111111111111111111",
      gasUsed: "0x5208",
      effectiveGasPrice: "0x3b9aca00",
    },
    {
      from: "0x1111111111111111111111111111111111111111",
      gasUsed: "21000",
      gasPrice: "2000000000",
    },
    {
      from: "0x2222222222222222222222222222222222222222",
      gasUsed: 42_000,
      effectiveGasPrice: 3_000_000_000,
    },
  ]);

  assert.equal(receiptMetrics.transactionCount, 3);
  assert.equal(receiptMetrics.activeUsers, 2);
  assert.equal(receiptMetrics.totalGasUsed.toString(), "84000");
  assert.equal(receiptMetrics.totalFeesWei.toString(), "189000000000000");

  assert.deepEqual(makeBlockChunks(10, 16, 3), [
    { fromBlock: 10, toBlock: 12 },
    { fromBlock: 13, toBlock: 15 },
    { fromBlock: 16, toBlock: 16 },
  ]);
  assert.deepEqual(makeBlockChunks(20, 10, 3), []);
  assert.throws(
    () => makeBlockChunks(10, 16, Number.NaN),
    /Invalid block chunk size: NaN/,
  );
  assert.throws(
    () => makeBlockChunks(10, 16, Number.POSITIVE_INFINITY),
    /Invalid block chunk size: Infinity/,
  );
  assert.throws(
    () => makeBlockChunks(10, 16, 1.5),
    /Invalid block chunk size: 1.5/,
  );

  await assert.rejects(
    () => fetchEvmChainMetrics({
      chain: "invalid_range_test",
      fromBlock: 20,
      toBlock: 10,
      rpcSenders: [{ send: async () => [] }],
    } as any),
    /invalid block range 20-10/,
  );

  const [hydratedReceipt] = hydrateReceiptsWithTransactions([
    {
      transactionHash: "0xabc",
      gasUsed: "0x5208",
    },
  ], [
    {
      hash: "0xabc",
      from: "0x3333333333333333333333333333333333333333",
      gasPrice: "0x4a817c800",
    },
  ]);

  assert.equal(hydratedReceipt.from, "0x3333333333333333333333333333333333333333");
  assert.equal(hydratedReceipt.gasPrice, "0x4a817c800");
  assert.equal(getReceiptMetrics([hydratedReceipt]).totalFeesWei.toString(), "420000000000000");

  const [eip1559HydratedReceipt] = hydrateReceiptsWithTransactions([
    {
      transactionHash: "0xdef",
      gasUsed: "0x1",
      type: "0x2",
    },
  ], [
    {
      hash: "0xdef",
      from: "0x5555555555555555555555555555555555555555",
      gasPrice: "0x64",
      maxFeePerGas: "0xc8",
      type: "0x2",
    },
  ] as any);

  assert.equal(eip1559HydratedReceipt.from, "0x5555555555555555555555555555555555555555");
  assert.equal(eip1559HydratedReceipt.gasPrice, undefined);

  for (const key of ["core", "kava", "merlin"]) assert.ok(EVM_CHAIN_METRIC_CONFIGS[key], `missing ${key} config`);
  for (const [key, config] of Object.entries(EVM_CHAIN_METRIC_CONFIGS)) {
    assert.equal(typeof config.chain, "string", `${key} config must define a chain`);
    assert.ok(config.start, `${key} config must define a start date`);
    assert.ok(config.blockChunkSize === undefined || Number.isInteger(config.blockChunkSize), `${key} blockChunkSize must be an integer when set`);
    assert.ok(config.rpcTimeoutMs === undefined || Number.isInteger(config.rpcTimeoutMs), `${key} rpcTimeoutMs must be an integer when set`);
    assert.equal(typeof config.revenueShare, "number", `${key} config must explicitly define revenueShare`);
    assert.ok(config.revenueShare >= 0 && config.revenueShare <= 1, `${key} revenueShare must be between 0 and 1`);
    assert.ok(config.supplySideRevenueShare === undefined || (config.supplySideRevenueShare >= 0 && config.supplySideRevenueShare <= 1), `${key} supplySideRevenueShare must be between 0 and 1 when set`);
    assert.ok(config.revenueShare + (config.supplySideRevenueShare ?? 0) <= 1, `${key} revenue shares cannot exceed 1`);
  }

  const metrics = await fetchEvmChainMetrics({
    chain: "unit_test",
    fromBlock: 1,
    toBlock: 1,
    blockConcurrency: 1,
    txReceiptConcurrency: 1,
    rpcTimeoutMs: 5,
    provider: {
      getTransactionReceipt: () => new Promise(() => undefined),
      getTransaction: () => new Promise(() => undefined),
    },
    rpcSenders: [{
      send: async (method: string) => {
        if (method === "eth_getBlockReceipts") {
          throw { message: "the method eth_getBlockReceipts does not exist/is not available" };
        }
        if (method === "eth_getBlockByNumber") {
          return { transactions: ["0xslow"] };
        }
        if (method === "eth_getTransactionReceipt") {
          return {
            transactionHash: "0xslow",
            from: "0x4444444444444444444444444444444444444444",
            gasUsed: "0x5208",
            gasPrice: "0x3b9aca00",
          };
        }
        throw new Error(`Unexpected method: ${method}`);
      },
    }],
  } as any);

  assert.equal(metrics.transactionCount, 1);
  assert.equal(metrics.activeUsers, 1);
  assert.equal(metrics.totalGasUsed.toString(), "21000");
  assert.equal(metrics.totalFeesWei.toString(), "21000000000000");

  let blockByNumberAttempts = 0;
  const retriedMetrics = await fetchEvmChainMetrics({
    chain: "single_rpc_retry_test",
    fromBlock: 1,
    toBlock: 1,
    blockConcurrency: 1,
    txReceiptConcurrency: 1,
    rpcSenders: [{
      send: async (method: string) => {
        if (method === "eth_getBlockReceipts") {
          throw { message: "the method eth_getBlockReceipts does not exist/is not available" };
        }
        if (method === "eth_getBlockByNumber") {
          blockByNumberAttempts += 1;
          if (blockByNumberAttempts === 1) throw new Error("temporary upstream timeout");
          return { transactions: ["0xretry"] };
        }
        if (method === "eth_getTransactionReceipt") {
          return {
            transactionHash: "0xretry",
            from: "0x6666666666666666666666666666666666666666",
            gasUsed: "0x5208",
            gasPrice: "0x3b9aca00",
          };
        }
        throw new Error(`Unexpected method: ${method}`);
      },
    }],
  } as any);

  assert.equal(blockByNumberAttempts, 2);
  assert.equal(retriedMetrics.transactionCount, 1);
  assert.equal(retriedMetrics.activeUsers, 1);
  assert.equal(retriedMetrics.totalGasUsed.toString(), "21000");
  assert.equal(retriedMetrics.totalFeesWei.toString(), "21000000000000");

  await withMockedFetch(async (calls) => {
    const metrics = await fetchEvmChainMetrics({
      chain: "batch_block_receipts_test",
      fromBlock: 1,
      toBlock: 2,
      blockChunkSize: 1,
      batchConcurrency: 1,
      rpcSenders: [
        {
          url: "https://bad-rpc.example",
          send: async () => {
            throw new Error("single RPC path should not be used");
          },
        },
        {
          url: "https://good-rpc.example",
          send: async () => {
            throw new Error("single RPC path should not be used");
          },
        },
      ],
    } as any);

    assert.equal(metrics.transactionCount, 2);
    assert.equal(metrics.activeUsers, 2);
    assert.equal(metrics.totalGasUsed.toString(), "42000");
    assert.equal(metrics.totalFeesWei.toString(), "42000000000000");
    assert.equal(calls.filter((call) => call.url === "https://bad-rpc.example").length, 1);
    assert.equal(calls.filter((call) => call.url === "https://good-rpc.example").length, 2);
  }, async (url, requests) => {
    if (url === "https://bad-rpc.example") {
      return requests.map((request) => ({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32000, message: "temporary upstream failure" },
      }));
    }

    return requests.map((request) => {
      const block = Number(BigInt(request.params[0]));
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: [{
          transactionHash: `0xtx${block}`,
          from: `0x${block.toString().padStart(40, "0")}`,
          gasUsed: "0x5208",
          effectiveGasPrice: "0x3b9aca00",
        }],
      };
    });
  });

  await withMockedFetch(async (calls) => {
    const metrics = await fetchEvmChainMetrics({
      chain: "per_sender_block_receipts_support_test",
      fromBlock: 20,
      toBlock: 21,
      blockChunkSize: 1,
      batchConcurrency: 1,
      rpcSenders: [
        {
          url: "https://unsupported-block-receipts.example",
          send: async () => {
            throw new Error("single RPC path should not be used");
          },
        },
        {
          url: "https://flaky-block-receipts.example",
          send: async (method: string, params: any[]) => {
            if (method === "eth_getBlockReceipts") {
              const block = Number(BigInt(params[0]));
              return [{
                transactionHash: `0xsingle${block}`,
                from: `0x${block.toString().padStart(40, "0")}`,
                gasUsed: "0x5208",
                gasPrice: "0x3b9aca00",
              }];
            }
            throw new Error(`Unexpected method: ${method}`);
          },
        },
      ],
    } as any);

    assert.equal(metrics.transactionCount, 2);
    assert.equal(metrics.activeUsers, 2);
    assert.equal(metrics.totalGasUsed.toString(), "42000");
    assert.equal(metrics.totalFeesWei.toString(), "42000000000000");
    assert.equal(countMethodCalls(calls, "https://unsupported-block-receipts.example", "eth_getBlockReceipts"), 1);
    assert.equal(countMethodCalls(calls, "https://flaky-block-receipts.example", "eth_getBlockReceipts"), 2);
  }, createPerSenderBlockReceiptHandler());

  const allocationAdapter = createEvmChainFeesAdapter({
    chain: "allocation_test",
    fromBlock: 1,
    toBlock: 1,
    revenueShare: 0.25,
    supplySideRevenueShare: 0.75,
    rpcSenders: [{
      send: async (method: string) => {
        if (method === "eth_getBlockReceipts") {
          return [{
            transactionHash: "0xallocation",
            from: "0x7777777777777777777777777777777777777777",
            gasUsed: "0x5208",
            gasPrice: "0x3b9aca00",
          }];
        }
        throw new Error(`Unexpected method: ${method}`);
      },
    }],
  } as any);
  const allocationResult = await (allocationAdapter.fetch as any)(createFetchOptions("allocation_test", 1, 1));

  assert.equal(getOnlyBalance(allocationResult.dailyFees), 21_000_000_000_000);
  assert.equal(getOnlyBalance(allocationResult.dailyRevenue), 5_250_000_000_000);
  assert.equal(getOnlyBalance(allocationResult.dailySupplySideRevenue), 15_750_000_000_000);

  await withMockedFetch(async () => {
    const metrics = await fetchEvmChainMetrics({
      chain: "batch_fallback_test",
      fromBlock: 10,
      toBlock: 11,
      blockChunkSize: 2,
      batchConcurrency: 1,
      rpcSenders: [{
        url: "https://fallback-rpc.example",
        send: async () => {
          throw new Error("single RPC path should not be used");
        },
      }],
    } as any);

    assert.equal(metrics.transactionCount, 2);
    assert.equal(metrics.activeUsers, 2);
    assert.equal(metrics.totalGasUsed.toString(), "63000");
    assert.equal(metrics.totalFeesWei.toString(), "63000000000000");
  }, async (_url, requests) => requests.map((request) => {
    const method = request.method;
    if (method === "eth_getBlockReceipts") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: "the method eth_getBlockReceipts does not exist/is not available" },
      };
    }
    if (method === "eth_getBlockByNumber") {
      const block = Number(BigInt(request.params[0]));
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: { transactions: [`0xtx${block}`] },
      };
    }
    if (method === "eth_getTransactionReceipt") {
      const txNumber = Number(request.params[0].replace("0xtx", ""));
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          transactionHash: request.params[0],
          from: `0x${txNumber.toString().padStart(40, "0")}`,
          gasUsed: txNumber === 10 ? "0x5208" : "0xa410",
          gasPrice: "0x3b9aca00",
        },
      };
    }
    throw new Error(`Unexpected method: ${method}`);
  }));

  console.log("evmChainFees tests passed");
}

type RpcRequest = {
  id: number;
  method: string;
  params: any[];
};

async function withMockedFetch(
  callback: (calls: Array<{ url: string; requests: RpcRequest[] }>) => Promise<void>,
  handler: (url: string, requests: RpcRequest[]) => Promise<any[]> | any[],
) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; requests: RpcRequest[] }> = [];

  (globalThis as any).fetch = async (url: string, init: RequestInit) => {
    const requests = JSON.parse(init.body as string) as RpcRequest[];
    calls.push({ url, requests });
    return new Response(JSON.stringify(await handler(url, requests)), {
      status: url.includes("bad-rpc") ? 500 : 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await callback(calls);
  } finally {
    (globalThis as any).fetch = originalFetch;
  }
}

function createFetchOptions(chain: string, fromBlock: number, toBlock: number) {
  return {
    getFromBlock: async () => fromBlock,
    getToBlock: async () => toBlock,
    createBalances: () => new Balances({ chain }),
  };
}

function getOnlyBalance(balances: Balances) {
  const values = Object.values(balances.getBalances());
  assert.equal(values.length, 1);
  return Number(values[0]);
}

function countMethodCalls(calls: Array<{ url: string; requests: RpcRequest[] }>, url: string, method: string) {
  return calls
    .filter((call) => call.url === url)
    .flatMap((call) => call.requests)
    .filter((request) => request.method === method)
    .length;
}

function createPerSenderBlockReceiptHandler() {
  let flakyBlockReceiptCalls = 0;

  return async (url: string, requests: RpcRequest[]) => requests.map((request) => {
    if (request.method === "eth_getBlockReceipts") {
      if (url === "https://unsupported-block-receipts.example") {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: "the method eth_getBlockReceipts does not exist/is not available" },
        };
      }

      flakyBlockReceiptCalls += 1;
      if (flakyBlockReceiptCalls === 1) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32000, message: "temporary upstream failure" },
        };
      }

      const block = Number(BigInt(request.params[0]));
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: [{
          transactionHash: `0xfast${block}`,
          from: `0x${block.toString().padStart(40, "0")}`,
          gasUsed: "0x5208",
          gasPrice: "0x3b9aca00",
        }],
      };
    }

    if (request.method === "eth_getBlockByNumber") {
      const block = Number(BigInt(request.params[0]));
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: { transactions: [`0xfallback${block}`] },
      };
    }

    if (request.method === "eth_getTransactionReceipt") {
      const block = Number(request.params[0].replace("0xfallback", ""));
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          transactionHash: request.params[0],
          from: `0x${block.toString().padStart(40, "0")}`,
          gasUsed: "0x5208",
          gasPrice: "0x3b9aca00",
        },
      };
    }

    throw new Error(`Unexpected method: ${request.method}`);
  });
}
