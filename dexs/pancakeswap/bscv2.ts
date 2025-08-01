import * as sdk from "@defillama/sdk";
import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { addOneToken } from "../../helpers/prices";
import { httpGet } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

// we get raw volume from all Uniswap v2 pairs on BSC
// filter our pancakeswap v2 pairs
// filter out whitelisted tokens from pancakeswap coingecko token list only

const FACTORY_V2_BSC = '0xca143ce32fe78f1f7019d7d551a6402fc5350c73';

function formatAddress(address: any): string {
  return String(address).toLowerCase();
}

interface IPair {
  factory: string;
  token0: string;
  token1: string;
}

async function getWhitelistedTokens(): Promise<Array<string>> {
  const data = await httpGet('https://raw.githubusercontent.com/pancakeswap/token-list/main/lists/coingecko.json');
  return data.tokens
    .filter((token: any) => Number(token.chainId) === 56)
    .map((token: any) => formatAddress(token.address))
}

async function retryGetLogs(options: FetchOptions, fromBlock: number, toBlock: number): Promise<Array<any>> {
  for (let i = 0; i < 5; i++) {
    try {
      return (await sdk.indexer.getLogs({
        chain: options.chain,
        fromBlock: fromBlock,
        toBlock: toBlock,
        noTarget: true,
        eventAbi: 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
        maxBlockRange: 5000,
        onlyArgs: false,
      })) as Array<any>;
    } catch(e: any) {
      if (i === 4) {
        throw e;
      }
    }
    await sleep(5000); // sleep 5 secs
  }

  return [];
}

export async function getBscV2Data(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances()

  const whitelistedTokens = await getWhitelistedTokens()

  const limit = 5000
  let blockNumber = Number(options.fromApi.block)
  for (blockNumber; blockNumber <= Number(options.toApi.block); blockNumber += limit + 1) {
    const toBlock = blockNumber + limit > Number(options.toApi.block) ? Number(options.toApi.block) : blockNumber + limit;
    let swapLogs = await retryGetLogs(options, blockNumber, toBlock);

    // get unique pairs, pairAddress => factoryAddress
    const allPairs: {[key: string]: IPair | null} = {};
    for (const log of swapLogs) {
      allPairs[formatAddress(log.address)] = null;
    }

    const pairs = Object.keys(allPairs);

    const factories = await options.api.multiCall({
      abi: 'address:factory',
      calls: pairs,
      permitFailure: true,
    });
    const pairsToken0 = await options.api.multiCall({
      abi: 'address:token0',
      calls: pairs,
      permitFailure: true,
    });
    const pairsToken1 = await options.api.multiCall({
      abi: 'address:token1',
      calls: pairs,
      permitFailure: true,
    });

    for (let i = 0; i < pairs.length; i++) {
      allPairs[pairs[i]] = {
        factory: formatAddress(factories[i]),
        token0: formatAddress(pairsToken0[i]),
        token1: formatAddress(pairsToken1[i]),
      };
    }

    // get logs emitted from pairs contracts were created by FACTORY_V2_BSC
    swapLogs = swapLogs.filter(item => allPairs[formatAddress(item.address)]?.factory === FACTORY_V2_BSC)

    for (const log of swapLogs) {
      const pair = allPairs[formatAddress(log.address)];
      const event = log.args;

      // require both token0 and token1 are whitelisted
      if (pair && whitelistedTokens.includes(pair.token0) && whitelistedTokens.includes(pair.token1)) {
        addOneToken({ chain: options.chain, balances: dailyVolume, token0: pair.token0, token1: pair.token1, amount0: event.amount0In, amount1: event.amount1In })
        addOneToken({ chain: options.chain, balances: dailyVolume, token0: pair.token0, token1: pair.token1, amount0: event.amount0Out, amount1: event.amount1Out })
      }
    }
  }

  return {
    dailyVolume: dailyVolume,
    dailyFees: dailyVolume.clone(0.0025),
    dailyUserFees: dailyVolume.clone(0.0025),
    dailyRevenue: dailyVolume.clone(0.0008),
    dailySupplySideRevenue: dailyVolume.clone(0.0017),
    dailyProtocolRevenue: dailyVolume.clone(0.0000225),
    dailyHoldersRevenue: dailyVolume.clone(0.0000575),
  }
}
