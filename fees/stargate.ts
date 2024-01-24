import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
  address: string;
}

const topic0_swap = '0x34660fc8af304464529f48a778e03d03e4d34bcd5f9b6f0cfbf3cd238c642f7f'
const topic0_swap_remote = '0xfb2b592367452f1c437675bed47f5e1e6c25188c17d7ba01a12eb030bc41ccef'

const event0_swap = 'event Swap(uint16 chainId,uint256 dstPoolId,address from,uint256 amountSD,uint256 eqReward,uint256 eqFee,uint256 protocolFee,uint256 lpFee)'
const event0_swap_remote = 'event SwapRemote( address to,uint256 amountSD,uint256 protocolFee,uint256 dstFee)'

const contract_interface = new ethers.Interface([
  event0_swap,
  event0_swap_remote
]);

interface IFee {
  amount: number;
  contract: string;
}

type IAddress = {
  [s: string | Chain]: string[];
}

const contract_address: IAddress = {
  [CHAIN.ETHEREUM]: [
    '0xdf0770dF86a8034b3EFEf0A1Bb3c889B8332FF56',
    '0x38EA452219524Bb87e18dE1C24D3bB59510BD783',
    '0x101816545F6bd2b1076434B54383a1E633390A2E',
  ],
  [CHAIN.ARBITRUM]: [
    '0x892785f33CdeE22A30AEF750F285E18c18040c3e',
    '0xB6CfcF89a7B22988bfC96632aC2A9D6daB60d641',
    '0x915A55e36A01285A14f05dE6e81ED9cE89772f8e',
  ],
  [CHAIN.AVAX]: [
    '0x1205f31718499dBf1fCa446663B532Ef87481fe1',
    '0x29e38769f23701A2e4A8Ef0492e19dA4604Be62c',
  ],
  [CHAIN.BSC]: [
    '0x9aA83081AA06AF7208Dcc7A4cB72C94d057D2cda',
    '0x98a5737749490856b401DB5Dc27F522fC314A4e1',
  ],
  [CHAIN.FANTOM]: [
    '0x12edeA9cd262006cC3C4E77c90d2CD2DD4b1eb97'
  ],
  [CHAIN.OPTIMISM]: [
    '0xDecC0c09c3B5f6e92EF4184125D5648a66E35298',
    '0xd22363e3762cA7339569F3d33EADe20127D5F98C',
  ],
  [CHAIN.POLYGON]: [
    '0x1205f31718499dBf1fCa446663B532Ef87481fe1',
    '0x29e38769f23701A2e4A8Ef0492e19dA4604Be62c',
  ]
}

type IMap = {
  [s: string]: string;
}

const mapTokenPrice: IMap = {
  ['0x101816545f6bd2b1076434b54383a1e633390a2e'.toLowerCase()]: 'ethereum:0x0000000000000000000000000000000000000000',
  ['0x915a55e36a01285a14f05de6e81ed9ce89772f8e'.toLowerCase()]: 'ethereum:0x0000000000000000000000000000000000000000',
  ['0xd22363e3762ca7339569f3d33eade20127d5f98c'.toLowerCase()]: 'ethereum:0x0000000000000000000000000000000000000000',
  ['0x892785f33CdeE22A30AEF750F285E18c18040c3e'.toLowerCase()]: 'ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  ['0xB6CfcF89a7B22988bfC96632aC2A9D6daB60d641'.toLowerCase()]: 'ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7',
  ['0x38EA452219524Bb87e18dE1C24D3bB59510BD783'.toLowerCase()]: 'ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
  ['0xdf0770dF86a8034b3EFEf0A1Bb3c889B8332FF56'.toLowerCase()]: 'ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  ['0x1205f31718499dBf1fCa446663B532Ef87481fe1'.toLowerCase()]: 'ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  ['0x29e38769f23701A2e4A8Ef0492e19dA4604Be62c'.toLowerCase()]: 'ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7',
  ['0x9aA83081AA06AF7208Dcc7A4cB72C94d057D2cda'.toLowerCase()]: 'ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7',
  ['0x98a5737749490856b401DB5Dc27F522fC314A4e1'.toLowerCase()]: 'coingecko:binance-usd',
  ['0x12edeA9cd262006cC3C4E77c90d2CD2DD4b1eb97'.toLowerCase()]: 'ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  ['0xDecC0c09c3B5f6e92EF4184125D5648a66E35298'.toLowerCase()]: 'ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));
    const logs: ILog[] = (await Promise.all(contract_address[chain].map((address: string) => sdk.getEventLogs({
      target: address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: chain,
      topics: [topic0_swap]
    })))).flat();

    const logs_swap_remote: ILog[] = (await Promise.all(contract_address[chain].map((address: string) => sdk.getEventLogs({
        target: address,
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: [topic0_swap_remote]
      })))).flat();
    const logs_swap: IFee[] = logs.map((e: ILog) => {
      const value = contract_interface.parseLog(e);
      const amount = Number(value!.args.protocolFee);
      return {
        amount: amount,
        contract: e.address
      }
    });
    const swap_remote: IFee[] = logs_swap_remote.map((e: ILog) => {
      const value = contract_interface.parseLog(e);
      const amount = Number(value!.args.protocolFee);
      return {
        amount: amount,
        contract: e.address
      }
    });
    const coins = [...new Set(logs_swap.concat(swap_remote).map((e: IFee) =>  mapTokenPrice[e.contract.toLowerCase()]))];
    const prices = await getPrices(coins, timestamp);
    if (prices['coingecko:binance-usd'])
      prices['coingecko:binance-usd'].decimals = 18
    const dailyFees = [...logs_swap, ...swap_remote].map((e: IFee) => {
      const price = prices[mapTokenPrice[e.contract.toLowerCase()]].price;
      const decimals = prices[mapTokenPrice[e.contract.toLowerCase()]].decimals;
      return (Number(e.amount) / 10 ** decimals) * price;
    }).reduce((a: number, b: number) => a + b, 0)
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyFees.toString(),
      timestamp: timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM),
        start: async ()  => 1661990400,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async ()  => 1661990400,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: async ()  => 1661990400,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: async ()  => 1661990400,
    },
    // [CHAIN.FANTOM]: {
    //   fetch: fetch(CHAIN.FANTOM),
    //   start: async ()  => 1661990400,
    // },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: async ()  => 1661990400,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async ()  => 1661990400,
    },
  }
}

export default adapter;
