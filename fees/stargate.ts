import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

const event0_swap = 'event Swap(uint16 chainId,uint256 dstPoolId,address from,uint256 amountSD,uint256 eqReward,uint256 eqFee,uint256 protocolFee,uint256 lpFee)'
const event0_swap_remote = 'event SwapRemote( address to,uint256 amountSD,uint256 protocolFee,uint256 dstFee)'

type IAddress = {
  [s: string | Chain]: string[];
}

const contract_address: IAddress = {
  [CHAIN.ETHEREUM]: [
    '0xdf0770dF86a8034b3EFEf0A1Bb3c889B8332FF56',
    '0x38EA452219524Bb87e18dE1C24D3bB59510BD783',
    '0x101816545F6bd2b1076434B54383a1E633390A2E',
  ],
  [CHAIN.ARBITRUM]: [
    '0x892785f33CdeE22A30AEF750F285E18c18040c3e',
    '0xB6CfcF89a7B22988bfC96632aC2A9D6daB60d641',
    '0x915A55e36A01285A14f05dE6e81ED9cE89772f8e',
  ],
  [CHAIN.AVAX]: [
    '0x1205f31718499dBf1fCa446663B532Ef87481fe1',
    '0x29e38769f23701A2e4A8Ef0492e19dA4604Be62c',
  ],
  [CHAIN.BSC]: [
    '0x9aA83081AA06AF7208Dcc7A4cB72C94d057D2cda',
    '0x98a5737749490856b401DB5Dc27F522fC314A4e1',
  ],
  [CHAIN.FANTOM]: [
    '0x12edeA9cd262006cC3C4E77c90d2CD2DD4b1eb97'
  ],
  [CHAIN.OPTIMISM]: [
    '0xDecC0c09c3B5f6e92EF4184125D5648a66E35298',
    '0xd22363e3762cA7339569F3d33EADe20127D5F98C',
  ],
  [CHAIN.POLYGON]: [
    '0x1205f31718499dBf1fCa446663B532Ef87481fe1',
    '0x29e38769f23701A2e4A8Ef0492e19dA4604Be62c',
  ]
}

type IMap = {
  [s: string]: string;
}

const mapTokenPrice: IMap = {
  ['0x101816545f6bd2b1076434b54383a1e633390a2e'.toLowerCase()]: ADDRESSES.null,
  ['0x915a55e36a01285a14f05de6e81ed9ce89772f8e'.toLowerCase()]: ADDRESSES.null,
  ['0xd22363e3762ca7339569f3d33eade20127d5f98c'.toLowerCase()]: ADDRESSES.null,
}

const fetch = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, getLogs }: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = createBalances()
    const transform = (a: string) => mapTokenPrice[a.toLowerCase()] ?? a
    const logs = await getLogs({ targets: contract_address[chain], eventAbi: event0_swap, flatten: false, })
    const logs_swap_remote = await getLogs({ targets: contract_address[chain], eventAbi: event0_swap_remote, flatten: false })
    logs.forEach((_: any, index: number) => _.forEach((log: any) => dailyFees.add(transform(contract_address[chain][index]), log.protocolFee)))
    logs_swap_remote.forEach((_: any, index: number) => _.forEach((log: any) => dailyFees.add(transform(contract_address[chain][index]), log.protocolFee)))
    return { dailyFees, dailyRevenue: dailyFees, timestamp, }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: 1661990400,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1661990400,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: 1661990400,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: 1661990400,
    },
    // [CHAIN.FANTOM]: {
    //   fetch: fetch(CHAIN.FANTOM),
    //   start: 1661990400,
    // },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: 1661990400,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: 1661990400,
    },
  }
}

export default adapter;
