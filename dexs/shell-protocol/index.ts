import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import BigNumber from "bignumber.js";
import { getPrices } from "../../utils/prices";

const DAI_CONTRACT = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1';
const USDC_CONTRACT = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
const USDT_CONTRACT = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const WBTC_CONTRACT = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

const topic  = 'Transfer (index_topic_1 address from, index_topic_2 address to, uint256 value)';
const topic0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic1 = '0x000000000000000000000000c32eb36f886f638fffd836df44c124074cfe3584';

interface ITokenList {
  address: string;
}

const tokenList: ITokenList[] = [
  {
    address: DAI_CONTRACT,
  },
  {
    address: USDC_CONTRACT,
  },
  {
    address: USDT_CONTRACT,
  },
  {
    address: WBTC_CONTRACT,
  }
];

interface ILog {
  data: string;
  transactionHash: string;
}

const fetch = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  const fromBlock = (await getBlock(fromTimestamp, 'arbitrum', {}));
  const toBlock = (await getBlock(toTimestamp, 'arbitrum', {}));
  const logs: ILog[][] = (await Promise.all(tokenList.map(({ address }) => sdk.api.util.getLogs({
    target: address,
    topic: topic,
    toBlock: toBlock,
    fromBlock: fromBlock,
    keys: [],
    chain: 'arbitrum',
    topics: [topic0,topic1]
}))))
  .map((p: any) => p)
  .map((a: any) => a.output);
  const coins = tokenList.map(({address}) => `arbitrum:${address}`);
  const prices = await getPrices(coins, timestamp);
  const untrackVolumes = tokenList.map((token: ITokenList, index: number) => {
    const log = logs[index]
      .map((e:ILog)  => {return  { ...e, data: e.data }})
      .map((p: ILog) => {
        const {decimals, price} = prices[`arbitrum:${token.address.toLowerCase()}`];
        const amountUSD = new BigNumber(p.data)
          .div(new BigNumber(10).pow(decimals))
          .multipliedBy(price);
        return amountUSD.toNumber()
      })
      return log.reduce((a: number, b: number) => a + b, 0);
  });

  const dailyVolume = untrackVolumes.reduce((a: number, b: number) => a + b, 0);
  return {
    timestamp,
    dailyVolume: dailyVolume.toString()
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: async () => 1667260800,
    },
  }
};

export default adapter;
