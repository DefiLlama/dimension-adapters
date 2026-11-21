import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { Context, HOLDERS, RETAINED, SOURCES } from './common';
import { fetchLegacyFees } from './legacy';
import { fetchPoolFees } from './pools';
import { fetchTokenizerFees } from './tokenizer';

// Hookr lets pool creators add Hook Blocks (custom rules) to Uniswap v4 pools on Robinhood Chain.
// Every amount is read from on-chain events or contract state and returned in raw token units.
const fetch = async (options: FetchOptions) => {
  const ctx: Context = {
    options,
    fromBlock: await options.getFromBlock(),
    toBlock: await options.getToBlock(),
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
    dailyHoldersRevenue: options.createBalances(),
  };
  await fetchPoolFees(ctx);
  await fetchTokenizerFees(ctx);
  await fetchLegacyFees(ctx);
  const { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue } = ctx;
  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const sourceLabels = (destination: 'fees' | 'revenue' | 'supplySide') =>
  Object.fromEntries(
    Object.values(SOURCES).flatMap(source => (destination in source ? [[(source as any)[destination], source.description]] : [])),
  );

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-08-04', // first legacy launchpad fee, block 27767017
  pullHourly: true,
  doublecounted: true, // Hookr pools are Uniswap v4 pools, and recaptured arbitrage is also in fees/what-the-hook.ts
  allowNegativeValue: true, // protocol revenue is negative on days when fees earned earlier are moved to the burn jar
  methodology: {
    Fees:
      'Fees charged by Hookr on Robinhood Chain: Hook Block swap charges, token taxes, recaptured arbitrage, revenue ' +
      'token fees, launch fees, liquidity vault fees and fees of the earlier Hookr launchpads. Excludes Uniswap LP ' +
      'fees, including the extra LP fees some Hook Blocks set (tracked under Uniswap v4), and the share of arbitrage ' +
      'that What The Hook keeps.',
    Revenue:
      "Hookr's share of the fees, after pool creators, integrators, advisory contracts, traders, LPs and partners are paid.",
    SupplySideRevenue:
      'The part of the fees paid to pool creators, integrators, advisory contracts, traders, LPs and partners, or ' +
      "burned in a pool's own token.",
    ProtocolRevenue:
      "Hookr's share of the fees minus the part allocated to HOOKR burns. Can be negative on a day the burn jar " +
      'claims fees earned earlier.',
    HoldersRevenue:
      "Hookr's fee income allocated to burning HOOKR, counted when it is allocated: half of the treasury's income " +
      'since 2026-10-31 (claimed by the burn jar), the earlier flywheel charge, and fees taken in HOOKR and burned. ' +
      'Excludes HOOKR buy-and-burns paid for by other projects.',
  },
  breakdownMethodology: {
    Fees: sourceLabels('fees'),
    Revenue: sourceLabels('revenue'),
    SupplySideRevenue: sourceLabels('supplySide'),
    ProtocolRevenue: {
      [RETAINED]: "Hookr's share of the fees, minus the part allocated to HOOKR burns.",
    },
    HoldersRevenue: {
      [HOLDERS.jar]:
        "Half of the treasury's fee income, claimed by the burn jar, which hands it to whoever burns the required HOOKR.",
      [HOLDERS.flywheel]: 'Generation 5 swap charge credited to the HOOKR buy-and-burn contract.',
      [HOLDERS.direct]: 'Fees taken in HOOKR in HOOKR pools and burned.',
    },
  },
};

export default adapter;
