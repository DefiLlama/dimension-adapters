import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const address: any = {
  [CHAIN.LINEA]: '0x7e0da0deccac2e7b9ad06e378ee09c15b5bdeefa',
  [CHAIN.XDC]: '0x7e0da0deccac2e7b9ad06e378ee09c15b5bdeefa',
  [CHAIN.POLYGON]: '0xA42e5d2A738F83a1e1a907eB3aE031e5A768C085',
}

const fetchVolume: FetchV2 = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: address[options.chain],
    topics: ['0x83b12020cebd1d9ce669793959a6d6d48f26757609759d2bb7a45590a158c657'],
  })
  const dailyVolume = options.createBalances();
  logs.forEach((log: any) => {
    const data = log.data.replace('0x', '')
    const amountOut = Number('0x' + data.slice(6 * 64, 7 * 64))
    const address = data.slice(4 * 64, 5 * 64);
    const tokenOut = '0x' + address.slice(24, address.length);
    dailyVolume.add(tokenOut, amountOut)
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
  }
}
export default adapter;
