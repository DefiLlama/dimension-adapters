import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { nullAddress } from '../../helpers/token';

const EGGS_ADDRESS = '0xf26ff70573ddc8a90bd7865af8d7d70b8ff019bc';

const adapter: Adapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch: async (options: FetchOptions) => {
        const dailyFees = options.createBalances()
        const dailyRevenue = options.createBalances()

        const logs = await options.getLogs({
          target: EGGS_ADDRESS,
          eventAbi: 'event SendSonic(address to, uint256 amount)'
        });

        // call to EGGS_ADDRESS to get current FEE_ADDRESS (since it can change)
        const feeAddress = await options.api.call({
            target: EGGS_ADDRESS,
            abi: 'function FEE_ADDRESS() view returns (address)'
        });

        logs
          .filter(log => log.to.toLowerCase() === feeAddress.toLowerCase())
          .forEach(log => {
            // Direct sum for protocol revenue (30% share)
            dailyRevenue.add(nullAddress, log.amount)
            // Total fees = amount * 10/3 (since FEE_ADDRESS gets 30%)
            dailyFees.add(nullAddress, (log.amount * 10n) / 3n)
          });

        return {
          dailyFees,
          dailyRevenue
        }
      },
      start: '2025-02-14', 
      meta: {
        methodology: {
          Fees: "All fees (redeeming / selling using contract for 2.5% fees, flash loan 1%, loan interest, instant default 1%, etc) are captured by monitoring SendSonic events to FEE_ADDRESS",
          Revenue: "Protocol revenue is 30% of total fees sent directly to FEE_ADDRESS"
        }
      }
    }
  },
  version: 2
};

export default adapter;
