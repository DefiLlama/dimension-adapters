import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const token = '0x35e78b3982E87ecfD5b3f3265B601c046cDBe232'
const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const logs = await options.getLogs({
    target: token,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      '0x000000000000000000000000cdd37ada79f589c15bd4f8fd2083dc88e34a2af2',
      '0x0000000000000000000000003808708e761b988d23ae011ed0e12674fb66bd62'
    ]
  })
  logs.forEach(log => {
    dailyFees.add(token, Number(log.data))
  })
  const holderRevenue = dailyFees.clone()
  dailyFees.resizeBy(4)
  const protocolRevenue = dailyFees.clone()
  protocolRevenue.subtract(holderRevenue)

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: protocolRevenue, dailyHoldersRevenue: holderRevenue }
}
const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
    }
  },
  methodology: {
    Fees: 'All fees paid by users for exchange tokens.',
    Revenue: 'All fees paid by users.',
    ProtocolRevenue: '75% fees are distributed to SideShift.',
    HoldersRevenue: '25% fees are distributed to XAI token holders.',
  }
}
export default adapters
