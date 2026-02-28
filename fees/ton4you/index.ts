import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { httpGet } from '../../utils/fetchURL'

const METRICS_URL = (timestmap: number) => `https://ton4u.io/api/defillama/metrics?date=${new Date(timestmap * 1000).toISOString().split('T')[0]}`;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  const responseData: any = await httpGet(METRICS_URL(options.startOfDay))
  for (const [key, variant] of Object.entries(responseData.variants)) {
    if (String(key).toLowerCase() === 'demo') continue;

    dailyFees.addUSDValue(Number((variant as any).daily.fees_usd || 0));
	}

	// Ton4You currently routes fees to service/referral NFTs (holders-like distribution), but we don't count these revneue as holders revenue
	return {
		dailyFees: dailyFees,
		dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
	}
}

const adapter: SimpleAdapter = {
	methodology: {
    Fees: 'Ton4You fees are defined as the protocol service fee plus the referral reward that is paid out when a position is settled.',
    UsersFees: 'Users payd service fee plus the referral reward a position is settled.',
		Revenue: 'All fees are revenue.',
	},
	adapter: {
		[CHAIN.TON]: {
			start: '2026-01-01',
			fetch,
		},
	},
}

export default adapter
