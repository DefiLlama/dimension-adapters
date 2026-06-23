import { FetchOptions } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { breakdownMethodology } from './ramses-hl-cl'

const abi = {
  "Buy": "event Buy(address user, uint256 tokenId, uint256 tokenAmount, uint256 cost, uint256 tokenSupply, address referrerAddress, uint256 referralFee, uint256 creatorFee, uint256 protocolFee)",
  "Sell": "event Sell(address user, uint256 tokenId, uint256 tokenAmount, uint256 cost, uint256 tokenSupply, address referrerAddress, uint256 referralFee, uint256 creatorFee, uint256 protocolFee)",
}

async function fetch({ createBalances, getLogs }: FetchOptions) {
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  const buyLogs = await getLogs({ target: '0x8315f1eb449Dd4B779495C3A0b05e5d194446c6e', eventAbi: abi.Buy })
  const sellLogs = await getLogs({ target: '0x8315f1eb449Dd4B779495C3A0b05e5d194446c6e', eventAbi: abi.Sell })

  function addLogData(log: any) {
    dailyVolume.addGasToken(log.cost)
    dailyFees.addGasToken(BigInt(log.protocolFee) + BigInt(log.creatorFee) + BigInt(log.referralFee), 'Trading Fees');
    
    dailyRevenue.addGasToken(log.protocolFee, 'Protocol Fees')
    dailySupplySideRevenue.addGasToken(log.creatorFee, 'Creator Fees')
    dailySupplySideRevenue.addGasToken(log.referralFee, 'Referral Fees')
  }

  buyLogs.forEach(addLogData)
  sellLogs.forEach(addLogData)

  return { dailyFees, dailyVolume, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue }
}


export default {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: 'All fees paid by users for trading tokens.',
    Revenue: 'Protocol share of trading fees.',
    ProtocolRevenue: 'Protocol share of trading fees.',
    SupplySideRevenue: 'Fees distributed to creators and referrers.',
  },
  breakdownMethodology: {
    Fees: {
      'Trading Fees': 'All fees paid by users for trading tokens',
    },
    Revneue: {
      'Protocol Fees': 'Protocol share of trading fees.',
    },
    SupplySideRevenue: {
      'Creator Fees': 'Fees are distributed to creators.',
      'Referral Fees': 'Fees are distributed to referrers.',
    },
  },
  fetch,
  adapter: {
    [CHAIN.AVAX]: {
      start: '2025-05-04',
    },
  }
}