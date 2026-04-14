import ADDRESSES from '../helpers/coreAssets.json'
import { Chain } from "../adapters/types";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from '../helpers/token';

const event_funds_supply = 'event SupplyFund(uint256 amount)';
type TAddress = {
  [s: string]: string;
}
const address_buyback: TAddress = {
  [CHAIN.ARBITRUM]: '0x5f0feef4dafea7fb4d6ca89c047767885226b5f9'
}

const fetch = (chain: Chain) => {
  return async (options: FetchOptions) => {
    const dividends = await addTokensReceived({ tokens: [ADDRESSES.arbitrum.WETH], options, fromAddressFilter: '0xd70811f1e4992aa051d54e29a04c8925b32fba7d', target: '0x535ec56479892d9c02fe2bb86cebf7ed62e81131' })

    const logs_fund_disposit = (await options.getLogs({
      target: address_buyback[chain],
      eventAbi: event_funds_supply,
    }))

    const dailyRevenue = options.createBalances()
    logs_fund_disposit.forEach((log) => dailyRevenue.addGasToken(log.amount))
    const dailyFees = dividends.clone()
    dailyFees.addBalances(dailyRevenue)

    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue: dailyRevenue,
      dailySupplySideRevenue: dividends,
    }
  }
}

const methodology = {
  Fees: "total protocol revenue collected from univ3 engine and gmusd.",
  Revenue: "Revenue allocated for buyback.",
  SupplySideRevenue: "Revenue allocated for dividends.",
  HoldersRevenue: "Revenue allocated for buyback."
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: '2023-04-14',
    },
  },
  methodology,
}

export default adapter;
