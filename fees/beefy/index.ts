import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import ADDRESSES from '../../helpers/coreAssets.json';
import { addTokensReceived } from '../../helpers/token';

const totalFee = 9.5;
const strategistFee = 0.5;
const callFee = 0.01;
const revenueFee = totalFee - strategistFee - callFee;
const holderShare = 36;
const protocolShare = 64;

const beefyRevenueBridgeAddress = '0x02ae4716b9d5d48db1445814b0ede39f5c28264b'; // on L2s
const beefyFeeBatch = '0x65f2145693bE3E75B8cfB2E318A3a74D057e6c7B'; // on ethereum

type ChainConfigType = {
  start: string;
  contract: string;
  stables: string[];
  excludeFrom?: string[];
}

type ERC20TransferLogResult = {
  from: string;
  from_address?: string;
  to: string;
  value: bigint;
}

function makeErc20BlacklistFromFilter(blacklistedFromAddresses: string[],): (log: ERC20TransferLogResult) => boolean {
  const blacklistedFromAddressSet = new Set(blacklistedFromAddresses.map((address: string) => address.toLowerCase()));
  return (log: ERC20TransferLogResult) => {
    const from = log?.from?.toLowerCase() || log?.from_address?.toLowerCase();
    return !blacklistedFromAddressSet.has(from || '');
  };
}

/**
 * Each contract collects fees in WNATIVE, then swaps to a stablecoin, which is bridged (possibly via other chains) to Ethereum.
 * Rather than tracking all the WNATIVE transfers, we track the incoming stablecoin transfers to the contract address from the swap transactions.
 * To ensure bridged funds are not double-counted, we try to exclude transfers/swaps originating from other chains.
 * we can comment out real, scroll, fantom, zkevm, kava, canto etc. after backfill
 */
const chainConfig: Partial<Record<CHAIN, ChainConfigType>> = {
  [CHAIN.MONAD]: {
    start: '2025-11-25',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.monad.USDT],
  },
  [CHAIN.PLASMA]: {
    start: '2025-09-27',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.plasma.USDT0],
  },
  [CHAIN.HYPERLIQUID]: {
    start: '2025-06-05',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.hyperliquid.USDT0],
  },
  // [CHAIN.SAGA]: {
  //   start: '2025-04-16',
  //   contract: beefyRevenueBridgeAddress,
  //   stables: [ADDRESSES.saga.USDC],
  // },
  // [CHAIN.REAL]: {
  //   start: '2024-07-17',
  //   contract: beefyRevenueBridgeAddress,
  //   stables: [ADDRESSES.real.USDC],
  // },
  // [CHAIN.ROOTSTOCK]: {
  //   start: '2024-09-30',
  //   contract: beefyRevenueBridgeAddress,
  //   stables: [
  //     '0xAf368c91793CB22739386DFCbBb2F1A9e4bCBeBf', // USDT
  //   ],
  // },
  // [CHAIN.FRAXTAL]: {
  //   start: '2024-03-27',
  //   contract: beefyRevenueBridgeAddress,
  //   stables: [
  //     '0xFc00000000000000000000000000000000000001', // frxUSD
  //   ]
  // },
  [CHAIN.SCROLL]: {
    start: '2024-10-16',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.scroll.USDC],
  },
  [CHAIN.FANTOM]: {
    start: '2023-08-23',
    contract: beefyRevenueBridgeAddress,
    stables: [
      '0x1B6382DBDEa11d97f24495C9A90b7c88469134a4', // axlUSDC
    ],
  },
  // [CHAIN.POLYGON_ZKEVM]: {
  //   start: '2023-08-23',
  //   contract: beefyRevenueBridgeAddress,
  //   stables: [ADDRESSES.polygon_zkevm.USDC],
  // },
  // [CHAIN.KAVA]: {
  //   start: '2023-08-23',
  //   contract: beefyRevenueBridgeAddress,
  //   stables: [
  //     '0xEB466342C4d449BC9f53A865D5Cb90586f405215', // axlUSDC
  //   ],
  // },
  // [CHAIN.CANTO]: {
  //   start: '2023-08-23',
  //   contract: beefyRevenueBridgeAddress,
  //   stables: [ADDRESSES.canto.USDC],
  // },
  // [CHAIN.SEI]: {
  //   start: '2024-08-01',
  //   contract: beefyRevenueBridgeAddress,
  //   stables: [ADDRESSES.sei.USDC],
  // },
  [CHAIN.OPTIMISM]: {
    start: '2023-08-25',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.optimism.USDC_CIRCLE],
  },
  [CHAIN.CRONOS]: {
    start: '2023-08-23',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.cronos.USDC],
  },
  [CHAIN.BSC]: {
    start: '2023-08-25',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.bsc.USDT],
    excludeFrom: [
      '0x138eb30f73bc423c6455c53df6d89cb01d9ebc63', // stargate USDT pool (result of bridges from: rootstock)
    ]
  },
  [CHAIN.XDAI]: {
    start: '2023-08-23',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.xdai.USDC],
  },
  [CHAIN.SONIC]: {
    start: '2024-12-17',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.sonic.USDC_e],
  },
  [CHAIN.METIS]: {
    start: '2023-08-23',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.metis.m_USDC],
  },
  [CHAIN.MOONBEAM]: {
    start: '2024-06-14',
    contract: beefyRevenueBridgeAddress,
    stables: [
      '0xCa01a1D0993565291051daFF390892518ACfAD3A', // axlUSDC
    ]
  },
  [CHAIN.MANTLE]: {
    start: '2024-01-05',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.mantle.USDC],
  },
  [CHAIN.BASE]: {
    start: '2023-08-23',
    contract: beefyRevenueBridgeAddress,
    stables: [
      ADDRESSES.base.USDbC,
      ADDRESSES.base.USDC, // switch tx 0xdceede703d8bb52c9f7d22fc4238b2ff114af9d33090d7e988f8be87d2e16f7f
    ],
  },
  [CHAIN.MODE]: {
    start: '2023-08-23',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.mode.USDC],
  },
  [CHAIN.AVAX]: {
    start: '2023-08-23',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.avax.USDC],
  },
  [CHAIN.LINEA]: {
    start: '2023-12-07',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.linea.USDC],
  },
  [CHAIN.BERACHAIN]: {
    start: '2025-02-06',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.berachain.USDC]
  },
  [CHAIN.POLYGON]: {
    /**
     * polygon
     * exclude:
     *   from cronos via synapse
     *   from metis via synapse
     *   from canto via synapse
     *   from fantom via axelar (axlUSDC was received to BeefySwapper 0xc0d1)
     *   from moonbeam via axelar (axlUSDC was received to BeefySwapper 0xc0d1)
     *   from kava via axelar (axlUSDC was received to BeefySwapper 0xc0d1)
    */
    start: '2023-09-06',
    contract: beefyRevenueBridgeAddress,
    stables: [
      ADDRESSES.polygon.USDC,
    ],
    excludeFrom: [
      '0x8f5bbb2bb8c2ee94639e55d5f41de9b4839c1280', // synapse bridge (already counted, result of bridges from: cronos, metis, canto)
      '0xc0d173e3486f7c3d57e8a38a003500fd27e7d055', // BeefySwapper, used to swap axlUSDC to USDC
      '0x4fed5491693007f0cd49f4614ffc38ab6a04b619', // BeefyDeployer, historical manual swaps of nUSD (Synapse USD)
      '0x161d61e30284a33ab1ed227bedcac6014877b3de', // BeefyDev, historical manual swaps of nUSD (Synapse USD)
      // '0xDd27227Dba7Ea8F5869466A10A8E36Bb2D709b35', // BeefySwapper, used to swap WNATIVE to USDC
      // '0xA374094527e1673A86dE625aa59517c5dE346d32', // Uniswap V3 WNATIVE/USDC pool, previously used to swap WNATIVE to USDC
    ],
  },
  [CHAIN.ARBITRUM]: {
    /**
     * arbitrum
     * exclude:
     *   from optimism via stargate 0xe8CDF27AcD73a434D661C84887215F7598e7d0d3
     *   from sonic via stargate 0xe8CDF27AcD73a434D661C84887215F7598e7d0d3
     *   from sei via stargate 0xe8CDF27AcD73a434D661C84887215F7598e7d0d3
     *   from berachain via stargate 0xe8CDF27AcD73a434D661C84887215F7598e7d0d3
     *   from scroll via stargate 0xe8CDF27AcD73a434D661C84887215F7598e7d0d3
     *   from bsc via stargate
     *   from polygon via stargate
     *   from mantle via stargate
     *   from base via stargate
     *   from mode via across
     *   from real via real
     *   from avax via circle
     */
    start: '2023-09-06',
    contract: beefyRevenueBridgeAddress,
    stables: [
      // ADDRESSES.arbitrum.USDT, // never received
      ADDRESSES.arbitrum.USDC_CIRCLE, // switch tx 0x6ac6034749c5da8f8395239148fe351ed22ff64539b51703973e288398bac4ee
    ],
    excludeFrom: [
      // '0xC6962004f452bE9203591991D15f6b388e09E8D0', // Uniswap V3 WETH/USDC Pool, used to swap WNATIVE to USDC
      ADDRESSES.null, // Minting via Circle bridge (already counted, result of bridges from: avax)
      '0x5f98f630009E0E090965fb42DDe95F5A2d495445', // BeefySwapper, used to swap USDC.e to USDC
      '0xe8CDF27AcD73a434D661C84887215F7598e7d0d3', // stargate USDC pool (already counted, result of bridges from: optimism/sonic/sei/berachain/scroll)
      '0x892785f33CdeE22A30AEF750F285E18c18040c3e', // stargate USDC.e pool (already counted, result of bridges from: bsc/polygon/mantle?)
      '0x07aE8551Be970cB1cCa11Dd7a11F47Ae82e70E67', // across (already counted, result of bridges from: mode)
      '0xBAa850bc2eCC6A4F356445f4A853281A42bD2fBb', // real bridge (already counted, result of bridges from: real)
    ],
  },
  [CHAIN.ETHEREUM]: {
    /**
     * ethereum
     * usually only swaps weth->usdc once per week
     * only swaps the protocol share of the weth, not the holder share
     * exclude:
     *   from gnosis via gnosis
     *   from fraxtal via stargate
     *   from zkevm via zkevm
     *   from arbitrum via circle
     *   from linea via linea
     */
    start: '2024-07-11',
    contract: beefyFeeBatch,
    stables: [ADDRESSES.ethereum.USDC],
    excludeFrom: [
      // '0x0000830DF56616D58976A12D19d283B40e25BEEF', // BeefySwapper, used to swap WNATIVE to USDC
      ADDRESSES.null, // Minting via Circle bridge (already counted, result of bridges from: arbitrum)
      '0x4fED5491693007f0CD49f4614FFC38Ab6A04B619', // BeefyDeployer, manual swaps of frxUSD to USDC, (already counted, result of bridges from: fraxtal)
      '0x340014C66D49f50c48E6eF0D02aB630F246F1921', // BeefySwapperTreasury, FRAX to USDC swaps (already counted, result of bridges from: fraxtal)
      '0x88ad09518695c6c3712AC10a214bE5109a655671', // Gnosis bridge, (already counted, result of bridges from: gnosis)
      '0x504A330327A089d8364C4ab3811Ee26976d388ce', // L1USDCBridge (already counted, result of bridges from: linea)
    ],
  },
}

const fetch = async (options: FetchOptions) => {
  const { chain } = options;
  const config = chainConfig[chain as CHAIN];
  if (!config) {
    throw new Error(`No config for chain ${chain}`);
  }

  const { excludeFrom, contract, stables } = config;

  const logFilter = excludeFrom && excludeFrom.length > 0 ? makeErc20BlacklistFromFilter(excludeFrom) : undefined;
  let dailyRevenue = await addTokensReceived({
    options,
    target: contract,
    tokens: stables,
    logFilter
  });

  // Ethereum feeBatch only swaps the protocol share of the weth to usdc, not the holder share
  if (chain === CHAIN.ETHEREUM) {
    // Scale it up from the protocol share to the total revenue
    dailyRevenue = dailyRevenue.clone(100 / protocolShare);
  }

  // scale revenue up to include strategist and call fees
  const dailyFees = dailyRevenue.clone(totalFee / revenueFee);
  const dailyProtocolRevenue = dailyRevenue.clone(protocolShare / 100);
  const dailyHoldersRevenue = dailyRevenue.clone(holderShare / 100);
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue
  };
};

const methodology = {
  Fees: `${totalFee}% of each harvest is charged as a performance fee`,
  Revenue: `All fees except for ${strategistFee}% to strategist and variable harvest() call fee are revenue`,
  HoldersRevenue: `${holderShare}% of revenue is distributed to holders who stake`,
  ProtocolRevenue: `${protocolShare}% of revenue is distributed to the treasury`,
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
