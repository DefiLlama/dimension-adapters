import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Evento Swap emitido pelo Router do BlazePhoenix
const event_swap = 'event Swap(address indexed sender, address indexed recipient, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 surplus)';

// Endereço do Router do BlazePhoenix na Base
const ROUTER_BASE = "0x...COLOCA_AQUI_O_ENDERECO_DO_ROUTER_NA_BASE...";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  
  // Procura todos os logs de Swap ocorridos no bloco/janela do dia
  const logs = await options.getLogs({
    target: ROUTER_BASE,
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
    [CHAIN.BASE]: {
      fetch,
      start: '2026-07-01',
    },
  },
};

export default adapter;

