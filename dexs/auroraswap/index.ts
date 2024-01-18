import { FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getBlock } from "../../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { getPrices } from "../../utils/prices";


const pools: string[] = [
  '0xf3de9dc38f62608179c45fe8943a0ca34ba9cefc',
  '0xc57ecc341ae4df32442cf80f34f41dc1782fe067',
  '0x480a68ba97d70495e80e11e05d59f6c659749f27',
  '0xec538fafafcbb625c394c35b11252cef732368cd',
  '0xdb0363ee28a5b40bdc2f4701e399c63e00f91aa8',
  '0xefcf518ca36dc3362f539965807b42a77dc26be0',
  '0x5bdac608cd38c5c8738f5be20813194a3150d4ff',
  '0xcb8584360dc7a4eac4878b48fb857aa794e46fa8',
  '0x865c59d555e59c9f35487bbdfb22d617c67aeabd',
  '0xe11a3f2bab372d88d133b64487d1772847eec4ea',
  '0x23524a789f93b798a6e7011b276edf09083cfde6',
  '0x30c3d6c114a350026ea0aa770788374ad6c6f765'
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
