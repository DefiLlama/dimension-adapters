import { CHAIN } from "../../helpers/chains";

export const GearboxAbis = {
  PoolRepay: 'event Repay(address indexed creditManager, uint256 borrowedAmount, uint256 profit, uint256 loss)',
  CreditManagerFees: 'function fees() view returns (uint16 feeInterest, uint16 feeLiquidation, uint16 liquidationDiscount, uint16 feeLiquidationExpired, uint16 liquidationDiscountExpired)',
}

export interface IGearboxService {
  version: 2 | 3;
  pool: string;
  creditManager?: string;
}

export interface IGearboxChainConfig {
  start: string;
  services: Array<IGearboxService>
}

export const GearboxConfigs: {[key: string]: IGearboxChainConfig} = {
  [CHAIN.ETHEREUM]: {
    start: '2023-12-17',
    services: [
      {
        version: 2,
        pool: '0x24946bcbbd028d5abb62ad9b635eb1b1a67af668', // DAI
        creditManager: '0x672461Bfc20DD783444a830Ad4c38b345aB6E2f7',
      },
      {
        version: 2,
        pool: '0x86130bdd69143d8a4e5fc50bf4323d48049e98e4', // USDC
        creditManager: '0x95357303f995e184A7998dA6C6eA35cC728A1900',
      },
      {
        version: 2,
        pool: '0xb03670c20f87f2169a7c4ebe35746007e9575901', // WETH
        creditManager: '0x5887ad4Cb2352E7F01527035fAa3AE0Ef2cE2b9B',
      },
      {
        version: 2,
        pool: '0xb2a015c71c17bcac6af36645dead8c572ba08a08', // WBTC
        creditManager: '0xc62BF8a7889AdF1c5Dc4665486c7683ae6E74e0F',
      },
      {
        version: 2,
        pool: '0xB8cf3Ed326bB0E51454361Fb37E9E8df6DC5C286', // wstETH
        creditManager: '0xe0bCE4460795281d39c91da9B0275BcA968293de',
      },
      {
        version: 2,
        pool: '0x79012c8d491dcf3a30db20d1f449b14caf01da6c', // FRAX
        creditManager: '0xA3E1e0d58FE8dD8C9dd48204699a1178f1B274D8',
      },

      {
        version: 3,
        pool: '0xda0002859b2d05f66a753d8241fcde8623f26f4f',
      },
      {
        version: 3,
        pool: '0xf00b548f1b69cb5ee559d891e03a196fb5101d4a',
      },
      {
        version: 3,
        pool: '0xff94993fa7ea27efc943645f95adb36c1b81244b',
      },
      {
        version: 3,
        pool: '0x72ccb97cbdc40f8fb7ffa42ed93ae74923547200',
      },
      {
        version: 3,
        pool: '0xda00000035fef4082f78def6a8903bee419fbf8e',
      },
      {
        version: 3,
        pool: '0xc155444481854c60e7a29f4150373f479988f32d',
      },
      {
        version: 3,
        pool: '0xf0795c47fa58d00f5f77f4d5c01f31ee891e21b4',
      },
      {
        version: 3,
        pool: '0x05a811275fe9b4de503b3311f51edf6a856d936e',
      },
      {
        version: 3,
        pool: '0xf5503d3d4bd254c2c17690eed523bcb2935db6de',
      },
      {
        version: 3,
        pool: '0xe7146f53dbcae9d6fa3555fe502648deb0b2f823',
      },
      {
        version: 3,
        pool: '0x4d56c9cba373ad39df69eb18f076b7348000ae09',
      },
      {
        version: 3,
        pool: '0xda00010eda646913f273e10e7a5d1f659242757d',
      },
      {
        version: 3,
        pool: '0x7354ec6e852108411e681d13e11185c3a2567981',
      },
      {
        version: 3,
        pool: '0xf791ecc5f2472637eac9dfe3f7894c0b32c32bdf',
      },
      {
        version: 3,
        pool: '0x8ef73f036feec873d0b2fd20892215df5b8bdd72',
      },
      {
        version: 3,
        pool: '0x31426271449f60d37cc5c9aef7bd12af3bdc7a94',
      },
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: '2024-02-27',
    services: [
      {
        version: 3,
        pool: '0x04419d3509f13054f60d253e0c79491d9e683399',
      },
      {
        version: 3,
        pool: '0x890a69ef363c9c7bdd5e36eb95ceb569f63acbf6',
      },
      {
        version: 3,
        pool: '0xa76c604145d7394dec36c49af494c144ff327861',
      },
    ],
  },
  [CHAIN.OPTIMISM]: {
    start: '2024-04-27',
    services: [
      {
        version: 3,
        pool: '0x42db77b3103c71059f4b997d6441cfb299fd0d94',
      },
      {
        version: 3,
        pool: '0xa210bb193ca352fa81fbd0e81cb800580b0762ee',
      },
      {
        version: 3,
        pool: '0x5520daa93a187f4ec67344e6d2c4fc9b080b6a35',
      },
    ],
  },
  [CHAIN.SONIC]: {
    start: '2025-02-25',
    services: [
      {
        version: 3,
        pool: '0xcf4d737c38ef2ac9c7bdb4dbbc954b1932ea4a40',
      },
      {
        version: 3,
        pool: '0x6f6bda069fb05bab5e83b22fbdb54cbdf33f78ee',
      },
    ],
  },
  [CHAIN.BSC]: {
    start: '2025-05-10',
    services: [
      {
        version: 3,
        pool: '0xe773eb1c9c26e79deb8e20be24629953ce20597d',
      },
      {
        version: 3,
        pool: '0xef7d781825350d2bacb64ef7be927fd400dcdf4f',
      },
      {
        version: 3,
        pool: '0x404f813c6cc313ad69832d5a2de83cb3477e655c',
      },
    ],
  },
  [CHAIN.HEMI]: {
    start: '2025-07-20',
    services: [
      {
        version: 3,
        pool: '0xd172b64aa13d892bb5eb35f3482058eae0bc5b2a',
      },
      {
        version: 3,
        pool: '0x614eb485de3c6c49701b40806ac1b985ad6f0a2f',
      },
    ],
  },
  [CHAIN.LISK]: {
    start: '2025-07-23',
    services: [
      {
        version: 3,
        pool: '0xa16952191248e6b4b3a24130dfc47f96ab1956a7',
      },
    ],
  },
}