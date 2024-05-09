import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const contract = '0xBa5e05cb26b78eDa3A2f8e3b3814726305dcAc83'
const eventAbi = 'event ArtistsEarned(uint256 indexed day,uint256 amount)';
const protocol_fees = 10; // 10% fees

const ethAddress = ADDRESSES.null;

const fetch: any = async (timestamp: number, _: any, { getLogs, createBalances, }: FetchOptions): Promise<FetchResultFees> => {
  const logs = await getLogs({ target: contract, eventAbi })
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const amounts = logs.map((e: any) => e.amount)
  dailyFees.add(ethAddress, amounts)
  dailyFees.resizeBy(1 / 0.9) // 90% of the fees go to the artists
  dailyRevenue.addBalances(dailyFees)
  dailyRevenue.resizeBy(protocol_fees / 100) // 10% of the fees go to the protocol

  return { dailyFees, dailyRevenue, timestamp }
}

const adapterFees: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: 1691625600,
    }
  }
}

export default adapterFees;
