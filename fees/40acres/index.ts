import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";

const feeCollector = ['0xfF16fd3D147220E6CC002a8e4a1f942ac41DBD23'];
const LOAN_ADDRESS: any = {
  [CHAIN.BASE]: ['0x87f18b377e625b62c708D5f6EA96EC193558EFD0'],
  [CHAIN.OPTIMISM]: ['0xf132bD888897254521D13e2c401e109caABa06A7'],
  [CHAIN.AVAX]: ['0x6Bf2Fe80D245b06f6900848ec52544FBdE6c8d2C',
    '0x5122f5154DF20E5F29df53E633cE1ac5b6623558'
  ]
};

const fetch = async (options: FetchOptions) => {
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    targets: LOAN_ADDRESS[options.chain],
    eventAbi: 'event RewardsReceived(uint256 epoch, uint256 amount, address borrower, uint256 tokenId)', 
  });

  logs.forEach(log => {
    const amount = log.amount / BigInt(10 ** 6)
    dailySupplySideRevenue.addUSDValue(amount, "Lender rewards")
  });

  const dailyRevenue = await addTokensReceived({
    fromAdddesses: LOAN_ADDRESS[options.chain],
    options,
    targets: feeCollector
  });

  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailyRevenue, METRIC.PROTOCOL_FEES);
  dailyFees.addBalances(dailySupplySideRevenue, "Lender rewards");

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: 'Includes 0.8% fee charged to open a line of credit, 5% of voting rewards that are directed to the protocol treasury and 1% fee on rewards and 20 % of voting rewards that are directed to lenders',
  Revenue: 'Amount of fees that go to 40acres treasury.',
  SupplySideRevenue: 'Amount of fees that go to lenders.',
  ProtocolRevenue: 'Amount of fees that go to 40acres treasury.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: '0.8% fee to open a line of credit plus 5% of voting rewards directed to protocol treasury',
    "Lender rewards": '1% fee on rewards plus 20% of voting rewards directed to lenders',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: '0.8% fee to open a line of credit plus 5% of voting rewards directed to protocol treasury',
  },
  SupplySideRevenue: {
    "Lender rewards": '1% fee on rewards plus 20% of voting rewards directed to lenders',
  },
}; 

export default {
  version: 2,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BASE]: {
      start: "2025-02-13",
    },
    [CHAIN.OPTIMISM]: {
      start: "2025-03-06",
    },
    [CHAIN.AVAX]: {
      start: "2025-07-02",
    }
  }
};
