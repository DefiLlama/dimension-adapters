import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";


type TMarketPlaceAddress = {
  [l: string | Chain]: string;
}
const marketplace_address: TMarketPlaceAddress = {
  [CHAIN.OPTIMISM]: '0x11c9e50dfde606a864a25726d174faf947626f3d',
  [CHAIN.ARBITRUM]: '0x1A7b46C660603EBB5FBe3AE51e80AD21dF00bDd1',
  [CHAIN.ARBITRUM_NOVA]: '0x1a7b46c660603ebb5fbe3ae51e80ad21df00bdd1',
  [CHAIN.ERA]: '0xf7Ce7998B4c8aFc97a15c32E724ae2C0D0F90F73',
  [CHAIN.POLYGON_ZKEVM]: '0x1a7b46c660603ebb5fbe3ae51e80ad21df00bdd1',
  [CHAIN.BASE]: '0xdc7d3f21132e7fa9df6602a6e87fcbd49183a728',
  [CHAIN.LINEA]: '0x1A7b46C660603EBB5FBe3AE51e80AD21dF00bDd1'
}

const fetch = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, }: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = createBalances()
    const dailyRevenue = createBalances();
    (await getLogs({
      target: marketplace_address[chain],
      eventAbi: 'event ZonicBasicOrderFulfilled (address offerer, address buyer, address token, uint256 identifier, address currency, uint256 totalPrice, uint256 creatorFee, uint256 marketplaceFee, address saleId)'
    })).forEach((e: any) => {
      dailyFees.addGasToken(e.marketplaceFee)
      dailyFees.addGasToken(e.creatorFee)
      dailyRevenue.addGasToken(e.marketplaceFee)
    })
    return { dailyFees, dailyRevenue, timestamp }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: '2023-02-03',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: '2023-02-03',
    },
    [CHAIN.ARBITRUM_NOVA]: {
      fetch: fetch(CHAIN.ARBITRUM_NOVA),
      start: '2023-02-03',
    },
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: '2023-03-28',
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: fetch(CHAIN.POLYGON_ZKEVM),
      start: '2023-03-28',
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: '2023-08-22',
    },
    [CHAIN.LINEA]: {
      fetch: fetch(CHAIN.LINEA),
      start: '2023-08-22',
    }
  }
}

export default adapter;
