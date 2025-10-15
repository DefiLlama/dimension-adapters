import { CHAIN } from "../../helpers/chains";
import { ICurveDexConfig, ContractVersion, getCurveExport } from "../../helpers/curve";

const CurveDexConfigs: {[key: string]: ICurveDexConfig} = {
  [CHAIN.ETHEREUM]: {
    start: '2020-09-06',
    stable_factory: [
      '0xb9fc157394af804a3578134a6585c0dc9cc990d4',
    ],
    factory_crypto: [
      '0xf18056bbd320e96a48e3fbf8bc061322531aac99',
    ],
    factory_crvusd: [
      '0x4f8846ae9380b90d2e71d5e3d042dff3e7ebb40d',
    ],
    factory_twocrypto: [
      '0x98ee851a00abee0d95d08cf4ca2bdce32aeaaf7f',
    ],
    factory_tricrypto: [
      '0x0c0e5f2ff0ff18a3be9b835635039256dc4b4963',
    ],
    factory_stable_ng: [
      '0x6a8cbed756804b16e05e741edabd5cb544ae21bf',
    ],
    customPools: {
      [ContractVersion.main]: [
        '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7', // DAI/USDC/USDT
        '0xDeBF20617708857ebe4F679508E7b7863a8A8EeE', // aDAI/aUSDC/aUSDT
        '0xA96A65c051bF88B4095Ee1f2451C2A9d43F53Ae2',
        '0x79a8C46DeA5aDa233ABaFFD40F3A0A2B1e5A4F27',
        '0xA2B47E3D5c44877cca798226B7B8118F9BFb7A56',
        '0x0Ce6a5fF5217e38315f87032CF90686C96627CAA',
        '0x4CA9b3063Ec5866A4B82E437059D2C43d1be596F',
        '0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF',
        '0xF178C0b5Bb7e7aBF4e12A4838C7b7c5bA2C623c0',
        '0x06364f10B501e868329afBc005b3492902d6C763',
        '0x93054188d876f558f4a66B2EF1d97d16eDf0895B',
        '0xEB16Ae0052ed37f479f7fe63849198Df1765a733',
        '0x7fC77b5c7614E1533320Ea6DDc2Eb61fa00A9714',
        '0xc5424B857f758E906013F3555Dad202e4bdB4567',
        '0xDC24316b9AE028F1497c275EB9192a3Ea0f67022',
        '0xA5407eAE9Ba41422680e2e00537571bcC53efBfD',
        '0x52EA46506B9CC5Ef470C5bf89f17Dc28bB35D85C',
        '0x45F783CCE6B7FF23B2ab2D70e416cdb7D6055f51',
        '0x8038C01A0390a8c547446a0b2c18fc9aEFEcc10c',
        '0x4f062658EaAF2C1ccf8C8e36D6824CDf41167956',
        '0x3eF6A01A0f81D6046290f3e2A8c5b843e738E604',
        '0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171',
        '0x8474DdbE98F5aA3179B3B3F5942D724aFcdec9f6',
        '0xC18cC39da8b11dA8c3541C598eE022258F9744da',
        '0x3E01dD8a5E1fb3481F0F589056b428Fc308AF0Fb',
        '0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1',
        '0x42d7025938bEc20B69cBae5A77421082407f053A',
        '0x890f4e345B1dAED0367A877a1612f86A1f86985f',
        '0x071c661B4DeefB59E2a3DdB20Db036821eeE8F4b',
        '0xd81dA8D904b52208541Bade1bD6595D8a251F8dd',
        '0x7F55DDe206dbAD629C080068923b36fe9D6bDBeF',
        '0xC25099792E9349C7DD09759744ea681C7de2cb66',
        '0xEcd5e75AFb02eFa118AF914515D6521aaBd189F1',
        '0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA',
        '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B',
        '0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a',
        '0xF9440930043eb3997fc70e1339dBb11F341de7A8',
        '0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c',
        '0x80466c64868E1ab14a1Ddf27A676C3fcBE638Fe5',
        '0x618788357D0EBd8A37e763ADab3bc575D54c2C7d',
        '0x5a6A4D54456819380173272A5E8E9B9904BdF41B',
        '0xFD5dB7463a3aB53fD211b4af195c5BCCC1A03890',
        '0x4e0915C88bC70750D68C481540F081fEFaF22273',
        '0x1005F7406f32a61BD760CfA14aCCd2737913d546',
        '0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2',
        '0xa1F8A6807c402E4A15ef4EBa36528A3FED24E577',
        '0xf253f83AcA21aAbD2A20553AE0BF7F65C755A07F',
        '0xaE34574AC03A15cd58A92DC79De7B1A0800F1CE3',
        '0xBfAb6FA95E0091ed66058ad493189D2cB29385E6',
      ],
      [ContractVersion.crypto]: [
        '0xD51a44d3FaE010294C616388b506AcdA1bfAAE46',
        '0x9838eCcC42659FA8AA7daF2aD134b53984c9427b',
        '0x98a7F18d4E56Cfe84E3D081B40001B3d5bD3eB8B',
        '0xE84f5b1582BA325fDf9cE6B0c1F087ccfC924e54',
        '0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4',
        '0xAdCFcf9894335dC340f6Cd182aFA45999F45Fc44',
        '0x98638FAcf9a3865cd033F36548713183f6996122',
        '0x752eBeb79963cf0732E9c0fec72a49FD1DEfAEAC',
      ],
    },
    metaBasePools: {
      '0x6c3f90f043a72fa612cbac8115ee7e52bde6e490': {
        tokens: [
          '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
          '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
        ],
      },
      '0x3175df0976dfa876431c2e9ee6bc45b65d3473cc': {
        tokens: [
          '0x853d955aCEf822Db058eb8505911ED77F175b99e', // FRAX
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        ],
      },
      '0x075b1bb99792c9e1041ba13afef80c91a1e70fb3': {
        tokens: [
          '0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D',
          '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
          '0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6',
        ],
      },
      '0x49849c98ae39fff122806c06791fa73784fb3675': {
        tokens: [
          '0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D',
          '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        ],
      },
      '0x051d7e5609917bd9b73f04bac0ded8dd46a74301': {
        tokens: [
          '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
          '0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6',
        ],
      },
    },
  },
  [CHAIN.ARBITRUM]: {
    start: '2021-09-12',
    stable_factory: [
      '0xb17b674D9c5CB2e441F8e196a2f048A81355d031'
    ],
    factory_twocrypto: [
      '0x98ee851a00abee0d95d08cf4ca2bdce32aeaaf7f',
    ],
    factory_tricrypto: [
      '0xbc0797015fcfc47d9c1856639cae50d0e69fbee8',
    ],
    factory_stable_ng: [
      '0x9af14d26075f142eb3f292d5065eb3faa646167b',
    ],
    customPools: {
      [ContractVersion.main]: [
        '0x7f90122BF0700F9E7e1F688fe926940E8839F353',
        '0x3E01dD8a5E1fb3481F0F589056b428Fc308AF0Fb',
        '0x6eB2dc694eB516B16Dc9FBc678C60052BbdD7d80',
        '0x30dF229cefa463e991e29D42DB0bae2e122B2AC7',
        '0xC9B8a3FDECB9D5b218d02555a8Baf332E5B740d5',
      ],
      [ContractVersion.crypto]: [
        '0x960ea3e3C7FB317332d990873d354E18d7645590',
        '0xA827a652Ead76c6B0b3D19dba05452E06e25c27e',
      ],
    },
    metaBasePools: {
      '0x7f90122bf0700f9e7e1f688fe926940e8839f353': {
        tokens: [
          '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
          '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        ],
      },
      '0x3e01dd8a5e1fb3481f0f589056b428fc308af0fb': {
        tokens: [
          '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
          '0xDBf31dF14B66535aF65AaC99C32e9eA844e14501',
        ],
      },
      '0xc9b8a3fdecb9d5b218d02555a8baf332e5b740d5': {
        tokens: [
          '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F',
          '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        ],
      },
    }
  },
  [CHAIN.OPTIMISM]: {
    start: '2022-01-17',
    stable_factory: [
      '0x2db0E83599a91b508Ac268a6197b8B14F5e72840',
    ],
    factory_twocrypto: [
      '0x98EE851a00abeE0d95D08cF4CA2BdCE32aeaAF7F',
    ],
    factory_tricrypto: [
      '0xc6C09471Ee39C7E30a067952FcC89c8922f9Ab53',
    ],
    factory_stable_ng: [
      '0x5eee3091f747e60a045a2e715a4c71e600e31f6e',
    ],
    customPools: {
      [ContractVersion.main]: [
        '0x1337BedC9D22ecbe766dF105c9623922A27963EC',
        '0x29A3d66B30Bc4AD674A4FDAF27578B64f6afbFe7',
        '0x66B5792ED50a2a7405Ea75C4B6B1913eF4E46661',
        '0xB90B9B1F91a01Ea22A182CD84C1E22222e39B415',
      ],
    },
    metaBasePools: {
      '0x1337bedc9d22ecbe766df105c9623922a27963ec': {
        tokens: [
          '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
          '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
          '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        ]
      },
      '0x29a3d66b30bc4ad674a4fdaf27578b64f6afbfe7': {
        tokens: [
          '0x2E3D870790dC77A83DD1d18184Acc7439A53f475',
          '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
        ]
      },
    }
  },
  [CHAIN.AVAX]: {
    start: '2021-06-12',
    stable_factory: [
      '0xb17b674D9c5CB2e441F8e196a2f048A81355d031',
    ],
    customPools: {
      [ContractVersion.main]: [
        '0x7f90122BF0700F9E7e1F688fe926940E8839F353',
        '0x16a7DA911A4DD1d83F3fF066fE28F3C792C50d90',
        '0xD2AcAe14ae2ee0f6557aC6C6D0e407a92C36214b',
      ],
      [ContractVersion.crypto]: [
        '0xB755B949C126C04e0348DD881a5cF55d424742B2',
        '0x204f0620E7E7f07B780535711884835977679bba',
      ],
    },
    metaBasePools: {
      '0x1337bedc9d22ecbe766df105c9623922a27963ec': {
        tokens: [
          '0x47AFa96Cdc9fAb46904A55a6ad4bf6660B53c38a',
          '0x46A51127C3ce23fb7AB1DE06226147F446e4a857',
          '0x532E6537FEA298397212F09A61e03311686f548e',
        ]
      },
      '0xdbf31df14b66535af65aac99c32e9ea844e14501': {
        tokens: [
          '0x686bEF2417b6Dc32C50a3cBfbCC3bb60E1e9a15D',
          '0xDBf31dF14B66535aF65AaC99C32e9eA844e14501',
        ]
      }
    }
  },
  [CHAIN.POLYGON]: {
    start: '2021-10-05',
    stable_factory: [
      '0x722272D36ef0Da72FF51c5A65Db7b870E2e8D4ee',
    ],
    factory_crypto: [
      '0xE5De15A9C9bBedb4F5EC13B131E61245f2983A69',
    ],
    factory_twocrypto: [
      '0x98EE851a00abeE0d95D08cF4CA2BdCE32aeaAF7F',
    ],
    factory_tricrypto: [
      '0xC1b393EfEF38140662b91441C6710Aa704973228',
    ],
    factory_stable_ng: [
      '0x1764ee18e8B3ccA4787249Ceb249356192594585',
    ],
    customPools: {
      [ContractVersion.main]: [
        '0xC2d95EEF97Ec6C17551d45e77B590dc1F9117C67',
        '0x445FE580eF8d70FF569aB36e80c647af338db351',
      ],
      [ContractVersion.crypto]: [
        '0x92215849c439E1f8612b6646060B4E3E5ef822cC',
        '0x751B1e21756bDbc307CBcC5085c042a0e9AaEf36',
        '0xB446BF7b8D6D4276d0c75eC0e3ee8dD7Fe15783A',
        '0x9b3d675FDbe6a0935E8B7d1941bc6f78253549B7',
      ]
    },
    metaBasePools: {
      '0xf8a57c1d3b9629b77b6726a042ca48990a84fb49': {
        tokens: [
          '0x5c2ed810328349100A66B82b78a1791B101C9D61',
          '0xDBf31dF14B66535aF65AaC99C32e9eA844e14501',
        ]
      },
      '0xe7a24ef0c5e95ffb0f6684b813a78f2a3ad7d171': {
        tokens: [
          '0x27F8D03b3a2196956ED754baDc28D73be8830A6e',
          '0x1a13F4Ca1d028320A707D99520AbFefca3998b7F',
          '0x60D55F02A771d515e077c9C2403a1ef324885CeC',
        ]
      },
    }
  },
  [CHAIN.BASE]: {
    start: '2023-04-17',
    stable_factory: [
      '0x3093f9b57a428f3eb6285a589cb35bea6e78c336',
    ],
    factory_crypto: [
      '0x5EF72230578b3e399E6C6F4F6360edF95e83BBfd',
    ],
    factory_twocrypto: [
      '0xc9Fe0C63Af9A39402e8a5514f9c43Af0322b665F',
    ],
    factory_tricrypto: [
      '0xA5961898870943c68037F6848d2D866Ed2016bcB',
    ],
    factory_stable_ng: [
      '0xd2002373543Ce3527023C75e7518C274A51ce712',
    ],
    customPools: {},
  },
  [CHAIN.XDAI]: {
    start: '2021-07-01',
    stable_factory: [
      '0xD19Baeadc667Cf2015e395f2B08668Ef120f41F5',
    ],
    factory_twocrypto: [
      '0x98EE851a00abeE0d95D08cF4CA2BdCE32aeaAF7F',
    ],
    factory_stable_ng: [
      '0xbC0797015fcFc47d9C1856639CaE50D0e69FbEE8',
    ],
    customPools: {
      [ContractVersion.main]: [
        '0x7f90122BF0700F9E7e1F688fe926940E8839F353',
        '0x85bA9Dfb4a3E4541420Fc75Be02E2B42042D7e46',
      ],
      [ContractVersion.crypto]: [
        '0x5633E00994896D0F472926050eCb32E38bef3e65',
        '0x056C6C5e684CeC248635eD86033378Cc444459B0',
      ],
    },
    metaBasePools: {
      '0x1337bedc9d22ecbe766df105c9623922a27963ec': {
        tokens: [
          '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
          '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
          '0x4ECaBa5870353805a9F068101A40E0f32ed605C6',
        ]
      }
    }
  },
  [CHAIN.FRAXTAL]: {
    start: '2024-02-14',
    factory_twocrypto: [
      '0x98EE851a00abeE0d95D08cF4CA2BdCE32aeaAF7F',
    ],
    factory_tricrypto: [
      '0xc9Fe0C63Af9A39402e8a5514f9c43Af0322b665F',
    ],
    factory_stable_ng: [
      '0xd2002373543Ce3527023C75e7518C274A51ce712',
    ],
    customPools: {},
  },
  [CHAIN.SONIC]: {
    start: '2025-01-01',
    factory_twocrypto: [
      '0x1A83348F9cCFD3Fe1A8C0adBa580Ac4e267Fe495',
    ],
    factory_tricrypto: [
      '0x635742dCC8313DCf8c904206037d962c042EAfBd',
    ],
    factory_stable_ng: [
      '0x7C2085419BE6a04f4ad88ea91bC9F5C6E6C463D8',
    ],
    customPools: {},
  },
  [CHAIN.HYPERLIQUID]: {
    start: '2025-02-20',
    factory_twocrypto: [
      '0xc9Fe0C63Af9A39402e8a5514f9c43Af0322b665F',
    ],
    factory_tricrypto: [
      '0x5702BDB1Ec244704E3cBBaAE11a0275aE5b07499',
    ],
    factory_stable_ng: [
      '0x604388Bb1159AFd21eB5191cE22b4DeCdEE2Ae22',
    ],
    customPools: {},
  },
  [CHAIN.PLASMA]: {
    start: '2025-09-25',
    factory_twocrypto: [
      '0xe7FBd704B938cB8fe26313C3464D4b7B7348c88C',
    ],
    factory_tricrypto: [
      '0x6E28493348446503db04A49621d8e6C9A40015FB',
    ],
    factory_stable_ng: [
      '0x8271e06E5887FE5ba05234f5315c19f3Ec90E8aD',
    ],
    customPools: {},
  },
}

// https://resources.curve.finance/pools/overview/#pool-fees
const adapter = getCurveExport(CurveDexConfigs, { userFeesRatio: 1, revenueRatio: 0.5, holdersRevenueRatio: 0.5 })

adapter.methodology = {
  Fees: "Trading fees paid by users (typically range from 0.01%-0.04%)",
  UserFees: "Trading fees paid by users (typically range from 0.01%-0.04%)",
  Revenue: "A 50% of the trading fee is collected by veCRV holders",
  ProtocolRevenue: "Admin fees collected from every swap to Curve treasury",
  HoldersRevenue: "A 50% of the trading fee is collected by the users who have vote locked their CRV",
  SupplySideRevenue: "A 50% of all trading fees are distributed among liquidity providers"
}

export default adapter;
