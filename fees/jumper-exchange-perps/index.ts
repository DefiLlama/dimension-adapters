import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { fetchBuilderCodeRevenue } from '../../helpers/hyperliquid';

const BUILDER_ADDRESS = '0x50d95d5823c5dc70d49599e9f120dfbbba93be56';
const LABEL = 'Hyperliquid Builder Code Fees';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  try {
    const result = await fetchBuilderCodeRevenue({ options, builder_address: BUILDER_ADDRESS });
    dailyVolume.addBalances(result.dailyVolume);
    dailyFees.addBalances(result.dailyFees, LABEL);
  } catch (error: any) {
    if (!String(error?.message).includes('Builder fee data is not available') ||
      Date.now() - options.startOfDay * 1000 < 2 * 86400 * 1000) throw error;
    console.error(`jumper-exchange-perps: no builder fills for ${options.dateString}`);
  }

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.HYPERLIQUID],
  start: '2026-09-09',
  doublecounted: true,
  fetch,
  methodology: {
    Volume: 'Perpetual trading volume routed through Jumper on Hyperliquid.',
    Fees: 'Builder code fees paid by users trading Hyperliquid perpetuals through Jumper.',
    Revenue: 'Builder code fees attributed to Jumper from Hyperliquid perpetual trades.',
    ProtocolRevenue: 'Builder code fees attributed to Jumper from Hyperliquid perpetual trades.',
  },
  breakdownMethodology: {
    Fees: { [LABEL]: 'Builder fees paid on Jumper-routed Hyperliquid perps trades.' },
    Revenue: { [LABEL]: 'Builder fees attributed to Jumper.' },
    ProtocolRevenue: { [LABEL]: 'Builder fees attributed to Jumper.' },
  },
};

export default adapter;
