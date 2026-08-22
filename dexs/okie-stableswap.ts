import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

// https://www.oklink.com/x-layer/evm/address/0x296777031cC0F97B54EA8aC3c28c8FC6722f58ec/contract
const FACTORY = '0x296777031cC0F97B54EA8aC3c28c8FC6722f58ec'

const abi = {
  pairLength: 'uint256:pairLength',
  swapPairContract: 'function swapPairContract(uint256) view returns (address)',
  coins: 'function coins(uint256) view returns (address)',
  fee: 'uint256:fee',
  adminFee: 'uint256:admin_fee',
  feeDenominator: 'uint256:FEE_DENOMINATOR',
  tokenExchange: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)',
}

const fetch = async (options: FetchOptions) => {
  const { api, getLogs, createBalances, chain } = options
  const pairLength = await api.call({ target: FACTORY, abi: abi.pairLength })
  const pools: string[] = await api.multiCall({
    target: FACTORY,
    abi: abi.swapPairContract,
    calls: Array.from({ length: Number(pairLength) }, (_, i) => i),
  })

  const [coins0, coins1, fees, adminFees, denominators] = await Promise.all([
    api.multiCall({ abi: abi.coins, calls: pools.map(target => ({ target, params: [0] })) }),
    api.multiCall({ abi: abi.coins, calls: pools.map(target => ({ target, params: [1] })) }),
    api.multiCall({ abi: abi.fee, calls: pools }),
    api.multiCall({ abi: abi.adminFee, calls: pools }),
    api.multiCall({ abi: abi.feeDenominator, calls: pools }),
  ])

  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyProtocolRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  const logs = await getLogs({ targets: pools, eventAbi: abi.tokenExchange, flatten: false })

  logs.forEach((poolLogs: any[], i: number) => {
    const tokens = [coins0[i], coins1[i]]
    const feeRate = Number(fees[i]) / Number(denominators[i])
    const adminRate = Number(adminFees[i]) / Number(denominators[i])

    poolLogs.forEach((log: any) => {
      const soldToken = tokens[Number(log.sold_id)]
      const boughtToken = tokens[Number(log.bought_id)]

      addOneToken({ chain, balances: dailyVolume, token0: soldToken, amount0: log.tokens_sold, token1: boughtToken, amount1: log.tokens_bought })

      // the fee is taken out of the bought token, so tokens_bought is already net of it
      const feeAmount = Number(log.tokens_bought) * feeRate / (1 - feeRate)
      dailyFees.add(boughtToken, feeAmount, 'Token Swap Fees')
      dailyProtocolRevenue.add(boughtToken, feeAmount * adminRate, 'Protocol fees')
      dailySupplySideRevenue.add(boughtToken, feeAmount * (1 - adminRate), 'LP fees')
    })
  })

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.XLAYER]: {
      start: '2025-09-06',
    },
  },
  methodology: {
    Volume: 'Swap volume from all OkieSwap Stableswap pools registered in the factory.',
    Fees: "Traders pay each pool's own fee on every swap, read on chain from fee()/FEE_DENOMINATOR().",
    Revenue: "The admin fee share of the swap fee, read on chain from admin_fee()/FEE_DENOMINATOR().",
    ProtocolRevenue: 'The admin fee share of the swap fee.',
    SupplySideRevenue: 'The rest of the swap fee, kept by the liquidity providers.',
  },
  breakdownMethodology: {
    Fees: { 'Token Swap Fees': "Swap fees charged at each pool's own fee rate." },
    UserFees: { 'Token Swap Fees': 'Swap fees paid by traders.' },
    Revenue: { 'Protocol fees': 'Admin fee share of the swap fee.' },
    ProtocolRevenue: { 'Protocol fees': 'Admin fee share of the swap fee.' },
    SupplySideRevenue: { 'LP fees': 'Swap fees kept by the liquidity providers.' },
  },
};

export default adapter;
