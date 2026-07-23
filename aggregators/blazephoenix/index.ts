import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Evento Swap emitido pelo Router do BlazePhoenix
const event_swap = 'event Swap(address indexed sender, address indexed recipient, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 surplus)';

// Endereços dos Routers por rede (extraídos do teu manifesto)
const ROUTERS: Record<string, string> = {
  [CHAIN.BASE]: "0x2a779f9Be49aac57495A8B6467Cc325a8a47Eb9f",
  [CHAIN.ETHEREUM]: "0xE1aE5f49013920CF71De8CED4043e14C4d63416b",
  [CHAIN.OPTIMISM]: "0x7262e7483ab6f0db7b8f90eC3a9de3B02Ab36F6A",
  [CHAIN.ARBITRUM]: "0x7262e7483ab6f0db7b8f90eC3a9de3B02Ab36F6A",
  [CHAIN.ROBINHOOD]: "0x7262e7483ab6f0db7b8f90eC3a9de3B02Ab36F6A",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const targetRouter = ROUTERS[options.chain];

  if (!targetRouter) return { dailyVolume };

  // Procura todos os logs de Swap no Router da rede correspondente
  const logs = await options.getLogs({
    target: targetRouter,
    eventAbi: event_swap,
  });

  logs.forEach((log: any) => {
    dailyVolume.add(log.tokenOut, log.amountOut);
  });

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: { fetch, start: '2026-07-01' },
    [CHAIN.ETHEREUM]: { fetch, start: '2026-07-01' },
    [CHAIN.OPTIMISM]: { fetch, start: '2026-07-01' },
    [CHAIN.ARBITRUM]: { fetch, start: '2026-07-01' },
    [CHAIN.ROBINHOOD]: { fetch, start: '2026-07-01' },
  },
};

export default adapter;

