import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addToken, engines, swapEvents, volumeSide } from '../helpers/aggregators/route';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  for (const eventAbi of swapEvents) {
    const logs = await options.getLogs({ targets: engines, eventAbi });
    for (const log of logs) {
      // Wrappers emit the final swap as well as their inner engine. Count only the outer one.
      // The tiered collector is NOT in engines: it emits Settled, so its engine swap counts once.
      if (engines.includes(log.sender.toLowerCase())) continue;
      const [token, amount] = volumeSide(log);
      addToken(dailyVolume, token, amount, 'Routed Swaps');
    }
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: '2026-09-05',
  methodology: { Volume: 'One side of successful swaps through current and historical Route settlement contracts, excluding nested engine events; includes contract-level integrations and treasury trades, not quotes or underlying pool hops.' },
  breakdownMethodology: { Volume: { 'Routed Swaps': 'USDG, otherwise ETH/WETH when present, otherwise the input token, valued by DefiLlama; no fixed dollar peg or current-price cumulative estimate.' } },
};
export default adapter;
