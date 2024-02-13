import { ChainBlocks, Fetch, FetchOptions } from "../adapters/types";

import ADDRESSES from "./coreAssets.json";

const event_trade = 'event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)'

export function getFeesExport(FriendtechSharesAddress: string, eventAbis = [event_trade], {
  token = ADDRESSES.null,
}: { token?: string } = {})  {
  return (async (timestamp: number, _: ChainBlocks, { getLogs, createBalances, }: FetchOptions) => {
    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    for (const eventAbi of eventAbis) {
      const logs = await getLogs({ target: FriendtechSharesAddress, eventAbi })
      logs.map((e: any) => {
        if (e.protocolEthAmount) {
          dailyFees.add(token, e.protocolEthAmount)
          dailyRevenue.add(token, e.protocolEthAmount)
        }
        if (e.subjectEthAmount) dailyFees.add(token, e.subjectEthAmount)
        if (e.referrerEthAmount) dailyFees.add(token, e.referrerEthAmount)
        if (e.holderEthAmount) dailyFees.add(token, e.holderEthAmount)
      })
    }
    return { dailyFees, dailyRevenue, timestamp, }
  }) as Fetch
}