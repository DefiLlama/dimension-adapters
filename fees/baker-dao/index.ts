import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { nullAddress } from '../../helpers/token';

const BREAD_CONTRACT_ADDRESS = "0x0003eEDFdd020bf60D10cf684ABAc7C4534B7eAd";

const adapter: Adapter = {
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: async (options: FetchOptions) => {
        const dailyFees = options.createBalances()

        const logs = await options.getLogs({
          target: BREAD_CONTRACT_ADDRESS,
          eventAbi: 'event SendBera(address to, uint256 amount)'
        });

        const feeAddress = await options.api.call({
          target: BREAD_CONTRACT_ADDRESS,
          abi: 'function breadTreasury() view returns (address)'
        });

        logs
          .filter(log => log.to.toLowerCase() === feeAddress.toLowerCase())
          .forEach(log => {
            dailyFees.add(nullAddress, log.amount)
          });

        return {
          dailyFees,
        }
      },
      start: '2025-03-17',
    }
  },
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "All fees are captured by monitoring SendBera events to breadTreasury",
  }
};

export default adapter;
