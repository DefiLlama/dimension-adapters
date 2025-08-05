import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from '../../helpers/coreAssets.json'

const feeCollector = ['0xfF16fd3D147220E6CC002a8e4a1f942ac41DBD23'];
const ADDRESS = {
  [CHAIN.BASE]: '0x87f18b377e625b62c708D5f6EA96EC193558EFD0',
  [CHAIN.OPTIMISM]: '0xf132bD888897254521D13e2c401e109caABa06A7',
  [CHAIN.AVAX]: '0xf6a044c3b2a3373ef2909e2474f3229f23279b5f'
};

const fetch = async (options: FetchOptions) => {
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    eventAbi:
      'event RewardsReceived(uint256 epoch,uint256 amount,address borrower,uint256 tokenId)', target: ADDRESS[options.chain]
  });

  logs.forEach(log => {
    const amount = log.amount / BigInt(10 ** 6)
    dailySupplySideRevenue.addUSDValue(amount)
  });

  const dailyRevenue = await addTokensReceived({
    options,
    tokens: [ADDRESSES[options.chain].USDC],
    targets: feeCollector
  });

  const dailyFees = options.createBalances();
  dailyFees.add(dailyRevenue);
  dailyFees.add(dailySupplySideRevenue);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const meta = {
  methodology: {
    Fees: 'Includes 0.8% fee charged to open a line of credit, 5% of voting rewards that are directed to the protocol treasury and 1% fee on rewards and 20 % of voting rewards that are directed to lenders',
    Revenue: 'Amount of fees that go to 40acres treasury.',
    SupplySideRevenue: 'Amount of fees that go to lenders.',
    ProtocolRevenue: 'Amount of fees that go to 40acres treasury.',
  }
};

export default {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2025-02-13",
      meta
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2025-03-06",
      meta
    },
    [CHAIN.AVAX]: {
      fetch,
      start: "2025-07-02",
      meta
    }
  }
};