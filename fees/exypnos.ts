import { CHAIN } from "../helpers/chains"
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { addTokensReceived, getETHReceived } from "../helpers/token";

// Exypnos has no router of its own — it's a front-end over 0x's AllowanceHolder, taking a
// 0.35% integrator fee that lands as a Transfer (ERC20) or native transfer to its fee wallet.
// Launched 2026-07-07 across all 5 chains: https://medium.com/@exypnos_xyz/exypnos-a-cross-chain-swap-aggregator-66cf6032c580
const chainConfig: Record<string, { id: number, start: string }> = {
  [CHAIN.ETHEREUM]: { id: 1, start: '2026-07-07' },
  [CHAIN.OPTIMISM]: { id: 10, start: '2026-07-07' },
  [CHAIN.ARBITRUM]: { id: 42161, start: '2026-07-07' },
  [CHAIN.BASE]: { id: 8453, start: '2026-07-07' },
  [CHAIN.ROBINHOOD]: { id: 4663, start: '2026-07-07' },
};

const feeCollector = "0xad01c20d5886137e056775af56915de824c8fce5"

async function fetch(options: FetchOptions) {
  const dailyFees = await addTokensReceived({ target: feeCollector, options })
  await getETHReceived({ target: feeCollector, options, balances: dailyFees })

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const methodology = {
  Fees: 'Integrator fee (0.35% of sell amount) charged by Exypnos on swaps routed through 0x, pulled from ERC20 Transfer events and native gas-token transfers into the Exypnos fee wallet.',
  Revenue: 'All collected integrator fees are retained by Exypnos.',
  ProtocolRevenue: 'All collected integrator fees are retained by Exypnos.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  adapter: chainConfig,
  methodology,
}

export default adapter;
