import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from '../utils/fetchURL';
import { getEnv } from '../helpers/env';

const fetch = async (_t: any, _a: any, options: FetchOptions) => {
    const url = "https://api.spacescope.io/v2/gas/daily_network_fee_breakdown"
    const headers = { "Authorization": `Bearer ${getEnv('SPACESCOPE_API_KEY')}`};
    const data = await httpGet(`${url}?start_date=${options.dateString}&end_date=${options.dateString}`, { headers: headers})
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const response = data.data[0]
    const fees = Number(response.base_fee_burn) 
    + Number(response.overestimation_burn)
    + Number(response.precommit_batch_fee_burn)
    + Number(response.provecommit_batch_fee_burn) 
    + Number(response.penalty_fee_burn)

  dailyFees.addCGToken('filecoin', fees)
  dailyRevenue.addCGToken('filecoin', fees)

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
  };
}

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.FILECOIN],
  start: '2020-10-16',
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users',
    Revenue: 'Transaction fees paid by users',
    HoldersRevenue: 'Transaction base fees paid by users were burned',
  }
}

export default adapter;
