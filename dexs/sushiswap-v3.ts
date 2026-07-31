import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from "../helpers/uniswap";

const sushiV3Configs: Record<string, { factory: string, start: string }> = {
  [CHAIN.ARBITRUM]: { factory: "0x1af415a1eba07a4986a52b6f2e7de7003d82231e", start: "2023-04-03" },
  [CHAIN.ARBITRUM_NOVA]: { factory: "0xaa26771d497814e81d305c511efbb3ced90bf5bd", start: "2023-04-03" },
  [CHAIN.XDAI]: { factory: "0xf78031cbca409f2fb6876bdfdbc1b2df24cf9bef", start: "2023-04-03" },
  [CHAIN.BASE]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2023-08-03" },
  [CHAIN.BLAST]: { factory: "0x7680d4b43f3d1d54d6cfeeb2169463bfa7a6cf0d", start: "2024-03-02" },
  [CHAIN.BSC]: { factory: "0x126555dd55a39328F69400d6aE4F782Bd4C34ABb", start: "2023-04-03" },
  [CHAIN.OPTIMISM]: { factory: "0x9c6522117e2ed1fe5bdb72bb0ed5e3f2bde7dbe0", start: "2023-04-03" },
  [CHAIN.POLYGON]: { factory: "0x917933899c6a5F8E37F31E19f92CdBFF7e8FF0e2", start: "2023-04-03" },
  [CHAIN.POLYGON_ZKEVM]: { factory: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", start: "2023-04-06" },
  [CHAIN.LINEA]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2023-07-26" },
  [CHAIN.THUNDERCORE]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2023-05-16" },
  [CHAIN.FANTOM]: { factory: "0x7770978eED668a3ba661d51a773d3a992Fc9DDCB", start: "2023-04-03" },
  [CHAIN.ETHEREUM]: { factory: "0xbACEB8eC6b9355Dfc0269C18bac9d6E2Bdc29C4F", start: "2023-04-03" },
  [CHAIN.AVAX]: { factory: "0x3e603C14aF37EBdaD31709C4f848Fc6aD5BEc715", start: "2023-04-03" },
  [CHAIN.HEMI]: { factory: "0xcdbcd51a5e8728e0af4895ce5771b7d17ff71959", start: "2024-11-18" },
  [CHAIN.KAVA]: { factory: "0x1e9b24073183d5c6b7ae5fb4b8f0b1dd83fdc77a", start: "2023-10-26" },
  [CHAIN.CORE]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2023-07-09" },
  [CHAIN.METIS]: { factory: "0x145d82bca93cca2ae057d1c6f26245d1b9522e6f", start: "2023-10-25" },
  [CHAIN.SCROLL]: { factory: "0x46b3fdf7b5cde91ac049936bf0bdb12c5d22202e", start: "2023-10-17" },
  [CHAIN.SONIC]: { factory: "0x46b3fdf7b5cde91ac049936bf0bdb12c5d22202e", start: "2024-12-25" },
  [CHAIN.KATANA]: { factory: "0x203e8740894c8955cb8950759876d7e7e45e04c1", start: "2025-05-30" },
  [CHAIN.ROBINHOOD]: { factory: "0xE51960f1B45f1C9FB6D166E6a884F866fC70433B", start: "2026-07-10"},

  // Deployments left out on purpose, checked 2026-07-28:
  // - no swaps at all in the last 30 days, so nothing to count
  // [CHAIN.FUSE]: { factory: "0x1b9d177CcdeA3c79B6c8F40761fc8Dc9d0500EAa", start: "2023-04-03" },
  // [CHAIN.BITTORRENT]: { factory: "0xbbde1d67297329148fe1ed5e6b00114842728e65", start: "2023-11-20" },
  // - real volume (~$1.5M/30d) but not reachable yet: every configured RSK endpoint
  //   rejects eth_getLogs, and the cached pool list is stuck at 2025-03 so it misses 8 of
  //   the 21 live pools. Needs an RPC that serves logs plus an rsk entry in the TVL
  //   adapter's uniV3Config before it can be turned back on.
  // [CHAIN.ROOTSTOCK]: { factory: "0x46b3fdf7b5cde91ac049936bf0bdb12c5d22202e", start: "2024-05-22" },
  // - real volume (~$3.8M/30d) but the TVL adapter tracks filecoin by subgraph, so no
  //   pool list is ever cached for this factory and getUniV3LogAdapter has nothing to read
  // [CHAIN.FILECOIN]: { factory: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", start: "2024-09-01" },
}

const getUniV3LogAdapterConfig = {
  userFeesRatio: 1,
  dynamicProtocolFees: true,
  getRevenueRatio: (props: UniGetRevenueRatioProps): { _revenueRatio: number, _protocolRevenueRatio?: number } => {
    // Each pool's slot0.feeProtocol sets the protocol cut, packed as one nibble per token.
    // Average the two sides: a pool can set a protocol fee on one token only.
    const { protocolFeeRatioToken0 = 0, protocolFeeRatioToken1 = 0 } = props;
    const rate = (protocolFeeRatioToken0 + protocolFeeRatioToken1) / 2;

    // Where SushiSwap V3 protocol fees go (verified on-chain, July 2026):
    // Pools charge 1/N of swap fees to the protocol - feeProtocol=68 -> 25% on most
    // chains, feeProtocol=34 -> 50% on Katana, whose pool implementation allows a
    // protocol divisor down to 1 (stock Uniswap V3 enforces 4..10).
    // V3Manager.collectFees() sends the collected tokens to its `maker`:
    //   - ethereum + 10 other chains -> TokenChwomper (0xdbeca8fb...), which swaps them
    //     to stables and withdraws to the Sushi Operation Multisig (0x19b3eb3a...)
    //   - polygon, base -> local Gnosis Safes; optimism, bsc -> still uncollected
    // All of it lands under Sushi's operational control, so the whole protocol cut is
    // ProtocolRevenue. None of it reaches xSUSHI: the SushiBar ratio has been flat since
    // Nov 2025 (+0.0036% over the 7 months to 2026-07-27), and the transfers that used to
    // be read as a 38% xSUSHI leg go to RedSnwapper (0xac4c6e...), Sushi's swap executor,
    // which returns the proceeds to the collector - the input leg of a swap, not a payout.
    return { _revenueRatio: rate, _protocolRevenueRatio: rate };
  }
}

async function fetch(options: FetchOptions) {
  const config = sushiV3Configs[options.chain];
  const results = await getUniV3LogAdapter({ factory: config.factory, ...getUniV3LogAdapterConfig })(options);

  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  if (results.dailyProtocolRevenue) {
    dailyRevenue.add(results.dailyProtocolRevenue, 'Swap Fees To Treasury')
    dailyProtocolRevenue.add(results.dailyProtocolRevenue, 'Swap Fees To Treasury')
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
  };
}

export default {
  version: 2,
  pullHourly: true,
  fetch: fetch,
  adapter: sushiV3Configs,
  methodology: {
    Fees: "Traders pay a swap fee set per pool, from 0.01% to 1% on most chains and up to 4% on Katana",
    UserFees: "Users pay the pool's swap fee on every trade, from 0.01% to 1% on most chains and up to 4% on Katana",
    Revenue: "The share of each swap fee Sushi keeps rather than paying to liquidity providers - nothing on most pools, 25% where the protocol fee is switched on, and 50% on Katana",
    HoldersRevenue: "Zero. SUSHI stakers stopped receiving swap fees in November 2025; the xSUSHI pool has grown 0.0036% in the seven months since, so no part of the fee is counted as going to holders",
    ProtocolRevenue: "Sushi keeps all of its fee share, collected into a Sushi-controlled treasury wallet on each chain",
    SupplySideRevenue: "Liquidity providers keep the rest of the swap fee in the pools they fund"
  },
  breakdownMethodology: {
    Fees: {
      "Token Swap Fees": "Swap fees paid by users on SushiSwap V3 pools. Fee rates vary by pool, from 0.01% to 1% on most chains and up to 4% on Katana.",
    },
    UserFees: {
      "Token Swap Fees": "Swap fees paid by users on SushiSwap V3 pools. Fee rates vary by pool, from 0.01% to 1% on most chains and up to 4% on Katana.",
    },
    Revenue: {
      "Swap Fees To Treasury": "The part of each swap fee Sushi keeps - 25% where the protocol fee is switched on, 50% on Katana.",
    },
    ProtocolRevenue: {
      "Swap Fees To Treasury": "The part of each swap fee Sushi keeps, collected into a Sushi-controlled treasury wallet on each chain.",
    },
    SupplySideRevenue: {
      "Swap Fees To Liquidity Providers": "Swap fees retained by liquidity providers after Sushi's share.",
    },
  },
}
