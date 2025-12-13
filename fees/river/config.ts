import { CHAIN } from "../../helpers/chains";

type ChainConfig = {
    satoshiXapp: string;
    stableCoin: string;
    start: string;
}

export const config: Record<string, ChainConfig> = {
    [CHAIN.ARBITRUM]: {
        satoshiXapp: '0x07BbC5A83B83a5C440D1CAedBF1081426d0AA4Ec',
        stableCoin: '0xb4818BB69478730EF4e33Cc068dD94278e2766cB',
        start: '2025-04-27',
    },
    [CHAIN.BASE]: {
        satoshiXapp: '0x9a3c724ee9603A7550499bE73DC743B371811dd3',
        stableCoin: '0x70654AaD8B7734dc319d0C3608ec7B32e03FA162',
        start: '2025-04-12',
    },
    [CHAIN.BITLAYER]: {
        satoshiXapp: '0x95E5b977c8c33DE5b3B5D2216F1097C2017Bdf71',
        stableCoin: '0xba50dDac6B2F5482cA064EFAc621E0C7c0f6A783',
        start: '2025-02-07',
    },
    [CHAIN.BSC]: {
        satoshiXapp: '0x07BbC5A83B83a5C440D1CAedBF1081426d0AA4Ec',
        stableCoin: '0xb4818BB69478730EF4e33Cc068dD94278e2766cB',
        start: '2025-02-21',
    },
    [CHAIN.BOB]: {
        satoshiXapp: '0xEC272aF6e65C4D7857091225fa8ED300Df787CCF',
        stableCoin: '0xecf21b335B41f9d5A89f6186A99c19a3c467871f',
        start: '2025-02-07',
    },
    [CHAIN.BSQUARED]: {
        satoshiXapp: '0x2863E3D0f29E2EEC6adEFC0dF0d3171DaD542c02',
        stableCoin: '0x8dD8b12d55C73c08294664a5915475eD1c8b1F6f',
        start: '2025-02-07',
    },
    [CHAIN.ETHEREUM]: {
        satoshiXapp: '0xb8374e4DfF99202292da2FE34425e1dE665b67E6',
        stableCoin: '0x1958853A8BE062dc4f401750Eb233f5850F0d0d2',
        start: '2025-8-20',
    },
    [CHAIN.HEMI]: {
        satoshiXapp: '0x07BbC5A83B83a5C440D1CAedBF1081426d0AA4Ec',
        stableCoin: '0xb4818BB69478730EF4e33Cc068dD94278e2766cB',
        start: '2025-02-21',
    },
}