import { FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import ADDRESSES from '../../helpers/coreAssets.json';
import { addTokensReceived } from '../../helpers/token';

const totalFee = 9.5;
const strategistFee = 0.5;
const callFee = 0.01;
const revenueFee = totalFee - strategistFee - callFee;
const holderShare = 36;
const protocolShare = 64;

const methodology = {
  Fees: `${totalFee}% of each harvest is charged as a performance fee`,
  Revenue: `All fees except for ${strategistFee}% to strategist and variable harvest() call fee are revenue`,
  HoldersRevenue: `${holderShare}% of revenue is distributed to holders who stake`,
  ProtocolRevenue: `${protocolShare}% of revenue is distributed to the treasury`,
};

const beefyRevenueBridgeAddress = '0x02ae4716b9d5d48db1445814b0ede39f5c28264b'; // on L2s
const beefyFeeBatch = '0x65f2145693bE3E75B8cfB2E318A3a74D057e6c7B'; // on ethereum

type ChainConfig = {
  chainId: CHAIN;
  start: string;
  contract: string;
  stables: string[];
  excludeFrom?: string[];
}

type ERC20TransferLogResult = {
  from: string;
  to: string;
  value: bigint;
}

/**
 * Each contract collects fees in WNATIVE, then swaps to a stablecoin, which is bridged (possibly via other chains) to Ethereum.
 * Rather than tracking all the WNATIVE transfers, we track the incoming stablecoin transfers to the contract address from the swap transactions.
 * To ensure bridged funds are not double-counted, we try to exclude transfers/swaps originating from other chains.
 */
const configs: ChainConfig[] = [
  {
    /**
     * real
     * @dev EOL, can comment out after backfill
     */
    chainId: CHAIN.REAL,
    start: '2024-07-17', // 0xea3bd6b2f389c0c0880469d46c05472ab78deb6eec577788c53b719da24d1b6c
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.real.USDC]
  },
  {
    /**
     * scroll
     * @dev EOL, can comment out after backfill
     */
    chainId: CHAIN.SCROLL,
    start: '2024-10-16', // 0x9ddb499f4b0644cfc68bd5d4e6ee0269fa798582e776faefac19d7deab49abbf
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.scroll.USDC]
  },
  {
    /**
     * fantom
     * @dev EOL, can comment out after backfill
     */
    chainId: CHAIN.FANTOM,
    start: '2023-08-23', // 0x556eca0d3d2d58a6692b0e3f3c98d36d3ed45939e926e05c6fcfa711ad966322
    contract: beefyRevenueBridgeAddress,
    stables: [
      '0x1B6382DBDEa11d97f24495C9A90b7c88469134a4', // axlUSDC
    ],
  },
  {
    /**
     * zkevm
     * @dev EOL, can comment out after backfill
     */
    chainId: CHAIN.POLYGON_ZKEVM,
    start: '2023-08-23', // 0xcb2295351d8be1127ef73262ef17126287ad29af4aa1502e1e1a1eb7df6b9815
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.polygon_zkevm.USDC]
  },
  {
    /**
     * kava
     * @dev EOL, can comment out after backfill
     */
    chainId: CHAIN.KAVA,
    start: '2023-08-23', // 0xce30683b7b268011841cf608876dd76275fe8c2397f53da3828f7d45d30a2ad1
    contract: beefyRevenueBridgeAddress,
    stables: [
      '0xEB466342C4d449BC9f53A865D5Cb90586f405215', // axlUSDC
    ]
  },
  {
    /**
     * canto
     * @dev EOL, can comment out after backfill
     */
    chainId: CHAIN.CANTO,
    start: '2023-08-23', // 0x6b557a3dee371ca82da607a09bb2db2f12d0c53ab07df45fe83e52c17d6c11fd
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.canto.USDC]
  },
  {
    /**
     * rootstock
     * @dev Test would not run locally with RootStock enabled, may need to be commented out
     */
    chainId: CHAIN.ROOTSTOCK,
    start: '2024-09-30', // 0x0f6f952f1c100c5b641090dc7149ebd347dae5373c72da537aa399fd349454f9
    contract: beefyRevenueBridgeAddress,
    stables: [
      '0xAf368c91793CB22739386DFCbBb2F1A9e4bCBeBf', // USDT
    ],
  },
  {
    /** sei */
    chainId: CHAIN.SEI,
    start: '2024-08-01', // 0x1e0b6a11d1cb84cb6e208d0208b2463c7d197ca45a80e355ce1855b51ebfd12d
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.sei.USDC]
  },
  {
    /** optimism */
    chainId: CHAIN.OPTIMISM,
    start: '2023-08-25',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.optimism.USDC_CIRCLE]
  },
  {
    /** cronos */
    chainId: CHAIN.CRONOS,
    start: '2023-08-23', // 0xe42503b9613a913773dffe0bd45ed8f77d92793bfdcf9ab1b28c688ab56f395a
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.cronos.USDC]
  },
  {
    /** bsc */
    chainId: CHAIN.BSC,
    start: '2023-08-25',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.bsc.USDT],
    excludeFrom: [
      '0x138eb30f73bc423c6455c53df6d89cb01d9ebc63', // stargate USDT pool (result of bridges from: rootstock)
    ],
  },
  {
    /** gnosis */
    chainId: CHAIN.XDAI,
    start: '2023-08-23', // 0xc0b9485adaaf7efc7c3f82269557dcf1ed9ee534a1acf7111dcb55b2030b9b8b
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.xdai.USDC]
  },
  {
    /** sonic */
    chainId: CHAIN.SONIC,
    start: '2024-12-17',
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.sonic.USDC_e]
  },
  {
    /** fraxtal */
    chainId: CHAIN.FRAXTAL,
    start: '2024-03-27', // 0xe022f13135874da015ea9e8ea880b31634155538197d6169a13784a614b4f66d
    contract: beefyRevenueBridgeAddress,
    stables: [
      '0xFc00000000000000000000000000000000000001', // frxUSD
    ]
  },
  {
    /** metis */
    chainId: CHAIN.METIS,
    start: '2023-08-23', // 0xd3cb0e059789807793142311e0dee0eb872735acdff841b5a47cd0b317069139
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.metis.m_USDC]
  },
  {
    /** moonbeam */
    chainId: CHAIN.MOONBEAM,
    start: '2024-06-14', // 0x64d3b0e857e8e342f7581b7ba161f23d5790c6afabe193501a2e4603f8e2ed1c
    contract: beefyRevenueBridgeAddress,
    stables: [
      '0xCa01a1D0993565291051daFF390892518ACfAD3A', // axlUSDC
    ]
  },
  {
    /** mantle */
    chainId: CHAIN.MANTLE,
    start: '2024-01-05', // 0x66934644292573d4b8c47b8c9d2ce4ae204ab45c79a4222944556f0abf9f6ffd
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.mantle.USDC]
  },
  {
    /** base */
    chainId: CHAIN.BASE,
    start: '2023-08-23', // 0x007eeb770b6ff211ec373e4486417358bd0e8d786c74c9c6dbf6e32f2e23ee51
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.base.USDbC],
  },
  {
    /** mode */
    chainId: CHAIN.MODE,
    start: '2023-08-23', // 0x3c2936e0c0e43f3ec692c8001dcbaec942895ce0b13c01dbe8f6642ac585c59c
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.mode.USDC],
  },
  {
    /** avax */
    chainId: CHAIN.AVAX,
    start: '2023-08-23', // 0x5338286bfcde6ed927a639f128f02dfd8347eb5aacd561ea0f6169c529568971
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.avax.USDC]
  },
  {
    /** linea */
    chainId: CHAIN.LINEA,
    start: '2023-12-07', // 0x4c71e178794787169c69367cc8fa69f54dc4736c8c088710f9e33d814ef4fae6
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.linea.USDC]
  },
  {
    /** berachain */
    chainId: CHAIN.BERACHAIN,
    start: '2025-02-06', // 0xa06dba08b797f30a5cf810c15bbb42eb60379ca0a4ea3ebe263620611c8da0f9
    contract: beefyRevenueBridgeAddress,
    stables: [ADDRESSES.berachain.USDC]
  },
  {
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
    chainId: CHAIN.POLYGON,
    start: '2023-09-06',
    contract: beefyRevenueBridgeAddress,
    stables: [
      // ADDRESSES.polygon.USDT, // never received
      ADDRESSES.polygon.USDC, // switch tx  0x15aad861f5c8bd79d7c68b060a4b173d9e45523af4b02f57b8ff93bc8b3da9bc
    ],
    excludeFrom: [
      // '0xDd27227Dba7Ea8F5869466A10A8E36Bb2D709b35', // BeefySwapper, used to swap WNATIVE to USDC
      // '0xA374094527e1673A86dE625aa59517c5dE346d32', // Uniswap V3 WNATIVE/USDC pool, previously used to swap WNATIVE to USDC
      '0x8f5bbb2bb8c2ee94639e55d5f41de9b4839c1280', // synapse bridge (already counted, result of bridges from: cronos, metis, canto)
      '0xc0d173e3486f7c3d57e8a38a003500fd27e7d055', // BeefySwapper, used to swap axlUSDC to USDC
      '0x4fed5491693007f0cd49f4614ffc38ab6a04b619', // BeefyDeployer, historical manual swaps of nUSD (Synapse USD)
      '0x161d61e30284a33ab1ed227bedcac6014877b3de', // BeefyDev, historical manual swaps of nUSD (Synapse USD)
    ],
  },
  {
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
    chainId: CHAIN.ARBITRUM,
    start: '2023-09-06', // 0xab8bad3336438d336804bed884bdec61f874d650f427a04b7d7fbb05e814396d
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
  {
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
    chainId: CHAIN.ETHEREUM,
    start: '2024-07-11', // 0x25b2dc9a1f268b2e894138e4f0d445615579f298ba553c08951230ee5d224689
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
];

const seen = new Set<CHAIN>();
const adapter = Object.fromEntries(configs.map(config => {
  const {
    chainId,
    start,
    contract,
    stables,
    excludeFrom
  } = config;
  if (seen.has(chainId)) {
    throw new Error(`Duplicate chainId found: ${chainId}`);
  }
  seen.add(chainId);

  return [
    chainId, {
      start,
      meta: {methodology},
      fetch: async (options: FetchOptions) => {
        const logFilter = excludeFrom && excludeFrom.length > 0 ? makeErc20BlacklistFromFilter(excludeFrom) : undefined;
        let dailyRevenue = await addTokensReceived({
          options,
          target: contract,
          tokens: stables,
          logFilter
        });

        // Ethereum feeBatch only swaps the protocol share of the weth to usdc, not the holder share
        if (chainId === CHAIN.ETHEREUM) {
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
      },
    }
  ];
}));

export default {
  version: 2,
  adapter,
};

function makeErc20BlacklistFromFilter(blacklistedFromAddresses: string[],): (log: ERC20TransferLogResult) => boolean {
  const blacklistedFromAddressSet = new Set(blacklistedFromAddresses.map((address: string) => address.toLowerCase()));
  return (log: ERC20TransferLogResult) => {
    return !blacklistedFromAddressSet.has(log.from.toLowerCase());
  };
}
