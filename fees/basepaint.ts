import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from '../helpers/metrics';

const contract = '0xBa5e05cb26b78eDa3A2f8e3b3814726305dcAc83'
const eventAbi = 'event ArtistsEarned(uint256 indexed day,uint256 amount)';
const protocol_fees = 10; // 10% fees

const ethAddress = ADDRESSES.null;

const fetch: any = async ({ getLogs, createBalances, }: FetchOptions) => {
  const logs = await getLogs({ target: contract, eventAbi })
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const amounts = logs.map((e: any) => e.amount)

  // ArtistsEarned event tracks 90% that goes to artists
  const artistEarnings = createBalances()
  artistEarnings.add(ethAddress, amounts)

  // Calculate total fees (100%) from the 90% artist amount
  const totalFeeAmount = createBalances()
  totalFeeAmount.addBalances(artistEarnings)
  totalFeeAmount.resizeBy(1 / 0.9)

  // Split into categories with labels
  dailySupplySideRevenue.addBalances(artistEarnings, METRIC.CREATOR_FEES)

  const protocolAmount = totalFeeAmount.clone()
  protocolAmount.resizeBy(protocol_fees / 100)
  dailyRevenue.addBalances(protocolAmount, METRIC.PROTOCOL_FEES)

  dailyFees.addBalances(totalFeeAmount, "User payments")

  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const adapterFees: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: '2023-08-10',
  methodology: {
    Fees: 'Fees paid by users for using BasePaint services.',
    Revenue: 'Fees portion collected by BasePaint.',
  },
  breakdownMethodology: {
    Fees: {
      "User payments": 'Total fees paid by users for creating and interacting with collaborative artwork on BasePaint',
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: 'Protocol revenue retained by BasePaint, equal to 10% of total fees',
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: 'Fees distributed to artists who contribute to the collaborative artwork, equal to 90% of total fees',
    },
  }
}

export default adapterFees;
