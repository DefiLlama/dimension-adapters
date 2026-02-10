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

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
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

const fetchSol = async (_a: any, _b: any, options: FetchOptions) => {
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