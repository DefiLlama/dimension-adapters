import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addGasTokensReceived, evmReceivedGasAndTokens, getETHReceived } from "../helpers/token"

// https://github.com/ethereum-optimism/op-analytics/blob/main/op_collective_economics/opcollective_feesplit/inputs/op_collective_feesplit_config.csv
// https://github.com/ethereum-optimism/op-analytics/blob/main/src/op_analytics/configs/revshare_to_addresses.yaml

const fees: any = {
  [CHAIN.BASE]: ['0x9c3631dDE5c8316bE5B7554B0CcD2631C15a9A05'],
  [CHAIN.ETHEREUM]: [
    '0xa3d596eafab6b13ab18d40fae1a962700c84adea',
    '0xC2eC5Dd60CBD5242b8cdeB9d0d37Ff6024584631',
    '0x391716d440C151C42cdf1C95C1d83A5427Bca52C',
    '0xFFdbf6D72fAb356385476369f21064a8e81135d0',
  ],
  [CHAIN.UNICHAIN]: ['0x4300C0D3C0D3C0D3C0d3C0d3c0d3C0d3C0d30002'],
  [CHAIN.SONEIUM]: ['0x16A27462B4D61BDD72CbBabd3E43e11791F7A28c']
}

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const logs = await options.getLogs({
    targets: fees[options.chain],
    eventAbi: 'event SafeReceived (address indexed sender, uint256 value)',
  })
  const logs2 = await options.getLogs({
    targets: fees[options.chain],
    eventAbi: 'event Deposited (address from, uint256 value, bytes data)',
  })
  const dailyFees = options.createBalances()
  for (const log of logs) dailyFees.addGasToken(log.value)
  for (const log of logs2) dailyFees.addGasToken(log.value)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "Services fees paid by blockchain using OP Stack and registered on Superchain.",
  Revenue: "All fees are collected by OP Labs.",
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-06-01',
      meta: { methodology },
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-04-01',
      meta: { methodology },
    },
    [CHAIN.UNICHAIN]: {
      fetch,
      start: '2025-02-01',
      meta: { methodology },
    },
    [CHAIN.SONEIUM]: {
      fetch,
      start: '2024-12-01',
      meta: { methodology },
    },
  }
}

export default adapter
