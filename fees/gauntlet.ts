import { SimpleAdapter } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  methodology: {
    Fees: 'Total fees were generated from all vaults curated by Gauntlet.',
    Revenue: 'Amount of fees were collected by Gauntlet from all curated vaults.',
  },
  vaults: {
    ethereum: {
      morpho: [
        '0x8eB67A509616cd6A7c1B3c8C21D48FF57df3d458',
        '0x2371e134e3455e0593363cBF89d3b6cf53740618',
        '0x132E6C9C33A62D7727cd359b1f51e5B566E485Eb',
        '0x4881Ef0BF6d2365D3dd6499ccd7532bcdBCE0658',
        '0xdC94785959B73F7A168452b3654E44fEc6A750e4',
        '0xdd0f28e19C1780eb6396170735D45153D261490d',
        '0x500331c9fF24D9d11aee6B07734Aa72343EA74a5',
        '0x443df5eEE3196e9b2Dd77CaBd3eA76C3dee8f9b2',
        '0x701907283a57FF77E255C3f1aAD790466B8CE4ef',
        '0x4Ff4186188f8406917293A9e01A1ca16d3cf9E59',
        '0xc080f56504e0278828A403269DB945F6c6D6E014',
        '0x059Fc6723b9bF77DbF4283C8d7C90eA8Af44EF10',
        '0x8CB3649114051cA5119141a34C200D65dc0Faa73',
        '0xdBB316375B4dC992B2c8827D120c09dFB1d3455D',
        '0xc582F04d8a82795aa2Ff9c8bb4c1c889fe7b754e',
        '0x6859B34a9379122d25A9FA46f0882d434fee36c3',
        '0x78B18E07dc43017fcEaabaD0751d6464c0F56b25',
        '0x1B4cd53a1A8e5F50aB6320EF34E5fB4D3df7B6f6',
        '0xA8875aaeBc4f830524e35d57F9772FfAcbdD6C45',
        '0x1e6ffa4e9F63d10B8820A3ab52566Af881Dab53c',
        '0x125D41A6e5dbf455cD9Df8F80BCC6fd172D52Cc6',
        '0x0404fD1a77756EB029F06b5CDea88B2B2ddC2fEE',
        '0xEbFA750279dEfa89b8D99bdd145a016F6292757b',
        '0xF587f2e8AfF7D76618d3B6B4626621860FbD54e3',
        '0x3365184e87d2Bd75961780454A5810BEc956F0dD',
      ],
    },
    base: {
      morpho: [
        '0x616a4E1db48e22028f6bbf20444Cd3b8e3273738',
        '0x27D8c7273fd3fcC6956a0B370cE5Fd4A7fc65c18',
        '0x6b13c060F13Af1fdB319F52315BbbF3fb1D88844',
        '0x5a47C803488FE2BB0A0EAaf346b420e4dF22F3C7',
        '0x6770216aC60F634483Ec073cBABC4011c94307Cb',
        '0xc0c5689e6f4D256E861F65465b691aeEcC0dEb12',
        '0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61',
        '0x0D05e6ec0A10f9fFE9229EAA785c11606a1d13Fb',
        '0x5A32099837D89E3a794a44fb131CBbAD41f87a8C',
        '0x23479229e52Ab6aaD312D0B03DF9F33B46753B5e',
        '0x43Cd00De63485618A5CEEBE0de364cD6cBeB26E7',
        '0x1c155be6bC51F2c37d472d4C2Eba7a637806e122',
        '0x9aB2d181E4b87ba57D5eD564D3eF652C4E710707',
        '0xCd347c1e7d600a9A3e403497562eDd0A7Bc3Ef21',
        '0x0FE5b4aF0337Fd5b2E1675D5f5E8c9101E4D3c7e',
        '0x1D3b1Cd0a0f242d598834b3F2d126dC6bd774657',
        "0x236919F11ff9eA9550A4287696C2FC9e18E6e890"
      ],
    },
    polygon: {
      morpho: [
        '0xF5C81d25ee174d83f1FD202cA94AE6070d073cCF',
        '0x781FB7F6d845E3bE129289833b04d43Aa8558c42',
        '0xfD06859A671C21497a2EB8C5E3fEA48De924D6c8',
        '0x3F33F9f7e2D7cfBCBDf8ea8b870a6E3d449664c2',
      ]
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: getCuratorExport(curatorConfig),
}

export default adapter
