import { log } from "console"
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const ctf_contract_address = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045'
const neg_risk_adaptor_contract_address = '0xd91e80cf2e7be2e162c6513ced06f1dd0da35296'

const event_ctf_payout_redeemed = 'event PayoutRedemption(address indexed redeemer,address indexed collateralToken,bytes32 indexed parentCollectionId,bytes32 conditionId,uint256[] indexSets,uint256 payout)';
const event_neg_risk_adaptor_payout_redeemed = 'event PayoutRedemption(address indexed redeemer,bytes32 indexed conditionId,uint256[] amounts,uint256 payout)';


const fetchFees =  async (options: FetchOptions): Promise<FetchResultV2> => {
  const logs_ctf_payout_redeemed = await options.getLogs({
    target: ctf_contract_address,
    eventAbi: event_ctf_payout_redeemed,
  })

  const logs_neg_risk_adaptor_payout_redeemed = await options.getLogs({
    target: neg_risk_adaptor_contract_address,
    eventAbi: event_neg_risk_adaptor_payout_redeemed,
  })

  const payout = options.createBalances()
  logs_ctf_payout_redeemed.forEach((log) => {
    payout.add(log.collateralToken, log.payout)
  })

  logs_neg_risk_adaptor_payout_redeemed.forEach((log) => {
    payout.addUSDValue(Number(log.payout)/1e6)
  })

  payout.resizeBy(1/0.98)
  const dailyFees = payout.clone()
  dailyFees.resizeBy(0.02)
  return {
    dailyFees
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: '2020-09-30',
    }
  },
}

export default adapter
