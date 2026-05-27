import { CHAIN } from '../helpers/chains';
import { Adapter, FetchOptions, FetchResultV2 } from '../adapters/types';

const METRICS = {
  BorrowInterest: 'Borrow Interest',
  BorrowInterestToLenders: 'Borrow Interest To Lenders',
  BorrowInterestToProtocol: 'Borrow Interest To Protocol',
  FlashloanFees: 'Flashloan Fees',
  FlashloanFeesToLenders: 'Flashloan Fees To Lenders',
}

const configs: any = {
  [CHAIN.MONAD]: {
    start: '2025-11-26',
    centralRegistry: '0x1310f352f1389969Ece6741671c4B919523912fF',
  }
}

const abis = {
  asset: 'address:asset',
  marketManagers: 'address[]:marketManagers',
  queryTokensListed: 'address[]:queryTokensListed',
  DebtAccruedEvent: 'event DebtAccrued(uint256 newDebtAssets, uint256 protocolFeeAssets)',
  FlashloanEvent: 'event Flashloan(uint256 assets, uint256 assetsFee, address account)',
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const managers = await options.api.call({ abi: abis.marketManagers, target: configs[options.chain].centralRegistry });
  const markets = (await options.api.multiCall({ abi: abis.queryTokensListed, calls: managers })).flat();
  const assets = await options.api.multiCall({ abi: abis.asset, calls: markets });
  const logDebtAccruedEvents = await options.getLogs({ eventAbi: abis.DebtAccruedEvent, targets: markets, flatten: false });
  const logFlashloanEvents = await options.getLogs({ eventAbi: abis.FlashloanEvent, targets: markets, flatten: false });

  for (let i = 0; i < markets.length; i++) {
    const asset = assets[i];
    if (asset) {
      for (const logDebtAccruedEvent of logDebtAccruedEvents[i]) {
        dailyFees.add(asset, logDebtAccruedEvent.newDebtAssets, METRICS.BorrowInterest);
        dailyRevenue.add(asset, logDebtAccruedEvent.protocolFeeAssets, METRICS.BorrowInterestToProtocol);
        dailySupplySideRevenue.add(asset, Number(logDebtAccruedEvent.newDebtAssets) - Number(logDebtAccruedEvent.protocolFeeAssets), METRICS.BorrowInterestToLenders);
      }

      for (const logFlashloanEvent of logFlashloanEvents[i]) {
        dailyFees.add(asset, logFlashloanEvent.assetsFee, METRICS.FlashloanFees);
        dailySupplySideRevenue.add(asset, logFlashloanEvent.assetsFee, METRICS.FlashloanFeesToLenders);
      }
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: configs,
  methodology: {
    Fees: "Includes interest and flashloan fees paid by borrowers.",
    Revenue: "Share of interest which collected by Curvance protocol.",
    ProtocolRevenue: "Share of interest which collected by Curvance protocol.",
    SupplySideRevenue: "Fees distributed to lenders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.BorrowInterest]: 'All borrow interest paid by borrowers.',
      [METRICS.FlashloanFees]: 'Flashloan fees paid by borrowers.',
    },
    Revenue: {
      [METRICS.BorrowInterestToProtocol]: 'Share of borrow interest to Curvance protocol.',
    },
    SupplySideRevenue: {
      [METRICS.BorrowInterestToLenders]: 'Share of borrow interest to lenders.',
      [METRICS.FlashloanFees]: 'Share of flashloan fees to lenders.',
    },
  }
}

export default adapter;
