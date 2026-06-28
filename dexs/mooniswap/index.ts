import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FACTORY = '0x71CD6666064C3A1354a3B4dca5fA1E2D3ee7D303'
const FEE_DENOMINATOR = 1e18

const eventAbi = 'event Swapped (address indexed account, address indexed src, address indexed dst, uint256 amount, uint256 result, uint256 srcBalance, uint256 dstBalance, uint256 totalSupply, address referral)'

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()

  // governance-set, capped at 0.3%; read at the historical block
  const fee = await options.api.call({ abi: 'uint256:fee', target: FACTORY })
  const feeRatio = Number(fee) / FEE_DENOMINATOR

  const pools = await options.api.call({ abi: 'address[]:getAllPools', target: FACTORY })
  const logs = await options.getLogs({ targets: pools, eventAbi })

  logs.forEach(log => dailyVolume.add(log.src, log.amount))

  const dailyFees = dailyVolume.clone(feeRatio)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume: "Sum of source-token input across every Swapped event from Mooniswap pools.",
    Fees: "Each swap charges the factory fee on the source input.",
    Revenue: "Zero. Mooniswap V1 takes no protocol or governance cut on swaps.",
    ProtocolRevenue: "Zero.",
    HoldersRevenue: "Zero.",
    SupplySideRevenue: "All swap fees accrue to liquidity providers as the pool reserves grow.",
  },
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
    },
  },
};

export default adapter;
