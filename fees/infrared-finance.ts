import { Adapter, FetchV2, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

export default {
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: (async ({ getLogs, createBalances, }) => {
        const dailyFees = createBalances()
        const dailyRevenue = createBalances()
        
        // Scrape for ProtocolFees event from the contract
        const logs = await getLogs({
            target: "0xb71b3DaEA39012Fb0f2B14D2a9C86da9292fC126",
            eventAbi: 'event ProtocolFees(address indexed _token, uint256 _amt, uint256 _voterAmt)'
        })
        
        // Process each event log
        logs.map((e: any) => {
            // _amt represents total protocol fees
            dailyFees.add(e._token, e._amt)
            
            // Protocol revenue is the difference between total fees and voter portion
            const protocolRevenue = BigInt(e._amt) - BigInt(e._voterAmt)
            dailyRevenue.add(e._token, protocolRevenue)
        })
        
        return { dailyFees, dailyRevenue, }
      }) as FetchV2,
      start: '2025-02-02', // Using the same fromBlock as in the TVL indexer
    },
  },
  version: 2,
} as Adapter
