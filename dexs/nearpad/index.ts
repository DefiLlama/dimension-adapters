import { FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getBlock } from "../../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../../utils/prices";


const pools: string[] = [
  '0xc374776cf5c497adeef6b505588b00cb298531fd',
  '0x73155e476d6b857fe7722aefebad50f9f8bd0b38',
  '0x63b4a0538ce8d90876b201af1020d13308a8b253',
  '0xa188d79d6bdbc1120a662de9eb72384e238af104',
  '0x24886811d2d5e362ff69109aed0a6ee3eeeec00b',
  '0xfe28a27a95e51bb2604abd65375411a059371616',
  '0x1fd6cbbfc0363aa394bd77fc74f64009bf54a7e9',
  '0xb53bc2537e641c37c7b7a8d33aba1b30283cda2f',
  '0xaf3f197ce82bf524dab0e9563089d443cb950048',
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
