import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import CoreAssets from "../helpers/coreAssets.json";

const MorphoCredit = '0xde6e08ac208088cc62812ba30608d852c6b0ecbc'
const PaymentToken = CoreAssets.ethereum.USDC

const AccrueInterestEvent = 'event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)'
const PremiumAccruedEvent = 'event PremiumAccrued(bytes32 indexed id, address indexed borrower, uint256 premiumAmount, uint256 feeAmount)'

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const AccrueInterestEvents = await options.getLogs({
    target: MorphoCredit,
    eventAbi: AccrueInterestEvent,
  })
  const PremiumAccruedEvents = await options.getLogs({
    target: MorphoCredit,
    eventAbi: PremiumAccruedEvent,
  })

  for (const event of AccrueInterestEvents) {
    dailyFees.add(PaymentToken, event.interest, METRIC.BORROW_INTEREST);
    dailySupplySideRevenue.add(PaymentToken, event.interest, METRIC.BORROW_INTEREST);
  }
  for (const event of PremiumAccruedEvents) {
    dailyFees.add(PaymentToken, event.premiumAmount, 'Borrow Premium');
    dailyFees.add(PaymentToken, event.feeAmount, 'Borrow Premium');
    dailySupplySideRevenue.add(PaymentToken, event.premiumAmount, 'Borrow Premium');
    dailyRevenue.add(PaymentToken, event.feeAmount, 'Borrow Premium');
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const info = {
  methodology: {
    Fees: "Total borrow interest + premium paid by borrowers.",
    SupplySideRevenue: "Total interests + premium are distributed to suppliers/lenders.",
    Revenue: "Borrow premium fees share for 3Jane protocol.",
    ProtocolRevenue: "Borrow premium fees share for 3Jane protocol.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers.',
      'Borrow Premium': 'All borrow premium paid by borrowers.',
    },
    Revenue: {
      'Borrow Premium': 'Amount of borrow premium shares for 3Jane protocol.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'All interests paid are distributedd to suppliers, lenders.',
      'Borrow Premium': 'All borrow premium distributedd to vaults suppliers, lenders.',
    },
    ProtocolRevenue: {
      'Borrow Premium': 'Amount of borrow premium shares for 3Jane protocol.',
    },
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: info.methodology,
  breakdownMethodology: info.breakdownMethodology,
  fetch: fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2025-08-26", 
};

export default adapter;
