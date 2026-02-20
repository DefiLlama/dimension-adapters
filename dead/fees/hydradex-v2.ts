
import adapter from '../dexs/hydradex'
const { breakdown,  ...rest } = adapter

export default {
  ...rest,
  deadFrom: '2023-07-09',
  adapter: breakdown['v2'],
  methodology: {
    UserFees: 'User pays 0.3% fees on each swap.',
    ProtocolRevenue: 'Protocol have no revenue.',
    SupplySideRevenue: 'All user fees are distributed among LPs.',
    HoldersRevenue: 'Holders have no revenue.',
  }
}