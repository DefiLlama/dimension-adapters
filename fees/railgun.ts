import { Chain } from "@defillama/sdk/build/general";
import { getBlock } from "../helpers/getBlock";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { get } from "http";
import { getPrices } from "../utils/prices";


type IContract = {
  [key in Chain]: string
}

const contract: IContract = {
  [CHAIN.ETHEREUM]: '0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9',
  [CHAIN.ARBITRUM]: '0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9',
  [CHAIN.BSC]: '0x590162bf4b50f6576a459b75309ee21d92178a10',
  [CHAIN.POLYGON]: '0x19b620929f97b7b990801496c3b361ca5def8c71',
}
const topic0_shield = '0x3a5b9dc26075a3801a6ddccf95fec485bb7500a91b44cec1add984c21ee6db3b';
// token index 8
// amount index 17
const topic0_unshield = '0xd93cf895c7d5b2cd7dc7a098b678b3089f37d91f48d9b83a0800a91cbdf05284';
// token index 2
// amount index 5


interface ILog {
  blockNumber: number,
  blockHash: string,
  transactionHash: string,
  transactionIndex: number,
  address: string,
  data: string,
  topics: string[],
  logIndex: number,
  removed: boolean,
}
interface IFees {
  token: string;
  amount: number;
}

const fetchFees = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const toTimestamp = timestamp;
    const fromTimestamp = timestamp - 24 * 60 * 60;
    const toBlock = await getBlock(toTimestamp, chain, {});
    const fromBlock = await getBlock(fromTimestamp, chain, {});
    const logs_shield: ILog[] = (await sdk.getEventLogs({
      target: contract[chain],
      topics: [topic0_shield],
      fromBlock,
      toBlock,
      chain,
    })) as ILog[];

    const logs_unshield: ILog[] = (await sdk.getEventLogs({
      target: contract[chain],
      topics: [topic0_unshield],
      fromBlock,
      toBlock,
      chain,
    })) as ILog[];

    const shield_fees: IFees[] = logs_shield.map((log) => {
      const data = log.data.replace('0x', '');
      const token = data.slice(64 * 8, (64 * 8) + 64);
      const contract_address = '0x' + token.slice(24, token.length);
      const amount = Number('0x'+data.slice((64 * 17), (64 * 17) + 64));
      return {
        token: contract_address,
        amount,
      }
    });
    const unshield_fees: IFees[] = logs_unshield.map((log) => {
      const data = log.data.replace('0x', '');
      const token = data.slice(64 * 2, (64 * 2) + 64);
      const contract_address = '0x' + token.slice(24, token.length);
      const amount = Number('0x'+data.slice((64 * 5), (64 * 5) + 64));
      return {
        token: contract_address,
        amount,
      }
    });
    const tokens = [...shield_fees, ...unshield_fees].map((e) => e.token);
    const coins = [...new Set(tokens)].map((e: string) => `${chain}:${e}`);
    const prices = await getPrices([...coins], timestamp);

    const dailyFees = [...shield_fees, ...unshield_fees].reduce((a: number, b: IFees) => {
      const price = prices[`${chain}:${b.token}`]?.price || 0;
      const decimals = prices[`${chain}:${b.token}`]?.decimals || 0;
      if (price === 0 || decimals === 0) return a;
      const amount = (b.amount / 10 ** decimals) * price
      const oneMillion = 1000000;
      if (amount > oneMillion) return a;
      return a + (b.amount / 10 ** decimals) * price;
    },0)

    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyFees.toString(),
      dailyBribesRevenue: dailyFees.toString(),
      timestamp,
    }
  }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees(CHAIN.ETHEREUM),
      start: async () => 1651363200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees(CHAIN.ARBITRUM),
      start: async () => 1674864000,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees(CHAIN.POLYGON),
      start: async () => 1682899200,
    },
    [CHAIN.BSC]: {
      fetch: fetchFees(CHAIN.BSC),
      start: async () => 1682899200,
    },
  }
}

export default adapters;
