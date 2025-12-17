import { CHAIN } from "../../helpers/chains";

interface EulerChainConfig {
  eVaultAddress: string;
  feeFlowController: string;
  tokenEUL: string;
  start: string;
}

const eVaultFactories: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e",
  [CHAIN.BASE]: "0x7F321498A801A191a93C840750ed637149dDf8D0",
  [CHAIN.SONIC]: "0xF075cC8660B51D0b8a4474e3f47eDAC5fA034cFB",
  [CHAIN.SWELLCHAIN]: "0x238bF86bb451ec3CA69BB855f91BDA001aB118b9",
  [CHAIN.BOB]: "0x046a9837A61d6b6263f54F4E27EE072bA4bdC7e4",
  [CHAIN.BERACHAIN]: "0x5C13fb43ae9BAe8470f646ea647784534E9543AF",
  [CHAIN.BSC]: "0x7F53E2755eB3c43824E162F7F6F087832B9C9Df6",
  [CHAIN.UNICHAIN]: "0xbAd8b5BDFB2bcbcd78Cc9f1573D3Aad6E865e752",
  [CHAIN.ARBITRUM]: "0x78Df1CF5bf06a7f27f2ACc580B934238C1b80D50",
  [CHAIN.AVAX]: "0xaf4B4c18B17F6a2B32F6c398a3910bdCD7f26181",
  [CHAIN.TAC]: "0x2b21621b8Ef1406699a99071ce04ec14cCd50677",
  [CHAIN.LINEA]: "0x84711986Fd3BF0bFe4a8e6d7f4E22E67f7f27F04",
  [CHAIN.PLASMA]: "0x42388213C6F56D7E1477632b58Ae6Bba9adeEeA3",
  [CHAIN.MANTLE]: "0x47Aaf2f062aa1D55AFa602f5C9597588f71E2d76",
  [CHAIN.MONAD]: "0xba4Dd672062dE8FeeDb665DD4410658864483f1E",
};

const feeFlowControllers: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0xFcd3Db06EA814eB21C84304fC7F90798C00D1e32",
  [CHAIN.BSC]: "0xE7Ef8C7CcB6aa81e366f0A0ccd89A298d9893E83",
  [CHAIN.UNICHAIN]: "0x87BeecC6B609723B2Ef071c20AA756846969240C",
  [CHAIN.SONIC]: "0xD3Cf3Ec3D7849F2C7Bb9Ff5a8662Ae36a177bEb8",
  [CHAIN.TAC]: "0x9128754f3951a819528d110f3a92a2586D352463",
  [CHAIN.HYPERLIQUID]: "0x8916311B5E8056E0709163c52a51831A0f152b44",
  [CHAIN.SWELLCHAIN]: "0xA93Ff8C4CC2Ba56Ee182B70bb07F2C75DA249879",
  [CHAIN.BASE]: "0xbF4906E2F20362c3d746F7eFfF54abB8282902ed",
  [CHAIN.PLASMA]: "0xBCc714F3ce3F56aB4A85a10d593cF9C93ED6ED9e",
  [CHAIN.ARBITRUM]: "0xA1585dc7Cd4EF33f7a855fDE39771b37838B0bFE",
  [CHAIN.AVAX]: "0x95F21cD90057BBdC6fAc3f9b94D06b53C24B278c",
  [CHAIN.LINEA]: "0xbF939812A673CB088f466d610c4b120b13eA5fAB",
  [CHAIN.BOB]: "0xcb3c0D131C64265099868F847face425499785A8",
  [CHAIN.BERACHAIN]: "0x5EAe58dc72E4E374F32eCA2751cC38b573dd82c9",
  [CHAIN.MONAD]: "0x9527062A472666410DC7193A966709105dF2f147",
};

const tokenEUL: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0xd9fcd98c322942075a5c3860693e9f4f03aae07b",
  [CHAIN.BSC]: "0x2117e8b79e8e176a670c9fcf945d4348556bffad",
  [CHAIN.UNICHAIN]: "0xE9C43e09C5FA733bCC2aEAa96063A4a60147AA09",
  [CHAIN.SONIC]: "0x8e15C8D399e86d4FD7B427D42f06c60cDD9397e7",
  [CHAIN.TAC]: "0x38C043856A109066d64a60c82e07848a1C58e7Dc",
  [CHAIN.HYPERLIQUID]: "0x3A41f426E55ECdE4BC734fA79ccE991b94aFf711",
  [CHAIN.SWELLCHAIN]: "0x80ccFBec4b8c82265abdc226Ad3Df84C0726E7A3",
  [CHAIN.BASE]: "0xa153Ad732F831a79b5575Fa02e793EC4E99181b0",
  [CHAIN.PLASMA]: "0xca632FA58397391C750c13F935DAA61AbBe0BaA6",
  [CHAIN.ARBITRUM]: "0x462cD9E0247b2e63831c3189aE738E5E9a5a4b64",
  [CHAIN.AVAX]: "0x9ceeD3A7f753608372eeAb300486cc7c2F38AC68",
  [CHAIN.LINEA]: "0x3eBd0148BADAb9388936E4472C4415D5700478A5",
  [CHAIN.BOB]: "0xDe1763aFA5eB658CfFFfD16835AfeB47e7aC0B8D",
  [CHAIN.BERACHAIN]: "0xEb9b5f4EB023aE754fF59A04c9C038D58606DAC6",
  [CHAIN.MONAD]: "0xDef72Af3fc69E1Dd5a094f7DDa08Ba203CD0438B",
}

export const EulerChainConfigs: Record<string, EulerChainConfig> = {
  [CHAIN.ETHEREUM]: {
    eVaultAddress: eVaultFactories[CHAIN.ETHEREUM],
    feeFlowController: feeFlowControllers[CHAIN.ETHEREUM],
    tokenEUL: tokenEUL[CHAIN.ETHEREUM],
    start: '2024-08-18',
  },
  [CHAIN.BASE]: {
    eVaultAddress: eVaultFactories[CHAIN.BASE],
    feeFlowController: feeFlowControllers[CHAIN.BASE],
    tokenEUL: tokenEUL[CHAIN.BASE],
    start: '2024-11-27',
  },
  [CHAIN.SONIC]: {
    eVaultAddress: eVaultFactories[CHAIN.SONIC],
    feeFlowController: feeFlowControllers[CHAIN.SONIC],
    tokenEUL: tokenEUL[CHAIN.SONIC],
    start: '2025-01-31',
  },
  [CHAIN.SWELLCHAIN]: {
    eVaultAddress: eVaultFactories[CHAIN.SWELLCHAIN],
    feeFlowController: feeFlowControllers[CHAIN.SWELLCHAIN],
    tokenEUL: tokenEUL[CHAIN.SWELLCHAIN],
    start: '2025-01-20',
  },
  [CHAIN.BOB]: {
    eVaultAddress: eVaultFactories[CHAIN.BOB],
    feeFlowController: feeFlowControllers[CHAIN.BOB],
    tokenEUL: tokenEUL[CHAIN.BOB],
    start: '2025-01-21',
  },
  [CHAIN.BERACHAIN]: {
    eVaultAddress: eVaultFactories[CHAIN.BERACHAIN],
    feeFlowController: feeFlowControllers[CHAIN.BERACHAIN],
    tokenEUL: tokenEUL[CHAIN.BERACHAIN],
    start: '2025-02-06',
  },
  [CHAIN.BSC]: {
    eVaultAddress: eVaultFactories[CHAIN.BSC],
    feeFlowController: feeFlowControllers[CHAIN.BSC],
    tokenEUL: tokenEUL[CHAIN.BSC],
    start: '2025-02-04',
  },
  [CHAIN.UNICHAIN]: {
    eVaultAddress: eVaultFactories[CHAIN.UNICHAIN],
    feeFlowController: feeFlowControllers[CHAIN.UNICHAIN],
    tokenEUL: tokenEUL[CHAIN.UNICHAIN],
    start: '2025-02-11',
  },
  [CHAIN.ARBITRUM]: {
    eVaultAddress: eVaultFactories[CHAIN.ARBITRUM],
    feeFlowController: feeFlowControllers[CHAIN.ARBITRUM],
    tokenEUL: tokenEUL[CHAIN.ARBITRUM],
    start: '2025-01-30',
  },
  [CHAIN.AVAX]: {
    eVaultAddress: eVaultFactories[CHAIN.AVAX],
    feeFlowController: feeFlowControllers[CHAIN.AVAX],
    tokenEUL: tokenEUL[CHAIN.AVAX],
    start: '2025-02-04',
  },
  [CHAIN.TAC]: {
    eVaultAddress: eVaultFactories[CHAIN.TAC],
    feeFlowController: feeFlowControllers[CHAIN.TAC],
    tokenEUL: tokenEUL[CHAIN.TAC],
    start: '2025-06-21',
  },
  [CHAIN.LINEA]: {
    eVaultAddress: eVaultFactories[CHAIN.LINEA],
    feeFlowController: feeFlowControllers[CHAIN.LINEA],
    tokenEUL: tokenEUL[CHAIN.LINEA],
    start: '2025-08-11',
  },
  [CHAIN.PLASMA]: {
    eVaultAddress: eVaultFactories[CHAIN.PLASMA],
    feeFlowController: feeFlowControllers[CHAIN.PLASMA],
    tokenEUL: tokenEUL[CHAIN.PLASMA],
    start: '2025-09-22',
  },
  [CHAIN.MONAD]: {
    eVaultAddress: eVaultFactories[CHAIN.MONAD],
    feeFlowController: feeFlowControllers[CHAIN.MONAD],
    tokenEUL: tokenEUL[CHAIN.MONAD],
    start: '2025-11-23',
  },
  
  // no vaults created
  // [CHAIN.MANTLE]: {
  //   eVaultAddress: eVaultFactories[CHAIN.MONAD],
  //   feeFlowController: feeFlowControllers[CHAIN.MONAD],
  //   tokenEUL: tokenEUL[CHAIN.MONAD],
  //   start: '2025-08-11',
  // },
}
