import * as sdk from "@defillama/sdk";
import * as ethers from "ethers";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { sleep } from "../utils/utils";
import { getSolanaReceived } from "../helpers/token";
import coreAssets from "../helpers/coreAssets.json";

const configs: Record<string, { withdrawContracts: Array<string>, start: string, getTrasnactionLimit: number }> = {
  [CHAIN.LINEA]: {
    start: '2024-11-13',
    withdrawContracts: [
      '0xa90b298d05c2667ddc64e2a4e17111357c215dd2',
      '0x9dd23a4a0845f10d65d293776b792af1131c7b30',
    ],
    getTrasnactionLimit: 10000,
  },
  [CHAIN.BASE]: {
    start: '2025-11-11',
    withdrawContracts: [
      '0xdabdafc43b2bc1c7d10c2bbce950a8cad4a367f8',
    ],
    getTrasnactionLimit: 10000,
  },
  [CHAIN.MONAD]: {
    // FoxConnect (MetaMask Card) contracts on Monad (eip155:143), sourced from
    // MetaMask's own app config: metamask-mobile app/selectors/featureFlagController/card/index.ts
    // Both are ERC1967 proxies to the same card implementation (0x716bf8c5...df5518),
    // matching the Linea/Base architecture. Deployed at block 80727203 (2026-06-12).
    start: '2026-06-12',
    withdrawContracts: [
      '0x40a695a16c213afef1c87fd471fb73157b948f3f', // global
      '0x144c1ce815bd1eb71678978fe8641cc4e3fd59e6', // US
    ],
    getTrasnactionLimit: 10000,
  },
}

const withdrawAbi = 'function withdraw(address[] tokens,address[] sources,uint256[] amounts)';

async function retry(chain: string, fromBlock: number, toBlock: number, addresses: Array<string>): Promise<Array<any>> {
  for (let i = 0; i < 5; i++) {
    try {
      return (await sdk.indexer.getTransactions({
        chain: chain,
        from_block: fromBlock,
        to_block: toBlock,
        transactionType: 'to',
        addresses: addresses,
      })) as Array<any>;
    } catch (e: any) {
      if (i === 4) {
        console.log(e)
        throw e;
      }
    }
    await sleep(5000); // sleep 5 secs
  }

  return [];
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const limit = configs[options.chain].getTrasnactionLimit;
  let transactions: Array<any> = [];
  let blockNumber = Number(options.fromApi.block);
  for (blockNumber; blockNumber <= Number(options.toApi.block); blockNumber += limit + 1) {
    const toBlock = blockNumber + limit > Number(options.toApi.block) ? Number(options.toApi.block) : blockNumber + limit;
    transactions = transactions.concat(await retry(options.chain, blockNumber, toBlock, configs[options.chain].withdrawContracts));
  }

  for (const tx of transactions) {
    if (tx && tx.input && String(tx.input.slice(0, 10)).toLowerCase() === '0xf7ece0cf') {
      const iface = new ethers.Interface([withdrawAbi]);
      const decodedFunctionData = iface.decodeFunctionData("withdraw", tx.input);
      
      const tokens = decodedFunctionData[0];
      const amounts = decodedFunctionData[2];
      for (let i = 0; i < tokens.length; i++) {
        dailyVolume.add(tokens[i], amounts[i]);
      }
    }
  }

  return { dailyVolume };
};

const fetchSol = async (options: FetchOptions) => {
  const dailyVolume = await getSolanaReceived({
    options,
    target: 'BHEKb1J4oRJP3A8XTCgvB9opPDGD5L9wDQPpUf3oPK1N',
    mints: [
      coreAssets.solana.USDC,
      coreAssets.solana.USDT,
    ],
  })

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    ...configs,
    [CHAIN.SOLANA]: {
      fetch: fetchSol,
      start: '2025-06-01',
    }
  }
};

export default adapter;