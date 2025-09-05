import * as sdk from "@defillama/sdk";
import { Chain, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions } from "../adapters/types";
import { sleep } from "../utils/utils";

type IConfig = {
  [s: string | Chain]: {
    routerAddress: string;
    getTrasnactionLimit: number;
  };
}

const configs: IConfig = {
  [CHAIN.ETHEREUM]: {
    routerAddress: '0x881d40237659c251811cec9c364ef91dc08d300c',
    getTrasnactionLimit: 5000,
  },
  [CHAIN.POLYGON]: {
    routerAddress: '0x1a1ec25dc08e98e5e93f1104b5e5cdd298707d31',
    getTrasnactionLimit: 5000,
  },
  [CHAIN.BSC]: {
    routerAddress: '0x1a1ec25dc08e98e5e93f1104b5e5cdd298707d31',
    getTrasnactionLimit: 5000,
  },
  [CHAIN.ARBITRUM]: {
    routerAddress: '0x9dda6ef3d919c9bc8885d5560999a3640431e8e6',
    getTrasnactionLimit: 10000,
  },
  [CHAIN.OPTIMISM]: {
    routerAddress: '0x9dda6ef3d919c9bc8885d5560999a3640431e8e6',
    getTrasnactionLimit: 10000,
  },
  [CHAIN.BASE]: {
    routerAddress: '0x9dda6ef3d919c9bc8885d5560999a3640431e8e6',
    getTrasnactionLimit: 5000,
  },
  [CHAIN.LINEA]: {
    routerAddress: '0x9dda6ef3d919c9bc8885d5560999a3640431e8e6',
    getTrasnactionLimit: 10000,
  },
}

async function retry(chain: string, fromBlock: number, toBlock: number, address: string): Promise<Array<any>> {
  for (let i = 0; i < 5; i++) {
    try {
      return (await sdk.indexer.getTransactions({
        chain: chain,
        from_block: fromBlock,
        to_block: toBlock,
        transactionType: 'to',
        addresses: [address],
      })) as Array<any>;
    } catch (e: any) {
      if (i === 4) {
        throw e;
      }
    }
    await sleep(5000); // sleep 5 secs
  }

  return [];
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()

  const limit = configs[options.chain].getTrasnactionLimit
  let blockNumber = Number(options.fromApi.block);

  for (blockNumber; blockNumber <= Number(options.toApi.block); blockNumber += limit + 1) {
    const toBlock = blockNumber + limit > Number(options.toApi.block) ? Number(options.toApi.block) : blockNumber + limit;
    const transactions = await retry(options.chain, blockNumber, toBlock, configs[options.chain].routerAddress);

    for (const transaction of transactions.filter(tx => tx.status === 1)) {
      const data = transaction.input.replace('0x5f575529', '');
      const address = data.slice(64, 128);
      const amount = Number('0x' + data.slice(128, 192));
      const tokenAddress = '0x' + address.slice(24, address.length);
      dailyVolume.add(tokenAddress, amount);
    }
  }

  const dailyFees = dailyVolume.clone(0.0085)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Volume: 'Total token swap volumes by users using Metamask wallet.',
  Fees: 'All fees paid by users for trading, swapping, bridging in Metamask wallet.',
  Revenue: 'Fees collected by Metamask paid by users for trading, swapping, bridging in Metamask wallet.',
  ProtocolRevenue: 'Fees collected by Metamask paid by users for trading, swapping, bridging in Metamask wallet.',
}

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2023-01-01', },
    [CHAIN.POLYGON]: { start: '2023-01-01', },
    [CHAIN.BSC]: { start: '2023-01-01', },
    [CHAIN.ARBITRUM]: { start: '2023-01-01', },
    [CHAIN.OPTIMISM]: { start: '2023-01-01', },
    [CHAIN.BASE]: { start: '2023-11-18', },
    [CHAIN.LINEA]: { start: '2023-10-03', },
  },
  methodology,
}

export default adapter;
