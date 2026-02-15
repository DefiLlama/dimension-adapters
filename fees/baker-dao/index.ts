import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { nullAddress } from '../../helpers/token';
import { METRIC } from '../../helpers/metrics';

const BREAD_CONTRACT_ADDRESS = "0x0003eEDFdd020bf60D10cf684ABAc7C4534B7eAd";

const fetch = async (options: FetchOptions) => {
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
            dailyFees.add(nullAddress, log.amount, METRIC.PROTOCOL_FEES)
          });

  return {
    dailyFees,
  }
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: 'Fees collected by the protocol treasury from BREAD contract operations',
  }
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch,
      start: '2025-03-17',
    }
  },
  methodology: {
    Fees: "All fees are captured by monitoring SendBera events to breadTreasury",
  },
  breakdownMethodology,
};

export default adapter;
