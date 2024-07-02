import { FetchResultV2, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ROUTE_EVENT = 'event Route(address indexed from, address to, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOutMin,uint256 amountOut)'

const RP4_ADDRESS = {
  [CHAIN.ETHEREUM]: '0xe43ca1Dee3F0fc1e2df73A0745674545F11A59F5',
  [CHAIN.ARBITRUM]: '0x544bA588efD839d2692Fc31EA991cD39993c135F',
  [CHAIN.OPTIMISM]: '0x1f2FCf1d036b375b384012e61D3AA33F8C256bbE',
  [CHAIN.BASE]: '0x0389879e0156033202c44bf784ac18fc02edee4f',
  [CHAIN.POLYGON]: '0x46B3fDF7b5CDe91Ac049936bF0bDb12c5d22202e',
  [CHAIN.AVAX]: '0xCdBCd51a5E8728E0AF4895ce5771b7d17fF71959',
  [CHAIN.BSC]: '0x33d91116e0370970444B0281AB117e161fEbFcdD',
  [CHAIN.LINEA]: '0x46b3fdf7b5cde91ac049936bf0bdb12c5d22202e',
  [CHAIN.ARBITRUM_NOVA]: '0xCdBCd51a5E8728E0AF4895ce5771b7d17fF71959',
  [CHAIN.XDAI]: '0x46b3fdf7b5cde91ac049936bf0bdb12c5d22202e',
  [CHAIN.FANTOM]: '0x46b3fdf7b5cde91ac049936bf0bdb12c5d22202e',
  [CHAIN.BITTORRENT]: '0x93c31c9C729A249b2877F7699e178F4720407733',
  [CHAIN.CELO]: '0xCdBCd51a5E8728E0AF4895ce5771b7d17fF71959',
  [CHAIN.FILECOIN]: '0x1f2FCf1d036b375b384012e61D3AA33F8C256bbE',
  [CHAIN.HAQQ]: '0xc3Ec4e1511c6935ed2F92b9A61881a1B95bB1566',
  [CHAIN.KAVA]: '0xB45e53277a7e0F1D35f2a77160e91e25507f1763',
  [CHAIN.METIS]: '0xB45e53277a7e0F1D35f2a77160e91e25507f1763',
  [CHAIN.THUNDERCORE]: '0x57bfFa72db682f7eb6C132DAE03FF36bBEB0c459',
  [CHAIN.SCROLL]: '0x734583f62Bb6ACe3c9bA9bd5A53143CA2Ce8C55A',
  [CHAIN.ZETA]: '0x640129e6b5C31B3b12640A5b39FECdCa9F81C640',
  [CHAIN.MOONBEAM]: '0xB45e53277a7e0F1D35f2a77160e91e25507f1763',
  [CHAIN.MOONRIVER]: '0x46B3fDF7b5CDe91Ac049936bF0bDb12c5d22202e',
  [CHAIN.POLYGON_ZKEVM]: '0x57bfFa72db682f7eb6C132DAE03FF36bBEB0c459',
  [CHAIN.FUSE]: '0x46B3fDF7b5CDe91Ac049936bF0bDb12c5d22202e',
  [CHAIN.HARMONY]: '0x9B3336186a38E1b6c21955d112dbb0343Ee061eE',
  [CHAIN.TELOS]: '0x1400feFD6F9b897970f00Df6237Ff2B8b27Dc82C',
  [CHAIN.BOBA]: '0xe43ca1Dee3F0fc1e2df73A0745674545F11A59F5',
  [CHAIN.BOBA_BNB]: '0xCdBCd51a5E8728E0AF4895ce5771b7d17fF71959',
  [CHAIN.CORE]: '0x0389879e0156033202C44BF784ac18fC02edeE4f',
  [CHAIN.CRONOS]: '0xCdBCd51a5E8728E0AF4895ce5771b7d17fF71959',
  [CHAIN.BLAST]: '0xCdBCd51a5E8728E0AF4895ce5771b7d17fF71959',
  [CHAIN.SKALE_EUROPA]: '0xbA61F775730C0a3E3361717195ee86785ee33055',
  [CHAIN.ROOTSTOCK]: '0xb46e319390De313B8cc95EA5aa30C7bBFD79Da94',
}

const fetch: FetchV2 = async ({ getLogs, createBalances, chain, }): Promise<FetchResultV2> => {
  const dailyVolume = createBalances();
  const logs = (await getLogs({ target: RP4_ADDRESS[chain], eventAbi: ROUTE_EVENT }))
  logs.forEach((log) => {
    dailyVolume.add(log.tokenOut, log.amountOut)
  })
  return { dailyVolume };
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: 1708849166,
    },
    [CHAIN.ARBITRUM_NOVA]: {
      fetch,
      start: 1708859455
    },
    [CHAIN.AVAX]: {
      fetch,
      start: 1708861373
    },
    [CHAIN.BASE]: {
      fetch,
      start: 1708860457
    },
    [CHAIN.BLAST]: {
      fetch,
      start: 1709257139
    },
    [CHAIN.BOBA]: {
      fetch,
      start: 1711114904
    },
    // [CHAIN.BOBA_BNB]: {
    //   fetch,
    //   start: 1708869909
    // },
    [CHAIN.BSC]: {
      fetch,
      start: 1708861767
    },
    [CHAIN.BITTORRENT]: {
      fetch,
      start: 1708849432
    },
    [CHAIN.CELO]: {
      fetch,
      start: 1708862981
    },
    [CHAIN.CORE]: {
      fetch,
      start: 1708868629
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 1708848791
    },
    [CHAIN.FANTOM]: {
      fetch,
      start: 1708862854
    },
    // [CHAIN.FILECOIN]: {
    //   fetch,
    //   start: 1708863300
    // },
    [CHAIN.FUSE]: {
      fetch,
      start: 1708842355
    },
    [CHAIN.XDAI]: {
      fetch,
      start: 1708862650
    },
    // [CHAIN.HAQQ]: {
    //   fetch,
    //   start: 1708838485
    // },
    // [CHAIN.HARMONY]: {
    //   fetch,
    //   start: 1708867604
    // },
    [CHAIN.KAVA]: {
      fetch,
      start: 1708864014
    },
    [CHAIN.LINEA]: {
      fetch,
      start: 1708861967
    },
    [CHAIN.METIS]: {
      fetch,
      start: 1708864370
    },
    [CHAIN.MOONBEAM]: {
      fetch,
      start: 1708866396
    },
    [CHAIN.MOONRIVER]: {
      fetch,
      start: 1708867026
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: 1708860181
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: 1708860721
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch,
      start: 1708867809
    },
    // [CHAIN.ROOTSTOCK]: {
    //   fetch,
    //   start: 1716315751
    // },
    [CHAIN.SCROLL]: {
      fetch,
      start: 1708865967
    },
    // [CHAIN.SKALE_EUROPA]: {
    //   fetch,
    //   start: 1713803839
    // },
    [CHAIN.THUNDERCORE]: {
      fetch,
      start: 1708889900
    },
    [CHAIN.ZETA]: {
      fetch,
      start: 1708865999
    },
  },
  version: 2
}

export default adapters