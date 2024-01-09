import { FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getBlock } from "../../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../../utils/prices";


const pools: string[] = [
'0xf56997948d4235514dcc50fc0ea7c0e110ec255d',
'0xbf9eef63139b67fd0abf22bd5504acb0519a4212',
'0x3502eac6fa27beebdc5cd3615b7cb0784b0ce48f',
'0x256d03607eee0156b8a2ab84da1d5b283219fe97',
'0xbf58062d23f869a90c6eb04b9655f0dfca345947',
'0xca461686c711aeaadf0b516f9c2ad9d9b645a940',
'0xbf560771b6002a58477efbcdd6774a5a1947587b',
'0x957b4bc289d29129680b2d6c6d06c9106a38bb82',
'0xddccf2f096fa400ce90ba0568908233e6a950961',
'0x2a6e6d58547d2580b490445cca0ce625c4f5d84a',
'0x523fae29d7ff6fd38842c8f271edf2ebd3150435',
'0xe22606659ec950e0328aa96c7f616adc4907cbe3',
'0x2e02bea8e9118f7d2ccada1d402286cc6d54bd67',
'0x7e9ea10e5984a09d19d05f31ca3cb65bb7df359d',
'0x10c0c000b9ef01ba07d7473729a19e85e89b6246',
'0xe6c47b036f6fd0684b109b484ac46094e633af2e'
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
