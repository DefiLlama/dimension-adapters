/**
 * Curve Factory
 *
 * Generates DEX adapters for protocols that use Curve-style AMM pools.
 * All adapters share the same on-chain log parsing logic from helpers/curve
 * (getCurveDexData / getCurveExport) but differ in:
 *   - Pool factory addresses, custom pools, and meta base pools per chain
 *   - Contract versions (main, crypto, stable_factory, factory_*, etc.)
 *   - Chains supported and start dates
 *   - Methodology text
 *   - Whether to use the Curve API (curve only) or pure on-chain data
 *
 * Protocols covered:
 *   - curve (dexs + fees): API-first with on-chain fallback, custom fees/curve.ts wraps for bribes
 *   - ellipsis (dexs only): on-chain only, BSC
 *   - pancakeswap-stableswap (dexs only): on-chain only, BSC, custom methodology
 */

import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  ICurveDexConfig,
  ContractVersion,
  getCurveExport,
} from "../helpers/curve";
import { createFactoryExports } from "./registry";

// ---- Protocol configs ----

const EllipsisConfigs: { [key: string]: ICurveDexConfig } = {
  [CHAIN.BSC]: {
    start: '2020-09-06',
    factory_crypto: [
      '0x41871A4c63d8Fae4855848cd1790ed237454A5C4',
      '0x8433533c5B67C4E18FA06935f73891B28a10932b',
    ],
    stable_factory: [
      '0xa5d748a3234A81120Df7f23c9Ea665587dc8d871',
      '0xf65BEd27e96a367c61e0E06C54e14B16b84a5870',
    ],
    customPools: {
      stable_factory: [
        '0x160caed03795365f3a589f10c379ffa7d75d4e76',
        '0x19ec9e3f7b21dd27598e7ad5aae7dc0db00a806d',
        '0xAB499095961516f058245C1395f9c0410764b6Cd',
        '0x245e8bb5427822FB8fd6cE062d8dd853FbcfABF5',
        '0x2477fB288c5b4118315714ad3c7Fd7CC69b00bf9',
        '0xfA715E7C8fA704Cf425Dd7769f4a77b81420fbF2',
        '0xc377e2648E5adD3F1CB51a8B77dBEb63Bd52c874',
        '0x556ea0b4c06d043806859c9490072faadc104b63',
        '0xc6a752948627becab5474a10821df73ff4771a49',
        '0x8D7408C2b3154F9f97fc6dd24cd36143908d1E52',
        '0x60E4ED61C6f17972559E86F2125BF8A30f249088',
        '0xf707Df3e4c70E40c2F26C660338dD0C81ad280f1',
        '0x2f8E25C21A17BD9D0C337e1b409e73bc959B41BE',
        '0x780de1A0E4613da6b65ceF7F5FB63d14CbDcfB72',
        '0xEdbb3f63C0901bA500E4525Da0c2cbD27Ac8fFdc',
      ],
    },
    metaBasePools: {
      '0xaf4de8e872131ae328ce21d909c74705d3aaf452': {
        tokens: [
          '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
          '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          '0x55d398326f99059fF775485246999027B3197955',
        ],
      },
      '0x5b5bd8913d766d005859ce002533d4838b0ebbb5': {
        tokens: [
          '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
          '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          '0x55d398326f99059fF775485246999027B3197955',
        ],
      },
      '0xdc7f3e34c43f8700b0eb58890add03aa84f7b0e1': {
        tokens: [
          '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
          '0xfCe146bF3146100cfe5dB4129cf6C82b0eF4Ad8c',
        ],
      },
      '0x2a435ecb3fcc0e316492dc1cdd62d0f189be5640': {
        tokens: [
          '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
          '0xfCe146bF3146100cfe5dB4129cf6C82b0eF4Ad8c',
        ],
      },
      '0xa6fdea1655910c504e974f7f1b520b74be21857b': {
        tokens: [
          '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
          '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          '0x55d398326f99059fF775485246999027B3197955',
        ],
      },
    }
  }
};

const PancakeStableswapConfigs: { [key: string]: ICurveDexConfig } = {
  [CHAIN.BSC]: {
    start: '2020-09-06',
    customPools: {
      [ContractVersion.crypto]: [
        '0x3EFebC418efB585248A0D2140cfb87aFcc2C63DD',
        '0xc2F5B9a3d9138ab2B74d581fC11346219eBf43Fe',
        '0x169F653A54ACD441aB34B73dA9946e2C451787EF',
        '0x176f274335c8b5fd5ec5e8274d0cf36b08e44a57',
        '0xb1da7d2c257c5700612bde35c8d7187dc80d79f1',
        '0x6d8fba276ec6f1eda2344da48565adbca7e4ffa5',
        '0x85259443fad3dc9ecfafe62f043a020992f0e4fc',
        '0x7c762fa6393df0a43730f004c868b93af696ae1e',
        '0x4d7b3f461519bac5436e50b9b9b9a9dc061de6a4',
        '0x54d5935cd89ea8df2022bbf2fe2f398490b47f67',
        '0xd791be03a4e0e4b9be62adac8a5cd4ae2813a2d6',
        '0x7a47b084fa37b88d4dda182f8ba4449963dd34bc',
        '0xb337e78c4ac4f811a0e47f61f4aba58da8e51103',
        '0xc54d35a8cfd9f6dae50945df27a91c9911a03ab1',
        '0xb8204d31379a9b317cd61c833406c972f58eccbc',
        '0xd8cb82059da7215b1a9604e845d49d3e78d0f95a',
        '0x25d0ed3b1ce5af0f3ac7da4b39b46fc409bf67e2',
        '0x49079d07ef47449af808a4f36c2a8dec975594ec',
        '0x9c138be1d76ee4c5162e0fe9d4eea5542a23d1bd',
        '0x0b03e3d6ec0c5e5bbf993ded8d947c6fb6eec18d',
        '0xff5ce4846a3708ea9befa6c3ab145e63f65dc045',
        '0xe1cf7b307d1136e12dc5c21aa790648e3b512f56',
        '0xfc17919098e9f0a0d72093e25ad052a359ae3e43',
        '0xd68baf485e4635ec6b9821036cad05cb53140160',
      ]
    }
  }
};

// ---- Build protocol adapters ----

// Ellipsis: uses simple on-chain getCurveExport, no methodology override
const ellipsisAdapter = getCurveExport(EllipsisConfigs);

// PancakeSwap StableSwap: uses simple on-chain getCurveExport, custom methodology
const pancakeStableswapAdapter = getCurveExport(PancakeStableswapConfigs);
pancakeStableswapAdapter.methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "Treasury receives 10% of the fees.",
  SupplySideRevenue: "LPs receive 50% of the fees.",
  HoldersRevenue: "A 40% of the fees is used to facilitate CAKE buyback and burn.",
  Revenue: "Revenue is 50% of the fees paid by users.",
  Fees: "All fees comes from the user fees, which is 0.25% of each trade."
};

const protocols: Record<string, SimpleAdapter> = {
  "ellipsis": ellipsisAdapter,
  "pancakeswap-stableswap": pancakeStableswapAdapter,
};

// Default export covers dexs (all protocols)
const defaultExport = createFactoryExports(protocols);


module.exports = defaultExport;
