import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const contractAddress = '0xFC00FACE00000000000000000000000000000000';


async function getFees24Hr(api: any) {
  const currentEpoch = await api.call({ abi: 'uint256:currentSealedEpoch', target: contractAddress })
  const snapshotABI = 'function getEpochSnapshot(uint256 epoch) view returns (uint256 endTime, uint256 epochFee, uint256 totalBaseRewardWeight, uint256 totalTxRewardWeight, uint256 baseRewardPerSecond, uint256 totalStake, uint256 totalSupply)'

  // Calculate how many 4-hour epochs are in 24 hours (6 epochs)
  const epochsToFetch = 6;
  const epochs: any = [];

  // Create array of epoch numbers to fetch (current and previous 5)
  for (let i = 0; i < epochsToFetch; i++) epochs.push(+currentEpoch - i);
  const epochData = await api.multiCall({ abi: snapshotABI, calls: epochs, target: contractAddress })
  return epochData.reduce((acc: any, data: any) => acc + +data.epochFee, 0)
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ASSETCHAIN]: {
      fetch: async ({ api, createBalances }: FetchOptions) => {
        const feesInRwa = await getFees24Hr(api)
        const dailyFees = createBalances()
        dailyFees.addCGToken('xend-finance', feesInRwa/1e18, 'XEND token fees')
        const dailyRevenue = createBalances()
        dailyRevenue.addCGToken('xend-finance', feesInRwa/1e18, 'XEND token revenue')
        return { dailyFees, dailyRevenue }
      },
      start: '2020-08-29',
    },
  },
  protocolType: ProtocolType.CHAIN,
  breakdownMethodology: {
    Fees: {
      'XEND token fees': 'Epoch-based fees collected in XEND tokens over 24-hour period (6 epochs of 4 hours each)',
    },
    Revenue: {
      'XEND token revenue': 'Revenue generated from XEND token transaction fees',
    },
  }
}

export default adapter;
