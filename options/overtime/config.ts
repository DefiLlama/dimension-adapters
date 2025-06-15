import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from "../../helpers/chains";

export const OVERTIME_CHAIN_CONFIG = {
  optimism: { 
    tokens: [
      ADDRESSES.optimism.USDC_CIRCLE, 
      ADDRESSES.optimism.USDC,
      ADDRESSES.optimism.DAI,
      ADDRESSES.optimism.USDT,
      ADDRESSES.optimism.OP,
      ADDRESSES.optimism.WETH,
      ADDRESSES.optimism.WETH_1,
      '0xedf38688b27036816a50185caa430d5479e1c63e' // OVERTIME TOKEN
    ], 
    fromAddresses: [
      '0xFb4e4811C7A811E098A556bD79B64c20b479E431', // Sports AMM V2
      '0x9Ce94cdf8eCd57cec0835767528DC88628891dd9', // Thales AMM
      '0xEd59dCA9c272FbC0ca4637F32ab32CBDB62E856B', // Ranged AMM
      '0xE16B8a01490835EC1e76bAbbB3Cadd8921b32001', // Speed Market
      '0xFf8Cf5ABF583D0979C0B9c35d62dd1fD52cce7C7', // Chained Speed Market
    ], 
    targets: [
      '0x7B280E647966a8FAc7eaB3157dAD8da3e37dDA35'
    ],
  },
  arbitrum: {
    tokens: [
      ADDRESSES.arbitrum.USDC, 
      ADDRESSES.arbitrum.USDC_CIRCLE, 
      ADDRESSES.arbitrum.DAI,
      ADDRESSES.arbitrum.USDT,
      ADDRESSES.arbitrum.ARB,
      ADDRESSES.arbitrum.WBTC,
      ADDRESSES.arbitrum.WETH,
      '0x5829d6fe7528bc8e92c4e81cc8f20a528820b51a' // OVERTIME TOKEN
    ],
    fromAddresses: [
      '0xfb64E79A562F7250131cf528242CEB10fDC82395', // Sports AMM V2
      '0x2b89275efb9509c33d9ad92a4586bdf8c4d21505', // Thales AMM
      '0x5cf3b1882357bb66cf3cd2c85b81abbc85553962', // Ranged AMM
      '0x02D0123a89Ae6ef27419d5EBb158d1ED4Cf24FA3', // Speed Market
      '0xe92B4c614b04c239d30c31A7ea1290AdDCb8217D', // Chained Speed Market
    ],
    targets: [
      '0x4952802B950e3f2F45eaF550f25546b188B3648A',
    ],
  },
  base: {
    tokens: [
      ADDRESSES.base.USDC,
      ADDRESSES.base.USDbC,
      ADDRESSES.base.DAI,
      ADDRESSES.base.USDT,
      ADDRESSES.base.WETH,
      '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', // cbBTC
      '0x7750c092e284e2c7366f50c8306f43c7eb2e82a2' // OVERTIME TOKEN
    ],
    fromAddresses: [
      '0x76923cDDE21928ddbeC4B8BFDC8143BB6d0841a8', // Sports AMM V2
      '0x85b827d133FEDC36B844b20f4a198dA583B25BAA', // Speed Markets
      '0x6848F001ddDb4442d352C495c7B4a231e3889b70'  // Chained Speed Markets
    ],
    targets: [
      '0x7E5828c72225A1d046f5F7e60Ea7cd19116FAFe7', 
    ],
  },
  polygon: {
    tokens: [
      ADDRESSES.polygon.USDC,
    ],
    fromAddresses: [
      '0x4B1aED25f1877E1E9fBECBd77EeE95BB1679c361', // Speed Markets
      '0x14D2d7f64D6F10f8eF06372c2e5E36850661a537', // Chained Speed Markets
    ],
    targets: [
      '0xE931777640149fE67aE0771FF250aC93A5c38E85', 
    ],
  }
}

export const OVERTIME_CONTRACT_ADDRESSES = {
    [CHAIN.OPTIMISM]: {
      sportsAMMV2: "0xFb4e4811C7A811E098A556bD79B64c20b479E431",
      thalesAMM: "0x9Ce94cdf8eCd57cec0835767528DC88628891dd9",
      rangedAMM: "0xEd59dCA9c272FbC0ca4637F32ab32CBDB62E856B",
      speedMarket: "0xE16B8a01490835EC1e76bAbbB3Cadd8921b32001",
      chainedSpeedMarket: "0xFf8Cf5ABF583D0979C0B9c35d62dd1fD52cce7C7",
    },
    [CHAIN.ARBITRUM]: {
      sportsAMMV2: "0xfb64E79A562F7250131cf528242CEB10fDC82395",
      thalesAMM: "0x2b89275efB9509c33d9AD92A4586bdf8c4d21505",
      rangedAMM: "0x5cf3b1882357BB66Cf3cd2c85b81AbBc85553962",
      speedMarket: "0x02D0123a89Ae6ef27419d5EBb158d1ED4Cf24FA3",
      chainedSpeedMarket: "0xe92B4c614b04c239d30c31A7ea1290AdDCb8217D",
    },
    [CHAIN.BASE]: {
      sportsAMMV2: "0x76923cDDE21928ddbeC4B8BFDC8143BB6d0841a8",
      speedMarket: "0x85b827d133FEDC36B844b20f4a198dA583B25BAA",
      chainedSpeedMarket: "0x6848F001ddDb4442d352C495c7B4a231e3889b70"
    },
    [CHAIN.POLYGON]: {
      speedMarket: "0x4B1aED25f1877E1E9fBECBd77EeE95BB1679c361",
      chainedSpeedMarket: "0x14D2d7f64D6F10f8eF06372c2e5E36850661a537"
    }
  };