import { CHAIN } from "../chains"

export const ABI = {
  ERC4626: {
    asset: 'address:asset',
    decimals: 'uint8:decimals',
    converttoAssets: 'function convertToAssets(uint256 shares) view returns (uint256 assets)',
    totalAssets: 'uint256:totalAssets',
  },
  morpho: {
    fee: 'uint256:fee',
    CreateMetaMorphoEvent: 'event CreateMetaMorpho(address indexed metaMorpho, address indexed caller, address initialOwner, uint256 initialTimelock, address indexed asset, string name, string symbol, bytes32 salt)',
  },
  euler: {
    interestFee: 'uint256:interestFee',
    getProxyListLength: 'uint256:getProxyListLength',
    proxyList: 'function proxyList(uint256) view returns (address)',
    creator: 'address:creator',
  },
}

export const MorphoConfigs: any = {
  [CHAIN.ETHEREUM]: {
    vaultFactories: [
      {
        address: '0xa9c3d3a366466fa809d1ae982fb2c46e5fc41101',
        fromBlock: 18925584,
      },
      {
        address: '0x1897a8997241c1cd4bd0698647e4eb7213535c24',
        fromBlock: 21439510,
      },
    ],
  },
  [CHAIN.BASE]: {
    vaultFactories: [
      {
        address: '0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101',
        fromBlock: 13978134,
      },
      {
        address: '0xFf62A7c278C62eD665133147129245053Bbf5918',
        fromBlock: 23928808,
      },
    ],
  },
  [CHAIN.POLYGON]: {
    vaultFactories: [
      {
        address: '0xa9c87daB340631C34BB738625C70499e29ddDC98',
        fromBlock: 66931118,
      },
    ],
  },
  [CHAIN.WC]: {
    vaultFactories: [
      {
        address: '0x4DBB3a642a2146d5413750Cca3647086D9ba5F12',
        fromBlock: 9025733,
      },
    ],
  },
  [CHAIN.CORN]: {
    vaultFactories: [
      {
        address: '0xe430821595602eA5DD0cD350f86987437c7362fA',
        fromBlock: 253027,
      },
    ],
  },
  [CHAIN.UNICHAIN]: {
    vaultFactories: [
      {
        address: '0xe9EdE3929F43a7062a007C3e8652e4ACa610Bdc0',
        fromBlock: 9316789,
      },
    ],
  },
  [CHAIN.KATANA]: {
    vaultFactories: [
      {
        address: '0x1c8De6889acee12257899BFeAa2b7e534de32E16',
        fromBlock: 2741420,
      },
    ],
  },
  [CHAIN.ARBITRUM]: {
    vaultFactories: [
      {
        address: '0x878988f5f561081deEa117717052164ea1Ef0c82',
        fromBlock: 296447195,
      },
    ],
  },
}

export const EulerConfigs: any = {
  [CHAIN.ETHEREUM]: {
    vaultFactories: [
      '0x29a56a1b8214d9cf7c5561811750d5cbdb45cc8e',
    ],
  },
  [CHAIN.BASE]: {
    vaultFactories: [
      '0x7f321498a801a191a93c840750ed637149ddf8d0',
    ],
  },
  [CHAIN.UNICHAIN]: {
    vaultFactories: [
      '0xbad8b5bdfb2bcbcd78cc9f1573d3aad6e865e752',
    ],
  },
  [CHAIN.SWELLCHAIN]: {
    vaultFactories: [
      '0x238bf86bb451ec3ca69bb855f91bda001ab118b9',
    ],
  },
  [CHAIN.SONIC]: {
    vaultFactories: [
      '0xf075cc8660b51d0b8a4474e3f47edac5fa034cfb',
    ],
  },
  [CHAIN.BERACHAIN]: {
    vaultFactories: [
      '0x5c13fb43ae9bae8470f646ea647784534e9543af',
    ],
  },
  [CHAIN.AVAX]: {
    vaultFactories: [
      '0xaf4b4c18b17f6a2b32f6c398a3910bdcd7f26181',
    ],
  },
  [CHAIN.BOB]: {
    vaultFactories: [
      '0x046a9837A61d6b6263f54F4E27EE072bA4bdC7e4',
    ],
  },
  [CHAIN.BSC]: {
    vaultFactories: [
      '0x7f53e2755eb3c43824e162f7f6f087832b9c9df6',
    ],
  },
  [CHAIN.TAC]: {
    vaultFactories: [
      '0x2b21621b8Ef1406699a99071ce04ec14cCd50677',
    ],
  },
  [CHAIN.LINEA]: {
    vaultFactories: [
      '0x84711986fd3bf0bfe4a8e6d7f4e22e67f7f27f04',
    ],
  },
  [CHAIN.ARBITRUM]: {
    vaultFactories: [
      '0x78df1cf5bf06a7f27f2acc580b934238c1b80d50',
    ],
  },
  [CHAIN.PLASMA]: {
    vaultFactories: [
      '0x42388213C6F56D7E1477632b58Ae6Bba9adeEeA3',
    ],
  },
}
