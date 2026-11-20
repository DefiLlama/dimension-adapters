import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { FeeAccounting, HOLDERS, RETAINED, SOURCES } from './common';
import { fetchHolderRevenue } from './holders';
import { fetchLegacyFees } from './legacy';
import { fetchPoolFees } from './pools';
import { fetchTokenizerFees } from './tokenizer';

// Hookr lets pool creators add Hook Blocks (custom rules) to Uniswap v4 pools on Robinhood Chain.
// Every amount is read from on-chain events or contract state and returned in raw token units.
const fetch = async (options: FetchOptions) => {
  const accounting = new FeeAccounting(options, await options.getFromBlock(), await options.getToBlock());
  await fetchPoolFees(accounting);
  await fetchTokenizerFees(accounting);
  await fetchLegacyFees(accounting);
  await fetchHolderRevenue(accounting);
  return accounting.balances;
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
      "Hookr's share of the fees minus what is set aside for HOOKR burns (the burn jar and the earlier flywheel). " +
      'Negative on days when fees earned earlier are moved to the burn jar.',
    HoldersRevenue:
      'Value spent to burn HOOKR: fee assets the burn jar hands out for burned HOOKR, ETH spent by the earlier ' +
      'flywheel and by OpenZaps campaigns to buy and burn HOOKR, and fees taken in HOOKR and burned.',
  },
  breakdownMethodology: {
    Fees: sourceLabels('fees'),
    Revenue: sourceLabels('revenue'),
    SupplySideRevenue: sourceLabels('supplySide'),
    ProtocolRevenue: {
      [RETAINED]:
        "Hookr's share of the fees, minus fee assets moved to the burn jar and flywheel charges sent to the HOOKR " +
        'buy-and-burn contract.',
    },
    HoldersRevenue: {
      [HOLDERS.jar]: 'Fee assets the burn jar hands out to whoever burns the required HOOKR.',
      [HOLDERS.legacy]: 'ETH the earlier flywheel contract spent buying HOOKR to burn.',
      [HOLDERS.openzaps]:
        'ETH OpenZaps campaigns spent buying HOOKR that they burned in the same transaction. Paid by OpenZaps, not ' +
        'by Hookr fees.',
      [HOLDERS.direct]: 'Fees taken in HOOKR in HOOKR pools and burned.',
    },
  },
};

export default adapter;
