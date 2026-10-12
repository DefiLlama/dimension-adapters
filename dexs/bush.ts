import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { isCoreAsset } from "../helpers/prices";

// Bush is a Balancer v3 fork, every pool swaps through the single vault
// vault: https://explorer.mainnet.chain.robinhood.com/address/0xB055000fbE3cc9bDE7742C583a86cc6283E3fF85
// addresses: https://github.com/Bush-fi/bush-deployments/blob/main/addresses/robinhoodchain.json
// pool factories (all register on the vault): weighted 0x18aF8DD03b63312453ee59FBea6616B4e86a0e48, 0x8c873AC5028C9b30b6a32Cf222fcfB24444da5Db,
// stable 0xB9917645B1Bf19a86b4c45808B5Ed27626f7BAe7, reclamm 0xeaDAB24A503BC4D20BF05ff77639f57CB5481E6E
// protocol fees are swept by ProtocolFeeSweeper 0x78FdAe68130ad08bB44e28dDc97fc3eD865C335C to the treasury, a 2-of-3 Safe 0x572ffb4AA774aB785E2eC79CEC4071BB3037575a
const VAULT = '0xB055000fbE3cc9bDE7742C583a86cc6283E3fF85'

const SwapEvent = 'event Swap(address indexed pool, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 swapFeePercentage, uint256 swapFeeAmount)'

const abis = {
  getProtocolFeeController: 'address:getProtocolFeeController',
  // aggregateSwapFeePercentage = share of the swap fee the vault actually withholds (protocol + pool creator), the rest stays with LPs
  getPoolConfig: 'function getPoolConfig(address pool) view returns (tuple(tuple(bool disableUnbalancedLiquidity, bool enableAddLiquidityCustom, bool enableRemoveLiquidityCustom, bool enableDonation) liquidityManagement, uint256 staticSwapFeePercentage, uint256 aggregateSwapFeePercentage, uint256 aggregateYieldFeePercentage, uint40 tokenDecimalDiffs, uint32 pauseWindowEndTime, bool isPoolRegistered, bool isPoolInitialized, bool isPoolPaused, bool isPoolInRecoveryMode))',
  getPoolProtocolSwapFeeInfo: 'function getPoolProtocolSwapFeeInfo(address pool) view returns (uint256 feePercentage, bool isOverride)',
}

const SWAP_FEES_TO_LPS = 'Swap Fees To LPs'
const SWAP_FEES_TO_PROTOCOL = 'Swap Fees To Protocol'
const SWAP_FEES_TO_POOL_CREATORS = 'Swap Fees To Pool Creators'

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const logs = await options.getLogs({ target: VAULT, eventAbi: SwapEvent })
  if (!logs.length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue }

  // fee splits are governance-set and change rarely, read them at the window end (a pool registered mid-window does not exist at the opening block)
  const pools = [...new Set(logs.map((log: any) => log.pool.toLowerCase()))]
  const feeController = await options.api.call({ target: VAULT, abi: abis.getProtocolFeeController })
  const [poolConfigs, protocolSwapFees] = await Promise.all([
    options.api.multiCall({ target: VAULT, abi: abis.getPoolConfig, calls: pools }),
    options.api.multiCall({ target: feeController, abi: abis.getPoolProtocolSwapFeeInfo, calls: pools }),
  ])
  // percentages are 18-decimal fixed point (1e18 = 100%), kept as bigint so raw amounts don't lose precision
  const ONE = 10n ** 18n
  const splits: Record<string, { protocol: bigint, creator: bigint }> = {}
  pools.forEach((pool, i) => {
    const aggregate = BigInt(poolConfigs[i].aggregateSwapFeePercentage)
    // the vault only withholds the aggregate; the protocol part of it is capped by the fee controller's rate, the remainder goes to the pool creator
    const protocolRate = BigInt(protocolSwapFees[i].feePercentage)
    const protocol = protocolRate < aggregate ? protocolRate : aggregate
    splits[pool] = { protocol, creator: aggregate - protocol }
  })

  logs.forEach((log: any) => {
    // swapFeeAmount is charged in tokenIn and amountIn includes it, so volume is gross of fees
    // value both legs on the priced side, converting the fee to tokenOut terms when only tokenOut is priced
    const amountIn = BigInt(log.amountIn)
    let token = log.tokenIn, volume = amountIn, fee = BigInt(log.swapFeeAmount)
    if (!isCoreAsset(options.chain, log.tokenIn) && amountIn > 0n) {
      token = log.tokenOut
      volume = BigInt(log.amountOut)
      fee = fee * volume / amountIn
    }
    dailyVolume.add(token, volume)
    if (!fee) return

    const { protocol, creator } = splits[log.pool.toLowerCase()]
    const protocolFee = fee * protocol / ONE
    const creatorFee = fee * creator / ONE
    dailyFees.add(token, fee, METRIC.SWAP_FEES)
    dailyRevenue.add(token, protocolFee, SWAP_FEES_TO_PROTOCOL)
    dailySupplySideRevenue.add(token, creatorFee, SWAP_FEES_TO_POOL_CREATORS)
    dailySupplySideRevenue.add(token, fee - protocolFee - creatorFee, SWAP_FEES_TO_LPS)
  })

  // yield fees are not tracked: the vault emits no per-swap yield fee amount. Only steakUSDG (pool 0x2aD93b3c60Fa26f9514d6333a59346a52978c786) pays yield fees today, at a 50% aggregate yield fee

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-10-02', // first swap on the vault was 2026-08-26; earlier days were test trades (TEST token pool, sub-$1 swaps)
  methodology: {
    Volume: "Value of all tokens swapped through Bush pools.",
    Fees: "Swap fees paid by traders on every swap.",
    UserFees: "Swap fees paid by traders on every swap.",
    Revenue: "Protocol share of swap fees, read per pool from the vault (protocol swap fee set by the protocol fee controller).",
    ProtocolRevenue: "Protocol share of swap fees, which goes to the Bush treasury.",
    SupplySideRevenue: "Swap fees kept by liquidity providers, plus the pool creator fee where a pool sets one.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by traders on every swap.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by traders on every swap.",
    },
    Revenue: {
      [SWAP_FEES_TO_PROTOCOL]: "Share of swap fees withheld by the vault for the protocol.",
    },
    ProtocolRevenue: {
      [SWAP_FEES_TO_PROTOCOL]: "Share of swap fees withheld by the vault for the protocol.",
    },
    SupplySideRevenue: {
      [SWAP_FEES_TO_LPS]: "Share of swap fees left in the pool for liquidity providers.",
      [SWAP_FEES_TO_POOL_CREATORS]: "Share of swap fees paid to pool creators.",
    },
  },
}

export default adapter
