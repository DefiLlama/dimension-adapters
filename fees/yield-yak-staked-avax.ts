import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types"
import { CHAIN } from "../helpers/chains";

const address = '0x185214FD3696942FBf29Af2983AA7493112777Ae';
const event_distribution = 'event Distribution(uint256 indexed epoch,address indexed by,uint256 amount)';
const event_paid = 'event Paid(uint256 indexed epoch,address indexed payee,uint256 amount)';
const yield_yak_master = '0x0cf605484a512d3f3435fed77ab5ddc0525daf5f';
const yak_gov = '0x5925c5c6843a8f67f7ef2b55db1f5491573c85eb';

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, }: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = createBalances()
  const dailyHoldersRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const logs_distribution = await getLogs({ target: address, eventAbi: event_distribution, })
  const logs_paid = await getLogs({ target: address, eventAbi: event_paid, })

  logs_distribution.map((e: any) => dailyFees.addGasToken(e.amount))

  logs_paid.map((e: any) => {
    const payee = e.payee.toLowerCase()
    if (payee === yield_yak_master)
      dailyHoldersRevenue.addGasToken(e.amount)
    else if (payee === yak_gov)
      dailyProtocolRevenue.addGasToken(e.amount)
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    timestamp
  }
}


const adapter: Adapter = {
  methodology: {
    Fees: "Yield and rewards are distributed.",
    Revenue: "Fees distributed to holders and protocol.",
    HoldersRevenue: "All revenue distributed to holders.",
    ProtocolRevenue: "All revenue collected by protocol.",
  },
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: '2021-11-14',
    },
  }
}

export default adapter;
