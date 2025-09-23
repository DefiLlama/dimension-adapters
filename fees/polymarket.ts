import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

// Polymarket has implemented trading fees in their exchange contracts
// but they are disabled for now
// https://github.com/Polymarket/ctf-exchange/blob/main/docs/Overview.md#fees

const CTFExchange = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'
const NegRiskCTFExchange = '0xC5d563A36AE78145C45a50134d48A1215220f80a'

const FeeCharged = 'event FeeCharged(address indexed receiver, uint256 tokenId, uint256 amount)';

const fetch =  async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()

  const events = await options.getLogs({
    targets: [CTFExchange, NegRiskCTFExchange],
    eventAbi: FeeCharged,
    flatten: true,
  })
  for (const event of events) {
    dailyFees.addCGToken('usd-coin', Number(event.amount) / 1e6)
  }
 
  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay fees when buy/sell binary options on Polymarket markets. But fees was disabled by Polymarket for now.',
    SupplySideRevenue: 'Fees were charged on trades distributed to buyer/seller to maintain markets integrity.',
    Revenue: 'No revenue.',
  },
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: '2022-09-26',
    }
  },
}

export default adapter
