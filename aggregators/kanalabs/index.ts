import { Chain } from "@defillama/sdk/build/general";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { getBlock } from "../../helpers/getBlock";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

const topic0 =
  "0xf759b8879b7c58816b62c8cb8572a777bed770ca90e4a5b3bb4c7a8f7e94cf13";

type IContract = {
  [c: string | Chain]: string;
};
const contract: IContract = {
  [CHAIN.ARBITRUM]: "0xA1BB807fF6701f4e1b404Eb35Da55d8E9f3fb25c",
  [CHAIN.AVAX]: "0xA1BB807fF6701f4e1b404Eb35Da55d8E9f3fb25c",
  [CHAIN.POLYGON]: "0xA1BB807fF6701f4e1b404Eb35Da55d8E9f3fb25c",
  [CHAIN.BSC]: "0xA1BB807fF6701f4e1b404Eb35Da55d8E9f3fb25c",
  [CHAIN.ETHEREUM]: "0xA1BB807fF6701f4e1b404Eb35Da55d8E9f3fb25c",
  [CHAIN.ERA]: "0x18f79872b0255f7B57a131890739539B0Ad6ad4E",
};

interface ILog {
  address: string;
  data: string;
  transactionHash: string;
  topics: string[];
}
interface IData {
  fromAssetId: string;
  toAssetId: string;
  fromAmount: number;
  toAmount: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toTimestamp = timestamp;
    const fromBlock = await getBlock(fromTimestamp, chain, {});
    const toBlock = await getBlock(toTimestamp, chain, {});
    const logs = (await sdk.getEventLogs({
      target: contract[chain],
      topic: topic0,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: chain,
      topics: [topic0],
    })) as ILog[] as any;

    const data: IData[] = logs.map((e: ILog) => {
      const _data = e.data.replace("0x", "");
      const fromAssetId = "0x" + `0x${_data.slice(128, 192)}`.slice(26, 66);
      const toAssetId = "0x" + `0x${_data.slice(192, 256)}`.slice(26, 66);
      const fromAmount = Number(`0x${_data.slice(280, 320)}`);
      const toAmount = Number(`0x${_data.slice(320, 384)}`);
      return {
        tx: e.transactionHash,
        fromAssetId,
        toAssetId,
        toAmount,
        fromAmount,
      };
    });
    const balances = new sdk.Balances({ chain, timestamp, })
    data.map((e: IData) => {
      balances.add(e.toAssetId, e.toAmount)
    })
    return {
      dailyVolume: await balances.getUSDString(),
      timestamp,
    }
  };
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(contract).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain),
        start: async () => 1695897839,
      },
    };
  }, {}),
};

export default adapter;
