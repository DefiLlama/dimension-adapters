import assert from "assert/strict";
import {
  EVM_CHAIN_METRIC_CONFIGS,
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

  assert.deepEqual(Object.keys(EVM_CHAIN_METRIC_CONFIGS).sort(), ["core", "kava", "merlin"]);
  assert.equal(EVM_CHAIN_METRIC_CONFIGS.merlin.blockChunkSize, 250);
  assert.equal(EVM_CHAIN_METRIC_CONFIGS.merlin.rpcTimeoutMs, 20_000);

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
