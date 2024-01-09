import { Chain } from "@defillama/sdk/build/general";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getBlock } from "../../helpers/getBlock";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { get } from "http";
import { getPrices } from "../../utils/prices";

type TContracts = {
  [key in Chain]: string[][];
};
const contracts: TContracts = {
  [CHAIN.POLYGON]: [
    ['0x89cf9a71d45c58673a7f8b4c829df466da7a473a','0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'],
    ['0xa40986ccd9dc00c533ba71c9362529c9694f9f7b','0x2791bca1f2de4661ed88a30c99a7a9449aa84174'],
    ['0xf479405a2518b02a79c060f3d91fe0c98cfe6e25','0x2791bca1f2de4661ed88a30c99a7a9449aa84174'],
    ['0x64b8b618cddc31c61305338c6ab7a2d85a7ab5ca','0x2791bca1f2de4661ed88a30c99a7a9449aa84174'],
    ['0x19759660e5ee693df6105fc3629d5d91cb0a9447','0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'],
    ['0xbda26f37656218b2b3983800bc5734998445cc92','0x2791bca1f2de4661ed88a30c99a7a9449aa84174'],
    ['0x4b6e851015581e88824f1efd71cb65dd9826189b','0x2791bca1f2de4661ed88a30c99a7a9449aa84174'],
    ['0x4baa9f1af8653a875d51324ca563d12d7925adf5','0x2791bca1f2de4661ed88a30c99a7a9449aa84174'],
    ['0x8c7822f283137e1e73ea0bdc537ccfb2fa1fb030','0x2791bca1f2de4661ed88a30c99a7a9449aa84174'],
    ['0x13f7f23db676431a2371d0f1884ae1526a0fe5c2','0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'],
    ['0xb09d2ec9afff13589ddfab190e2d1aba7e02095b','0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'],
    ['0x6909bfbe79f9c33589c637eed166a32afea76ef6','0x2791bca1f2de4661ed88a30c99a7a9449aa84174'],
    ['0xf51dcd52bd075c91632aac42c3926b2a523b3da5','0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'],
    ['0x9ceeb2a6f17d3c7bd086471095fcf80cfe780149','0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'],
  ]
}


interface ILogs {
  address: string;
  blockHash: string;
  blockNumber: string;
  data: string;
  logIndex: string;
  removed: boolean;
  topics: string[];
  transactionHash: string;
  transactionIndex: string;
}

function twosComplementHexToDecimal(hexValue: string): number {
  // Check if the hex value starts with '0xf'
  if (!hexValue.startsWith('0xf')) {
    return Number(hexValue);
  }

  // Convert hex to binary
  const binaryValue = BigInt(hexValue).toString(2);

  // Apply two's complement
  const flippedBinary = binaryValue
    .split('')
    .map(bit => (bit === '0' ? '1' : '0'))
    .join('');
  const twoComplementBinary = (BigInt(`0b${flippedBinary}`) + BigInt(1)).toString(2);

  // Convert binary to decimal
  const decimalValue = parseInt(twoComplementBinary, 2);

  return decimalValue;
}

const topic0_trade = '0xeef2964c19d154a021c80f1901318bed137c1214368f991d6a118e9c64c5d9f6';
interface IVolume {
  contract: string;
  amount_quote: number;
  quoteAddr: string;
}

const fetchVolume = (chain: Chain) => {
  return async (timestamp: number) => {
    const now = new Date().getTime() / 1000;
    const fromTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const toTimestamp = timestamp > now ? now : timestamp;

    const toBlock = await getBlock(toTimestamp, chain, {});
    const fromBlock = await getBlock(fromTimestamp, chain, {});

    const logs: ILogs[] = (await Promise.all(contracts[chain].map(contract => sdk.getEventLogs({
      target: contract[0],
      topics: [topic0_trade],
      toBlock,
      fromBlock,
      chain: chain,
    })))).flat();

    const volumeRaw: IVolume[] = logs.map((log:ILogs) => {
      const data = log.data.replace('0x', '');
      const price = Number('0x'+data.slice(0, 64)) / 10 ** 18;
      const amount = twosComplementHexToDecimal('0x'+data.slice(64, 128)) / 10 ** 18;
      const quoteAddr = contracts[chain].find((x: string[]) => x[0].toLowerCase() === log.address.toLowerCase())?.[1];
      return {
        contract: log.address,
        amount_quote: amount * price,
        quoteAddr: quoteAddr || ''
      }
    });

    const coins = [...new Set(volumeRaw.map(e => `${chain}:${e.quoteAddr.toLowerCase()}`))];
    const prices = await getPrices(coins, fromTimestamp);


    // getPrices API currently has a bug that it doesn't return price for polygon:0x2791bca1f2de4661ed88a30c99a7a9449aa84174 (USDC) for some reason
    // so we set it as 1 manually to temporarily fix this issue
    if (!prices['polygon:0x2791bca1f2de4661ed88a30c99a7a9449aa84174']) {
      prices['polygon:0x2791bca1f2de4661ed88a30c99a7a9449aa84174'] = {
        symbol: 'USDC',
        timestamp: now,
        price: 1,
        decimals: 18
      }
    }

    // check prices
    coins.forEach(coin => {
      if (!prices[coin]) {
        throw new Error(`No price found for ${coin}`);
      }
    });

    const volume = volumeRaw.map((e: IVolume) => e.amount_quote * prices[`${chain}:${e.quoteAddr.toLowerCase()}`]?.price || 0);
    const dailyVolume = volume.reduce((acc: number, cur: number) => acc + cur, 0);
    return {
      dailyVolume: `${dailyVolume}`,
      timestamp
    }
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchVolume(CHAIN.POLYGON),
      start: async () => 1662595200
    }
  }
}
export default adapters;
