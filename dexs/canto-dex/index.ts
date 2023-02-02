import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../../utils/date";
import BigNumber from "bignumber.js";
import { getPrices } from "../../utils/prices";
import { providers } from "ethers";

interface ILog {
  data: string;
  transactionHash: string;
}
interface IAmount {
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
}
const topic_name = 'Swap(index_topic_1 address sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, index_topic_2 address to)';
const topic0 = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';

const PAIR_TOKEN_ABI = (token: string): object => {
  return {
    "constant": true,
    "inputs": [],
    "name": token,
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
};

const lpAddress = [
  '0x9571997a66d63958e1b3de9647c22bd6b9e7228c',
  '0x1d20635535307208919f0b67c3b2065965a85aa9',
  '0x30838619c55b787bafc3a4cd9aea851c1cfb7b19',
  '0x216400ba362d8fce640085755e47075109718c8b',
  '0x35db1f3a6a6f07f82c76fcc415db6cfb1a7df833',
  '0x830fbc440a0a61b429b9ece5b7a4af003537fad2',
];
type TCoinID = {
  [k: string]: string;
}
const coinsId: TCoinID = {
  '0x4e71A2E537B7f9D9413D3991D37958c0b5e1e503': 'note',
  '0x826551890Dc65655a0Aceca109aB11AbDbD7a07B': 'canto',
  '0x5FD55A1B9FC24967C4dB09C513C3BA0DFa7FF687': 'ethereum',
  '0x80b5a32E4F032B2a058b4F29EC95EEfEEB87aDcd': 'usd-coin',
  '0xecEEEfCEE421D8062EF8d6b4D814efe4dc898265': 'cosmos',
  '0xd567B3d7B8FE3C79a1AD8dA978812cfC4Fa05e75': 'tether',
  '0x7264610A66EcA758A8ce95CF11Ff5741E1fd0455': 'canto-inu'
};

interface IToken {
  address: string;
  decimals: number;
}
interface ITokenInfo {
  token0: IToken;
  token1: IToken;
}

const splitBlock = (fromBlock: number, toBlock: number): number[][] => {
  const list: number[][] = [];
  let tempToBlock = 0;
  let tempFromBlock = fromBlock;
  while (tempToBlock < toBlock) {
    const _toBlock = tempFromBlock + 3600;
    list.push([tempFromBlock, _toBlock > toBlock ? toBlock : _toBlock]);
    tempFromBlock = _toBlock + 1;
    tempToBlock = _toBlock;
  }
  return list;
}

const getPairInfo = async (tokenAddress: string[]): Promise<ITokenInfo> => {
  const [tokenDecimals] = await Promise.all(
    ['erc20:decimals'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: tokenAddress.map((address) => ({
          target: address,
        })),
        chain: 'canto',
      }
      )
    ));
  return {
    token0: {
      address: tokenAddress[0],
      decimals: Number(tokenDecimals.output[0].output)
    },
    token1: {
      address: tokenAddress[1],
      decimals: Number(tokenDecimals.output[1].output)
    }
  };
}

const provider = new providers.JsonRpcProvider("https://canto.slingshot.finance", 7700);
const fetch = async (timestamp: number) => {
  const fromTimestamp = getTimestampAtStartOfDayUTC(timestamp)
  const toTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)-1
  const lpTokens = lpAddress;

  const [underlyingToken0, underlyingToken1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      sdk.api.abi.multiCall({
        abi: PAIR_TOKEN_ABI(method),
        calls: lpTokens.map((address) => ({
          target: address,
        })),
        chain: 'canto'
      })
    )
  );

  const tokens0 = underlyingToken0.output.map((res) => res.output);
  const tokens1 = underlyingToken1.output.map((res) => res.output);
  const pairInfo = await Promise.all(lpTokens.map((_: string, index: number) => getPairInfo([tokens0[index], tokens1[index]])));
  const toBlock = (await getBlock(toTimestamp, 'canto', {}));
  const fromBlock = (await getBlock(fromTimestamp, 'canto', {}));
  const blocks = splitBlock(fromBlock, toBlock);
  let logs: any = [];
  for(const [fromBlock, toBlock] of blocks) {
    const _logs : ILog[][] = (await Promise.all(lpTokens.map((address: string) => provider.getLogs({
      address: address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      topics: [topic0]
    })))).map((p: any) => p)
    logs.push(_logs)
  }

  const coins = [...tokens0, ...tokens1].map((e: string) => `coingecko:${coinsId[e]}`);
  const coinsUnique = [...new Set(coins)]
  const prices = await getPrices(coinsUnique, timestamp);

  const untrackVolumes: number[] = logs.map((_: any, blockIndex: number) => {
    return lpTokens.map((_: string, index: number) => {
      const log: IAmount[] = logs[blockIndex][index]
        .map((e: ILog) => { return { ...e, data: e.data.replace('0x', '') } })
        .map((p: ILog) => {
          const amount0In = new BigNumber('0x' + p.data.slice(0, 64)).toString();
          const amount1In = new BigNumber('0x' + p.data.slice(64, 128)).toString();
          const amount0Out = new BigNumber('0x' + p.data.slice(128, 192)).toString();
          const amount1Out = new BigNumber('0x' + p.data.slice(192, 256)).toString();
          return {
            amount0In,
            amount1In,
            amount0Out,
            amount1Out,
          } as IAmount
        }) as IAmount[];
      const token0Price = (prices[`coingecko:${coinsId[tokens0[index]]}`]?.price || 0);
      const token1Price = (prices[`coingecko:${coinsId[tokens1[index]]}`]?.price || 0);
      const token0Decimals = pairInfo[index].token0.decimals;
      const token1Decimals = pairInfo[index].token1.decimals
      const totalAmount0 = log
        .reduce((a: number, b: IAmount) => Number(b.amount0In) + Number(b.amount0Out) + a, 0) / 10 ** token0Decimals * token0Price;
      const totalAmount1 = log
        .reduce((a: number, b: IAmount) => Number(b.amount1In) + Number(b.amount1Out) + a, 0) / 10 ** token1Decimals * token1Price;

      const untrackAmountUSD = token0Price !== 0 ? totalAmount0 : token1Price !== 0 ? totalAmount1 : 0; // counted only we have price data
      return untrackAmountUSD;
    });
  }).flat()
  const dailyVolume = untrackVolumes.reduce((a: number, b: number) => a + b, 0);

  return {
    dailyVolume: `${dailyVolume}`,
    timestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CANTO]: {
      fetch,
      start: async () => 1668988800,
    },
  }
};

export default adapter;
