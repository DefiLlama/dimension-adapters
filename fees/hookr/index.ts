import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { FeeAccounting, SOURCES, RETAINED, HOLDERS, FeeSource, toBigInt } from './common';
import { CONTRACT, NATIVE } from './config';
import { discoverPools } from './discovery';
import { fetchTradingFees, fetchAdditionalLpFees } from './trading';
import { fetchLegacyFees } from './legacy';
import { fetchTokenizerFees } from './tokenizer';
import { fetchHolderRevenue } from './holders';
import { fetchVaultFees } from './vault';

// Earn operating revenue first, then attribute its verified burn funding and actual holder payouts.
const fetch = async (options: FetchOptions) => {
  const accounting = new FeeAccounting(options, await options.getFromBlock(), await options.getToBlock());
  await fetchLegacyFees(accounting);
  const discovery = await discoverPools(accounting);
  await fetchTradingFees(accounting, discovery);
  await fetchAdditionalLpFees(accounting, new Map([...discovery.current, ...discovery.modular]));

  for (const [address, eventAbi] of [
    [CONTRACT.launcher, 'event LaunchFeePaid(bytes32 indexed familyId,address indexed target,uint256 fee)'],
    [CONTRACT.rootFactory, 'event DeployFeePaid(address indexed root,address indexed target,uint256 fee)'],
  ]) {
    for (const log of await accounting.getLogs([address], eventAbi)) {
      accounting.recordFees('launch', NATIVE, toBigInt(log.args.fee), toBigInt(log.args.fee));
    }
  }

  await fetchTokenizerFees(accounting);
  await fetchVaultFees(accounting);
  await fetchHolderRevenue(accounting);

  return accounting.balances;
};

/** Build each metric's breakdown from the labels that its fee sources actually emit. */
function sourceMethodology(destination: 'fees' | 'revenue' | 'supplySide') {
  return Object.fromEntries(
    Object.values(SOURCES).flatMap((source: FeeSource) =>
      source[destination] ? [[source[destination], source.description]] : [],
    ),
  );
}

const breakdownMethodology = {
  Fees: sourceMethodology('fees'),
  Revenue: sourceMethodology('revenue'),
  SupplySideRevenue: sourceMethodology('supplySide'),
  ProtocolRevenue: {
    [RETAINED]:
      'Earned Hookr income net of documented supplier obligations, dedicated legacy flywheel credits and ' +
      'fee-split payments into the burn jar; allocations can spend revenue earned in earlier periods. ' +
      'Unattributed voluntary wallet donations to buyback contracts are not reclassified as protocol spending.',
  },
  HoldersRevenue: {
    [HOLDERS.jar]:
      'Previously recorded fee-split assets exchanged when a jar redemption burns HOOKR; native and token input ' +
      'costs are replayed in event order, excluding unattributed donations and without counting jar funding ' +
      'again.',
    [HOLDERS.legacy]:
      'Actual ETH spent by the verified legacy flywheel burner to buy and retire HOOKR, including purchases ' +
      'funded by voluntary deposits.',
    [HOLDERS.openzaps]:
      'Actual ETH spent by the two reviewed OpenZaps campaigns, matched to HOOKR transfers to the dead address; ' +
      'this external income is excluded from Hookr operating fees and revenue.',
    [HOLDERS.direct]:
      'User fee amounts denominated in HOOKR and burned by the measured current, modular or legacy pool fee ' +
      'mechanism; excludes voluntary inventory transfers.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-08-04', // First verified legacy launchpad fee, block 27767017.
  pullHourly: true,
  doublecounted: true, // Underlying Uniswap v4 fees and WTH recaptures are also tracked in their own listings.
  allowNegativeValue: true, // Retained protocol income can be negative when older earned fees are allocated to the burn jar.
  methodology: {
    Fees:
      'Hookr launch, trading, additional LP, tax, tokenizer and arbitrage fees on Robinhood, including supplier ' +
      'shares and booked legacy LP fees; excludes modern pools’ ordinary Uniswap base fees and external OpenZaps ' +
      'buybacks.',
    Revenue:
      'Hookr’s retained share of launch, trading, tax, tokenizer and recaptured-arbitrage fees after creator, ' +
      'LP, trader, advisory, integrator and execution-partner allocations; excludes external OpenZaps income.',
    SupplySideRevenue:
      'Included Hookr fees allocated to creators, LPs, traders, advisories, integrators, subject-token burns and ' +
      'execution partners, including additional fees retained inside Uniswap.',
    ProtocolRevenue:
      'Earned Hookr fee income after supplier obligations and verified allocations to dedicated burn mechanisms, ' +
      'measured at allocation rather than burn; excludes unproven voluntary-wallet funding reclassifications.',
    HoldersRevenue:
      'Fee assets exchanged when jar redemptions burn HOOKR, actual legacy and OpenZaps-funded market buybacks, ' +
      'and user fees burned directly in HOOKR; excludes arbitrary inventory burns and burns of other launched ' +
      'tokens.',
  },
  breakdownMethodology,
};

export default adapter;
