import { ethers, getAddress, id, zeroPadValue } from "ethers";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTransactions } from "../../helpers/getTxReceipts";

const contracts: Record<string, string[]> = {
  [CHAIN.CRONOS]: [
    getAddress("0xeb02A792A9a85c00498A72b13B9aA5c486bC6cA1"),
    getAddress("0x1189331089b6ca8beA989C1F2fFd0EfAdCd33a69"),
    getAddress("0x505dC8145B878B3B04c2f6cB3E88716dF27208C2"),
  ],
  [CHAIN.CRONOS_ZKEVM]: [
    getAddress("0xDb0837D207708F55549a425638de3E2f53Eea141"),
    getAddress("0x6c40b752be1cAa3695D0e9a2Ef54Cd295c3e89dd"),
  ],
};

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const routerAddresses = contracts[chain].map((addr) => addr.toLowerCase());
  const dailyVolume = createBalances();

  const allLogs = await Promise.all(
    routerAddresses.map((routerAddress) =>
      getLogs({
        topics: [
          id("Swap(address,uint256,uint256,uint256,uint256,address)"),
          null as any,
          zeroPadValue(routerAddress, 32),
        ],
        noTarget: true,
        entireLog: true,
      })
    )
  );
  const logs = allLogs.flat();

  if (!logs.length) return { dailyVolume };

  const logsByTx: Record<string, any[]> = {};
  for (const log of logs) {
    const txHash = log.transactionHash.toLowerCase();
    (logsByTx[txHash] ||= []).push(log);
  }

  const txHashes = Object.keys(logsByTx);
  const txs = await getTransactions(chain, txHashes, {
    cacheKey: "obsidian-swaps",
  });

  const multicallInterface = new ethers.Interface([
    "function multicall(uint256 deadline, bytes[] data)",
  ]);

  for (const tx of txs) {
    if (!tx || !tx.hash) continue;
    const txHash = tx.hash.toLowerCase();
    const input = (tx as any).input;

    if (!input?.startsWith("0x5ae401dc")) continue;

    let destinationToken: string | undefined;

    try {
      const decoded = multicallInterface.decodeFunctionData("multicall", input);
      const multicallData = decoded.data;

      if (!multicallData.length) continue;
      for (const callData of multicallData) {
        try {
          const selector = callData.slice(0, 10);
          if (selector === "0xebfd80e2") {
            const params = callData.slice(10);
            const chunks: string[] = [];
            for (let i = 0; i < params.length; i += 64) {
              chunks.push(params.slice(i, i + 64));
            }

            if (chunks.length >= 6) {
              const tokenOut = "0x" + chunks[4].slice(24);
              destinationToken = tokenOut;
              break;
            }
          }
        } catch (innerErr) {
          continue;
        }
      }
    } catch (err) {
      console.error(`Error decoding ${txHash}:`, err);
      continue;
    }

    if (!destinationToken) continue;

    for (const log of logsByTx[txHash]) {
      try {
        const data = log.data.slice(2);
        const chunks: string[] = [];
        for (let i = 0; i < data.length; i += 64) {
          chunks.push(data.slice(i, i + 64));
        }

        if (chunks.length >= 4) {
          const amount0Out = BigInt("0x" + chunks[2]);
          const amount1Out = BigInt("0x" + chunks[3]);

          const amountOut = amount0Out > 0n ? amount0Out : amount1Out;

          if (amountOut > 0n) {
            dailyVolume.add(destinationToken, amountOut.toString());
          }
        }
      } catch (logErr) {
        console.error(`Error decoding log for ${txHash}:`, logErr);
        continue;
      }
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(contracts).reduce((acc, chain) => {
    acc[chain] = {
      fetch,
      start: "2024-07-25",
    };
    return acc;
  }, {} as BaseAdapter),
};

export default adapter;