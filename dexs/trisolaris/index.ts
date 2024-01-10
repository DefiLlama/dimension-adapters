import { FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getBlock } from "../../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { getPrices } from "../../utils/prices";


const pools: string[] = [
  '0x1e0e812fbcd3eb75d8562ad6f310ed94d258d008',
  '0x63da4db6ef4e7c62168ab03982399f9588fcd198',
  '0x03b666f3488a7992b2385b12df7f35156d7b29cd',
  '0x20f8aefb5697b77e0bb835a8518be70775cda1b0',
  '0xbc8a244e8fb683ec1fd6f88f3cc6e565082174eb',
  '0x84b123875f0f36b966d0b6ca14b31121bd9676ad',
  '0x5eec60f348cb1d661e4a5122cf4638c7db7a886e',
  '0xd1654a7713617d41a8c9530fb9b948d00e162194',
  '0x61c9e05d1cdb1b70856c7a2c53fa9c220830633c',
  '0x48887ceea1b8ad328d5254bef774be91b90faa09',
  '0x044b6b0cd3bb13d2b9057781df4459c66781dce7',
  '0x5e74d85311fe2409c341ce49ce432bb950d221de'
].map((address: string) => address.toLowerCase());

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

const fetchVolume = async (timestamp: number): Promise<FetchResultVolume> => {
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - 86400;
  const toBlock = (await getBlock(toTimestamp, CHAIN.AURORA, {}));
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.AURORA, {}));

  const logs: any[] = (await Promise.all(pools.map((address: string) => sdk.api.util.getLogs({
    target: address,
    topic: '',
    toBlock: toBlock,
    fromBlock: fromBlock,
    keys: [],
    chain: CHAIN.AURORA,
    topics: [topic0]
  }))))
    .map((p: any) => p)
    .map((a: any) => a.output)
    .flat();
  const [underlyingToken0, underlyingToken1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      sdk.api.abi.multiCall({
        abi: PAIR_TOKEN_ABI(method),
        calls: pools.map((address: string) => ({
          target: address,
        })),
        chain: CHAIN.AURORA,
        permitFailure: true
      })
    )
  );
  const tokens0: string[] = underlyingToken0.output.map((res: any) => res.output);
  const tokens1: string[] = underlyingToken1.output.map((res: any) => res.output);
  const coins: string[] = [...new Set(tokens0.concat(tokens1))].map((e: any) => `${CHAIN.AURORA}:${e}`);
  const prices = await getPrices(coins, timestamp);
  const untrackVolumes = logs.map((log: any) => {
    const token0: string = tokens0[pools.indexOf(log.address.toLowerCase())];
    const token1: string = tokens1[pools.indexOf(log.address.toLowerCase())];
    const token0Price = prices[`${CHAIN.AURORA}:${token0}`]?.price || 0;
    const token1Price = prices[`${CHAIN.AURORA}:${token1}`]?.price || 0;
    const token0Decimals = prices[`${CHAIN.AURORA}:${token0}`]?.decimals || 0;
    const token1Decimals = prices[`${CHAIN.AURORA}:${token1}`]?.decimals || 0;
    const data = log.data.replace('0x', '');
    const amount0In = Number('0x' + data.slice(0, 64))
    const amount1In = Number('0x' + data.slice(64, 128))
    const amount0Out = Number('0x' + data.slice(128, 192))
    const amount1Out = Number('0x' + data.slice(192, 256))
    const amount0USD = ((amount0In + amount0Out) / 10 ** token0Decimals) * token0Price;
    const amount1USD = ((amount1In + amount1Out) / 10 ** token1Decimals) * token1Price;
    return token0Price ? amount0USD : amount1USD;
  });
  const dailyVolume = untrackVolumes.reduce((a: number, b: number) => a + b, 0);
  return {
    dailyVolume: dailyVolume.toString(),
    timestamp
  }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.AURORA]: {
      fetch: fetchVolume,
      start: async () => 1678838400,
    }
  }
}

export default adapters
