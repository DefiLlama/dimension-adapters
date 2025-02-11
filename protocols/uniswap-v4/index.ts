

// ethereum: { owners: ["0x000000000004444c5dc75cB358380D2e3dE08A90"] },
// optimism: { owners: ["0x9a13f98cb987694c9f086b1f5eb990eea8264ec3"] },
// base: { owners: ["0x498581ff718922c3f8e6a244956af099b2652b2b"] },
// arbitrum: { owners: ["0x360e68faccca8ca495c1b759fd9eee466db9fb32"] },
// polygon: { owners: ["0x67366782805870060151383f4bbff9dab53e5cd6"] },
// blast: { owners: ["0x1631559198a9e474033433b2958dabc135ab6446"] },
// zora: { owners: ["0x0575338e4c17006ae181b47900a84404247ca30f"] },
// wc: { owners: ["0xb1860d529182ac3bc1f51fa2abd56662b7d13f33"] },
// ink: { owners: ["0x360e68faccca8ca495c1b759fd9eee466db9fb32"] },
// soneium: { owners: ["0x360e68faccca8ca495c1b759fd9eee466db9fb32"] },
// avax: { owners: ["0x06380c0e0912312b5150364b9dc4542ba0dbbc85"] },
// bsc: { owners: ["0x28e2ea090877bf75740558f6bfb36a5ffee9e9df"] },

import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const contract_addrress: any = {
  [CHAIN.ETHEREUM]: '0x000000000004444c5dc75cB358380D2e3dE08A90',
  [CHAIN.OPTIMISM]: '0x9a13f98cb987694c9f086b1f5eb990eea8264ec3',
  [CHAIN.BASE]: '0x498581ff718922c3f8e6a244956af099b2652b2b',
  [CHAIN.ARBITRUM]: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
  [CHAIN.POLYGON]: '0x67366782805870060151383f4bbff9dab53e5cd6',
  [CHAIN.BLAST]: '0x1631559198a9e474033433b2958dabc135ab6446',
  [CHAIN.ZORA]: '0x0575338e4c17006ae181b47900a84404247ca30f',
  [CHAIN.WC]: '0xb1860d529182ac3bc1f51fa2abd56662b7d13f33',
  [CHAIN.INK]: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
  [CHAIN.SONEIUM]: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
  [CHAIN.AVAX]: '0x06380c0e0912312b5150364b9dc4542ba0dbbc85',
  [CHAIN.BSC]: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df',
}

const swap_event = 'event Swap(PoolId indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24fee)'

const fetchData = async (options: FetchOptions) => {
  const chain = options.chain
  const logs = await options.getLogs({
    target: contract_addrress[options.chain],
    topics: [swap_event]
  })
  const dailyVolume = options.createBalances();

  logs.forEach((log: any, idx: number) => {
      // const fee = Number(log.fee)/1e6
      // // logs.forEach((log: any) => {
      //   addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
      //   addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0) * fee, amount1: Number(log.amount1) * fee })
      // // })
    })

}
