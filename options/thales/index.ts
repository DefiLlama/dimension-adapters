/**
 * Overtime Options Adapter
 *
 * Volume: Tracked from various market creation and trading events
 */

import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { OVERTIME_CONTRACT_ADDRESSES } from './config';
import { OVERTIME_EVENT_ABI } from './abis';
import {
  parseTicketCreatedEvent,
  parseBoughtFromAmmEvent,
  parseSpeedMarketCreatedEvent,
  parseChainedMarketCreatedEvent
} from './parsers';
import { CHAIN } from "../../helpers/chains";

const CONTRACT_EVENT_MAPPING = {
  sportsAMMV2: { abi: 'ticketCreated', parser: parseTicketCreatedEvent },
  thalesAMM: { abi: 'boughtFromAmm', parser: parseBoughtFromAmmEvent },
  rangedAMM: { abi: 'boughtFromAmm', parser: parseBoughtFromAmmEvent },
  speedMarket: { abi: 'speedMarketCreated', parser: parseSpeedMarketCreatedEvent },
  chainedSpeedMarket: { abi: 'chainedMarketCreated', parser: parseChainedMarketCreatedEvent },
} as const;

function getChainContractsToQuery(
  chain: string,
  dailyNotionalVolume: ReturnType<FetchOptions['createBalances']>,
  dailyPremiumVolume: ReturnType<FetchOptions['createBalances']>
) {
  const contracts = OVERTIME_CONTRACT_ADDRESSES[chain];
  if (!contracts) throw new Error(`No contracts found for chain: ${chain}`);

  return Object.entries(contracts)
    .filter(([, address]) => address)
    .map(([contractType, address]) => {
      const config = CONTRACT_EVENT_MAPPING[contractType as keyof typeof CONTRACT_EVENT_MAPPING];
      const abiKey = config.abi as keyof typeof OVERTIME_EVENT_ABI;
      return {
        address: address as string,
        eventAbi: OVERTIME_EVENT_ABI[abiKey] as string,
        parser: (log: any) => config.parser(log, dailyNotionalVolume, dailyPremiumVolume)
      };
    });
}

export async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  await Promise.all([
    // Volume events from AMM contracts
    ...getChainContractsToQuery(options.chain, dailyNotionalVolume, dailyPremiumVolume)
      .map(async ({ address, eventAbi, parser }) => {
        const logs = await options.getLogs({ target: address, eventAbi, onlyArgs: true });
        logs.forEach(parser);
      })
  ]);

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
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
    [CHAIN.POLYGON]: {
      fetch,
      start: '2025-04-01',
    },
  },
};

export default adapter;
