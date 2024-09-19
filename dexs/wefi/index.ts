import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const address: any = {
  [CHAIN.LINEA]: '0x7e0da0deccac2e7b9ad06e378ee09c15b5bdeefa',
  [CHAIN.XDC]: '0x7e0da0deccac2e7b9ad06e378ee09c15b5bdeefa',
  [CHAIN.POLYGON]: '0xA42e5d2A738F83a1e1a907eB3aE031e5A768C085',
  [CHAIN.BOBA]: '0x7E0DA0DECCAc2E7B9AD06E378ee09c15B5BDeefa'
}

const stableToken: string[] = [
  "0x49d3f7543335cf38fa10889ccff10207e22110b5", // xdc:FXD
  "0x1ebb2c8a71a9ec59bf558886a8adf8f4a565814f", // xdc:EURS
  "0x66a2a913e447d6b4bf33efbec43aaef87890fbbc", // boba:USDC
  "0x176211869ca2b568f2a7d4ee941e073a821ee1ff", // linea:USDC
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // polygon:USDT
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // polygon:USDC
]

const fetchVolume: FetchV2 = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: address[options.chain],
    topics: ['0x83b12020cebd1d9ce669793959a6d6d48f26757609759d2bb7a45590a158c657'],
  })
  const dailyVolume = options.createBalances();
  logs.forEach((log: any) => {
    const data = log.data.replace('0x', '')
    const amountIn = Number('0x' + data.slice(5 * 64, 6 * 64))
    const amountOut = Number('0x' + data.slice(6 * 64, 7 * 64))
    const address = data.slice(4 * 64, 5 * 64);
    const tokenInAddress = data.slice(3 * 64, 4 * 64);
    const tokenIn =  '0x' + tokenInAddress.slice(24, address.length);
    const tokenOut = '0x' + address.slice(24, address.length);
    if(stableToken.includes(tokenOut)) {
      dailyVolume.add(tokenOut, amountOut)
    } else {
      dailyVolume.add(tokenIn, amountIn)
    }
  });
  return {
    dailyVolume: dailyVolume,
  }
}
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.LINEA]: {
      fetch: fetchVolume,
      start: 1704067200,
    },
    [CHAIN.XDC]: {
      fetch: fetchVolume,
      start: 1704067200,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchVolume,
      start: 1704067200,
    },
    [CHAIN.BOBA]: {
      fetch: fetchVolume,
      start: 1704067200,
    },
  }
}
export default adapter;
