import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const methodology = {
  Fees: "Swap fees from paid by users.",
  UserFees: "User pays fees on each swap.",
  Revenue: "Protocol have no revenue.",
  ProtocolRevenue: "Protocol have no revenue.",
  SupplySideRevenue: "All user fees are distributed among LPs.",
  HoldersRevenue: "Holders have no revenue."
}

const factories: { [key: string]: string } = {
  [CHAIN.ERA]: '0x9d63d318143cf14ff05f8aaa7491904a494e6f13',
  [CHAIN.LINEA]: '0xc5916f6cf441c72daa2e2c48afc7ce642eee6690',
  [CHAIN.SOPHON]: '0x0f6e27007e257e74c86522387bd071d561ba3c97',
}

const feeConfigs = {
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0,
  isAlgebraV3: true,
  poolCreatedEvent: 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)',
}

async function fetch(options: FetchOptions) {
  const adapter = getUniV3LogAdapter({ factory: factories[options.chain], ...feeConfigs })
  const response = await adapter(options)
  return response;
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  fetch,
  adapter: {
    [CHAIN.ERA]: { start: '2023-03-23', },
    [CHAIN.LINEA]: { start: '2023-07-19', },
    [CHAIN.SOPHON]: { start: '2024-12-16', }
  },
};

export default adapter;
