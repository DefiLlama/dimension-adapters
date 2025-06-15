import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { addTokensReceived } from '../../helpers/token';
import { OVERTIME_CHAIN_CONFIG, OVERTIME_CONTRACT_ADDRESSES } from './config';
import { OVERTIME_EVENT_ABI } from './abis';
import { 
  parseTicketCreatedEvent, 
  parseBoughtFromAmmEvent, 
  parseSpeedMarketCreatedEvent, 
  parseChainedMarketCreatedEvent 
} from './parsers';
import { CHAIN } from "../../helpers/chains";

function getChainContractsToQuery(
  chain: string, 
  dailyNotionalVolume: ReturnType<FetchOptions['createBalances']>,
  dailyPremiumVolume: ReturnType<FetchOptions['createBalances']>
) {
  switch(chain) {
    case CHAIN.OPTIMISM: {
      const { sportsAMMV2, thalesAMM, rangedAMM, speedMarket, chainedSpeedMarket } 
        = OVERTIME_CONTRACT_ADDRESSES[CHAIN.OPTIMISM];
      return [
        {
          address: sportsAMMV2,
          eventAbi: OVERTIME_EVENT_ABI.ticketCreated,
          parser: (log: any) => parseTicketCreatedEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        },
        {
          address: thalesAMM,
          eventAbi: OVERTIME_EVENT_ABI.boughtFromAmm,
          parser: (log: any) => parseBoughtFromAmmEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        },
        {
          address: rangedAMM,
          eventAbi: OVERTIME_EVENT_ABI.boughtFromAmm,
          parser: (log: any) => parseBoughtFromAmmEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        },
        {
          address: speedMarket,
          eventAbi: OVERTIME_EVENT_ABI.speedMarketCreated,
          parser: (log: any) => parseSpeedMarketCreatedEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        },
        {
          address: chainedSpeedMarket,
          eventAbi: OVERTIME_EVENT_ABI.chainedMarketCreated,
          parser: (log: any) => parseChainedMarketCreatedEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        }
      ];
    }
    case CHAIN.ARBITRUM: {
      const { sportsAMMV2, thalesAMM, rangedAMM, speedMarket, chainedSpeedMarket } 
        = OVERTIME_CONTRACT_ADDRESSES[CHAIN.ARBITRUM];
      return [
        {
          address: sportsAMMV2,
          eventAbi: OVERTIME_EVENT_ABI.ticketCreated,
          parser: (log: any) => parseTicketCreatedEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        },
        {
          address: thalesAMM,
          eventAbi: OVERTIME_EVENT_ABI.boughtFromAmm,
          parser: (log: any) => parseBoughtFromAmmEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        },
        {
          address: rangedAMM,
          eventAbi: OVERTIME_EVENT_ABI.boughtFromAmm,
          parser: (log: any) => parseBoughtFromAmmEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        },
        {
          address: speedMarket,
          eventAbi: OVERTIME_EVENT_ABI.speedMarketCreated,
          parser: (log: any) => parseSpeedMarketCreatedEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        },
        {
          address: chainedSpeedMarket,
          eventAbi: OVERTIME_EVENT_ABI.chainedMarketCreated,
          parser: (log: any) => parseChainedMarketCreatedEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        }
      ];
    }
    case CHAIN.BASE: {
      const { sportsAMMV2, speedMarket, chainedSpeedMarket } = OVERTIME_CONTRACT_ADDRESSES[CHAIN.BASE];
      return [
        {
          address: sportsAMMV2,
          eventAbi: OVERTIME_EVENT_ABI.ticketCreated,
          parser: (log: any) => parseTicketCreatedEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        },
        {
          address: speedMarket,
          eventAbi: OVERTIME_EVENT_ABI.speedMarketCreated,
          parser: (log: any) => parseSpeedMarketCreatedEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        },
        {
          address: chainedSpeedMarket,
          eventAbi: OVERTIME_EVENT_ABI.chainedMarketCreated,
          parser: (log: any) => parseChainedMarketCreatedEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        }
      ];
    }
    case CHAIN.POLYGON: {
      const { speedMarket, chainedSpeedMarket } = OVERTIME_CONTRACT_ADDRESSES[CHAIN.POLYGON];
      return [
        {
          address: speedMarket,
          eventAbi: OVERTIME_EVENT_ABI.speedMarketCreated,
          parser: (log: any) => parseSpeedMarketCreatedEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        },
        {
          address: chainedSpeedMarket,
          eventAbi: OVERTIME_EVENT_ABI.chainedMarketCreated,
          parser: (log: any) => parseChainedMarketCreatedEvent(log, dailyNotionalVolume, dailyPremiumVolume)
        }
      ];
    }
    default:
      throw new Error("No contracts found for this chain");
  }
}

export async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const contractConfigs = getChainContractsToQuery(options.chain, dailyNotionalVolume, dailyPremiumVolume);
  
  await Promise.all(
    contractConfigs.map(async (cfg) => {
      const logs = await options.getLogs({
        target: cfg.address,
        eventAbi: cfg.eventAbi,
        onlyArgs: true,
      });
      logs.forEach(log => cfg.parser(log));
    })
  );
  
  const dailyRevenue = await addTokensReceived({ ...OVERTIME_CHAIN_CONFIG[options.chain], options });
  
  return {
    timestamp: options.startOfDay,
    dailyNotionalVolume,
    dailyPremiumVolume,
    dailyRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2025-04-01',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2025-04-01',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2025-04-01',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2025-04-01',
    },
  },
};

export default adapter;
