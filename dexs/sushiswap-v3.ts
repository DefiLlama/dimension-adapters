import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from "../helpers/uniswap";

const sushiV3Configs: Record<string, { factory: string, start: string }> = {
  [CHAIN.ARBITRUM]: { factory: "0x1af415a1eba07a4986a52b6f2e7de7003d82231e", start: "2023-04-03" },
  [CHAIN.ARBITRUM_NOVA]: { factory: "0xaa26771d497814e81d305c511efbb3ced90bf5bd", start: "2023-04-03" },
  [CHAIN.XDAI]: { factory: "0xf78031cbca409f2fb6876bdfdbc1b2df24cf9bef", start: "2023-04-03" },
  [CHAIN.BASE]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2023-08-03" },
  [CHAIN.BLAST]: { factory: "0x7680d4b43f3d1d54d6cfeeb2169463bfa7a6cf0d", start: "2024-04-12" },
  [CHAIN.BSC]: { factory: "0x126555dd55a39328F69400d6aE4F782Bd4C34ABb", start: "2023-04-03" },
  [CHAIN.OPTIMISM]: { factory: "0x9c6522117e2ed1fe5bdb72bb0ed5e3f2bde7dbe0", start: "2023-04-03" },
  [CHAIN.POLYGON]: { factory: "0x917933899c6a5F8E37F31E19f92CdBFF7e8FF0e2", start: "2023-04-03" },
  [CHAIN.POLYGON_ZKEVM]: { factory: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", start: "2023-04-06" },
  [CHAIN.LINEA]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2023-07-26" },
  [CHAIN.THUNDERCORE]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2023-11-22" },
  [CHAIN.FANTOM]: { factory: "0x7770978eED668a3ba661d51a773d3a992Fc9DDCB", start: "2023-04-03" },
  [CHAIN.ETHEREUM]: { factory: "0xbACEB8eC6b9355Dfc0269C18bac9d6E2Bdc29C4F", start: "2023-04-03" },
  [CHAIN.AVAX]: { factory: "0x3e603C14aF37EBdaD31709C4f848Fc6aD5BEc715", start: "2023-04-03" },
  [CHAIN.HEMI]: { factory: "0xcdbcd51a5e8728e0af4895ce5771b7d17ff71959", start: "2025-03-12" },
  [CHAIN.KAVA]: { factory: "0x1e9b24073183d5c6b7ae5fb4b8f0b1dd83fdc77a", start: "2023-10-26" },
  [CHAIN.CORE]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2024-04-12" },
  [CHAIN.METIS]: { factory: "0x145d82bca93cca2ae057d1c6f26245d1b9522e6f", start: "2024-09-19" },
  [CHAIN.SCROLL]: { factory: "0x46b3fdf7b5cde91ac049936bf0bdb12c5d22202e", start: "2024-09-20" },
  [CHAIN.SONIC]: { factory: "0x46b3fdf7b5cde91ac049936bf0bdb12c5d22202e", start: "2024-12-25" },
  [CHAIN.KATANA]: { factory: "0x203e8740894c8955cb8950759876d7e7e45e04c1", start: "2025-07-01" },

  // bad rpc chains
  // [CHAIN.FUSE]: { factory: "0x1b9d177CcdeA3c79B6c8F40761fc8Dc9d0500EAa", start: "2023-04-03" },
  // [CHAIN.BITTORRENT]: { factory: "0xbbde1d67297329148fe1ed5e6b00114842728e65", start: "2023-11-20" },
  // [CHAIN.ROOTSTOCK]: { factory: "0x46b3fdf7b5cde91ac049936bf0bdb12c5d22202e", start: "2024-05-22" },
}

const getUniV3LogAdapterConfig = {
  userFeesRatio: 1,
  dynamicProtocolFees: true,
  getRevenueRatio: (props: UniGetRevenueRatioProps): { _revenueRatio: number, _protocolRevenueRatio?: number, _holdersRevenueRatio?: number } => {
    // dynamic fetch pool protocol fee share and count them toward protocol revenue
    const rate = (props.protocolFeeRatioToken0 && props.protocolFeeRatioToken1) ? (props.protocolFeeRatioToken0 + props.protocolFeeRatioToken1) / 2 : 0;

    // Where SushiSwap V3 protocol fees go (verified on-chain on Ethereum):
    // Each pool's slot0.feeProtocol sets the protocol cut (1/N of swap fees; active
    // pools use feeProtocol=4 -> 25%). The factory owner calls collectProtocol and
    // routes those fees to the V3 FeeCollector (0xdbeca8fb...). From there the value
    // splits two ways:
    //   - ~62% -> Sushi ops/treasury multisig (0x19b3eb3a...)   => ProtocolRevenue
    //   - ~38% -> a shared fee converter (0xac4c6e... -> 0xc10ee9031f...) that swaps
    //             the collected tokens into SUSHI and deposits it into the SushiBar
    //             (xSUSHI, 0x8798249c...) where stakers accrue it    => HoldersRevenue
    // The 62/38 split is the all-time USD ratio of the FeeCollector's direct outflows
    // to those two destinations. Note V2 protocol fees do NOT follow this path - they
    // accrue to the legacy SushiMaker and currently sit there unconverted, reaching
    // neither the treasury nor xSUSHI.
    return { _revenueRatio: rate, _protocolRevenueRatio: rate * 0.62, _holdersRevenueRatio: rate * 0.38 };
  }
}

async function fetch(options: FetchOptions) {
  const config = sushiV3Configs[options.chain];
  const results = await getUniV3LogAdapter({ factory: config.factory, ...getUniV3LogAdapterConfig })(options);

  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  if (results.dailyProtocolRevenue) {
    dailyRevenue.add(results.dailyProtocolRevenue, 'Swap Fees To Treasury')
    dailyProtocolRevenue.add(results.dailyProtocolRevenue, 'Swap Fees To Treasury')
  }
  if (results.dailyHoldersRevenue) {
    dailyRevenue.add(results.dailyHoldersRevenue, 'Swap Fees To xSUSHI Stakers')
    dailyHoldersRevenue.add(results.dailyHoldersRevenue, 'Swap Fees To xSUSHI Stakers')
  }
  if (results.dailySupplySideRevenue)
    dailySupplySideRevenue.add(results.dailySupplySideRevenue, 'Swap Fees To Liquidity Providers')
  else
    dailySupplySideRevenue.add(results.dailyFees, 'Swap Fees To Liquidity Providers')

  return {
    dailyVolume: results.dailyVolume,
    dailyFees: results.dailyFees.clone(1, 'Token Swap Fees'),
    dailyUserFees: results.dailyFees.clone(1, 'Token Swap Fees'),
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
}

export default {
  version: 2,
  pullHourly: true,
  fetch: fetch,
  adapter: sushiV3Configs,
  methodology: {
    Fees: "Each pool charges between 0.01% to 1% fee",
    UserFees: "Users pay between 0.01% to 1% fee",
    Revenue: "Share from 0 to 25% of the fee goes to treasury",
    HoldersRevenue: "Protocol fee share routed to xSUSHI stakers through the SushiBar flow",
    ProtocolRevenue: "Treasury receives all revenue",
    SupplySideRevenue: "Liquidity providers get most of the fees of all trades in their pools"
  },
  breakdownMethodology: {
    Fees: {
      "Token Swap Fees": "Swap fees paid by users on SushiSwap V3 pools. Fee rates vary by pool from 0.01% to 1%.",
    },
    UserFees: {
      "Token Swap Fees": "Swap fees paid by users on SushiSwap V3 pools. Fee rates vary by pool from 0.01% to 1%.",
    },
    Revenue: {
      "Swap Fees To Treasury": "Protocol fee share routed to the Sushi treasury.",
      "Swap Fees To xSUSHI Stakers": "Protocol fee share routed to xSUSHI stakers through the SushiBar flow.",
    },
    ProtocolRevenue: {
      "Swap Fees To Treasury": "Protocol fee share routed to the Sushi treasury.",
    },
    SupplySideRevenue: {
      "Swap Fees To Liquidity Providers": "Swap fees retained by liquidity providers after protocol fees.",
    },
    HoldersRevenue: {
      "Swap Fees To xSUSHI Stakers": "Protocol fee share routed to xSUSHI stakers through the SushiBar flow.",
    },
  },
}
