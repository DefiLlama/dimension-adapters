import { ChainBlocks, Fetch, FetchOptions } from "../adapters/types";

const event_trade = 'event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)'

export function getFeesExport(FriendtechSharesAddress: string) {
  return (async (timestamp: number, _: ChainBlocks, { getLogs, createBalances, }: FetchOptions) => {
    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    const logs = (await getLogs({
      target: FriendtechSharesAddress,
      eventAbi: event_trade
    }))
  
    logs.map((e) => {
      dailyFees.addGasToken(e.protocolEthAmount)
      dailyFees.addGasToken(e.subjectEthAmount)
      dailyRevenue.addGasToken(e.protocolEthAmount)
    })
    return { dailyFees, dailyRevenue,  timestamp, }
  }) as Fetch
}