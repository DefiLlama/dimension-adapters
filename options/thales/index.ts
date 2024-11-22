import ADDRESSES from '../../helpers/coreAssets.json'
import { addTokensReceived } from '../../helpers/token';
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const config = {
  optimism: { 
    tokens: [ADDRESSES.optimism.sUSD, ADDRESSES.optimism.USDC_CIRCLE, ADDRESSES.optimism.WETH_1], 
    fromAdddesses: [
      '0x5ae7454827d83526261f3871c1029792644ef1b1', 
      '0x278b5a44397c9d8e52743fedec263c4760dc1a1a',
      '0x2d356b114cbca8deff2d8783eac2a5a5324fe1df',
      '0xE16B8a01490835EC1e76bAbbB3Cadd8921b32001',
      '0xFb4e4811C7A811E098A556bD79B64c20b479E431',
      '0x170a5714112daeff20e798b6e92e25b86ea603c1',
      '0x82b3634c0518507d5d817be6dab6233ebe4d68d9'
    ], 
    targets: [
      '0xe853207c30f3c32eda9aeffddc67357d5332978c', 
      '0xC392133eEa695603B51a5d5de73655d571c2CE51'
    ],
  },
  arbitrum: {
    tokens: [ADDRESSES.arbitrum.USDC, ADDRESSES.arbitrum.USDC_CIRCLE, ADDRESSES.arbitrum.WETH],
    fromAdddesses: [
      '0x2b89275efb9509c33d9ad92a4586bdf8c4d21505',
      '0x5cf3b1882357bb66cf3cd2c85b81abbc85553962',
      '0x02D0123a89Ae6ef27419d5EBb158d1ED4Cf24FA3',
      '0xfb64E79A562F7250131cf528242CEB10fDC82395',
      '0xae56177e405929c95e5d4b04c0c87e428cb6432b',
      '0x2bb7d689780e7a34dd365359bd7333ab24903268'
    ],
    targets: [
      '0xCd9c0E99396627C7746b4363B880939Ac2828d3E', 
      '0x160Ca569999601bca06109D42d561D85D6Bb4b57'
    ],
  },
  base: {
    tokens: [ADDRESSES.base.USDbC],
    fromAdddesses: [
      '0xAFD339acf24813e8038bfdF19A8d87Eb94B4605d',
      '0x5625c3233b52206a5f23c5fC1Ce16F6A7e3874dd',
      '0xe41cD3A25CBdeDA0BC46D48C380393D953bD2034',
      '0xB8109ac56EE572990e6d2C6b4648042bB1C33317',
      '0x85b827d133FEDC36B844b20f4a198dA583B25BAA'
    ],
    targets: [
      '0xe8e022405505a9F2b0B7452C844F1e64423849fC', 
      '0x84aB38e42D8Da33b480762cCa543eEcA6135E040'
    ],
  }
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = await addTokensReceived({ ...config[options.chain], options})
    return {
      dailyFees,
    };
  };


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch, start: '2022-09-06',
    },
    [CHAIN.OPTIMISM]: {
      fetch, start: '2022-01-10',
    },
    [CHAIN.BASE]: {
      fetch, start: '2023-08-10',
    },
  },
};
export default adapter;
