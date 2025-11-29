import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { oreHelperCountSolBalanceDiff } from '../ore'

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
   const dailyFees = await oreHelperCountSolBalanceDiff(
      options,
      'D8gNjpxyi8BPkotidwoakUurhjnYhJghNRb2kuv8Lbeb'
   )

   const dailyProtocolRevenue = dailyFees.clone(0.01)
   const dailyHoldersRevenue = dailyFees.clone(0.99)

   return {
      dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: dailyProtocolRevenue,
      dailyHoldersRevenue: dailyHoldersRevenue
   }
}

const adapter: SimpleAdapter = {
   version: 1,
   fetch,
   chains: [CHAIN.SOLANA],
   start: '2025-11-30',
   dependencies: [Dependencies.DUNE],
   methodology: {
      Fees: 'Calculate the LODE tokens gathered from 10% of the total SOL allocated to LODE boards and sent to the protocol wallet D8gNjpxyi8BPkotidwoakUurhjnYhJghNRb2kuv8Lbeb.',
      Revenue: 'All collected LODE fees count as revenue.',
      ProtocolRevenue: '1% of all LODE revenue is allocated to the protocol treasury.',
      HoldersRevenue:
         'The remaining 99% of LODE fees are used for LODE buybacks and burns, with value distributed to LODE stakers.'
   }
}

export default adapter
