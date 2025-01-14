import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { addTokensReceived } from '../../helpers/token';
import { THALES_CHAIN_CONFIG, THALES_CONTRACT_ADDRESSES } from './config';
import { THALES_EVENT_ABI } from './abis';
import { 
  parseTicketCreatedEvent, 
  parseBoughtFromAmmEvent, 
  parseSpeedMarketCreatedEvent, 
  parseChainedMarketCreatedEvent 
} from './parsers';
import { CHAIN } from "../../helpers/chains";

function getChainContractsToQuery(chain: string, dailyVolume: ReturnType<FetchOptions['createBalances']>) {
  switch(chain) {
    case CHAIN.OPTIMISM: {
      const { sportsAMMV2, thalesAMM, rangedAMM, speedMarket, chainedSpeedMarket } 
        = THALES_CONTRACT_ADDRESSES[CHAIN.OPTIMISM];
      return [
        {
          address: sportsAMMV2,
          eventAbi: THALES_EVENT_ABI.ticketCreated,
          parser: (log: any) => parseTicketCreatedEvent(log, dailyVolume)
        },
        {
          address: thalesAMM,
          eventAbi: THALES_EVENT_ABI.boughtFromAmm,
          parser: (log: any) => parseBoughtFromAmmEvent(log, dailyVolume)
        },
        {
          address: rangedAMM,
          eventAbi: THALES_EVENT_ABI.boughtFromAmm,
          parser: (log: any) => parseBoughtFromAmmEvent(log, dailyVolume)
        },
        {
          address: speedMarket,
          eventAbi: THALES_EVENT_ABI.speedMarketCreated,
          parser: (log: any) => parseSpeedMarketCreatedEvent(log, dailyVolume)
        },
        {
          address: chainedSpeedMarket,
          eventAbi: THALES_EVENT_ABI.chainedMarketCreated,
          parser: (log: any) => parseChainedMarketCreatedEvent(log, dailyVolume)
        }
      ];
    }
    case CHAIN.ARBITRUM: {
      const { sportsAMMV2, thalesAMM, rangedAMM, speedMarket, chainedSpeedMarket } 
        = THALES_CONTRACT_ADDRESSES[CHAIN.ARBITRUM];
      return [
        {
          address: sportsAMMV2,
          eventAbi: THALES_EVENT_ABI.ticketCreated,
          parser: (log: any) => parseTicketCreatedEvent(log, dailyVolume)
        },
        {
          address: thalesAMM,
          eventAbi: THALES_EVENT_ABI.boughtFromAmm,
          parser: (log: any) => parseBoughtFromAmmEvent(log, dailyVolume)
        },
        {
          address: rangedAMM,
          eventAbi: THALES_EVENT_ABI.boughtFromAmm,
          parser: (log: any) => parseBoughtFromAmmEvent(log, dailyVolume)
        },
        {
          address: speedMarket,
          eventAbi: THALES_EVENT_ABI.speedMarketCreated,
          parser: (log: any) => parseSpeedMarketCreatedEvent(log, dailyVolume)
        },
        {
          address: chainedSpeedMarket,
          eventAbi: THALES_EVENT_ABI.chainedMarketCreated,
          parser: (log: any) => parseChainedMarketCreatedEvent(log, dailyVolume)
        }
      ];
    }
    case CHAIN.BASE: {
      const { speedMarket, chainedSpeedMarket } = THALES_CONTRACT_ADDRESSES[CHAIN.BASE];
      return [
        {
          address: speedMarket,
          eventAbi: THALES_EVENT_ABI.speedMarketCreated,
          parser: (log: any) => parseSpeedMarketCreatedEvent(log, dailyVolume)
        },
        {
          address: chainedSpeedMarket,
          eventAbi: THALES_EVENT_ABI.chainedMarketCreated,
          parser: (log: any) => parseChainedMarketCreatedEvent(log, dailyVolume)
        }
      ];
    }
    default:
      throw new Error("No contracts found for this chain");
  }
}

export async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances();
  const contractConfigs = getChainContractsToQuery(options.chain, dailyVolume);
  
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
  
  const dailyFees = await addTokensReceived({ ...THALES_CHAIN_CONFIG[options.chain], options});
  
  return {
    dailyVolume,
    dailyFees,
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-08-01',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2024-08-01',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2024-08-01',
    },
  },
};

export default adapter;
