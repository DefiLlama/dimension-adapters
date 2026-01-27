import {Adapter, FetchOptions, FetchResultV2} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {addOneToken} from "../../helpers/prices";

const events = {
  trade: 'event Trade( address indexed trader, address indexed origin, address indexed target, uint256 originAmount, uint256 targetAmount, int128 rawProtocolFee)',
  newCurve: 'event NewCurve (address indexed caller, bytes32 indexed id, address indexed curve)'
}

// Sources: treasury address is defined on the curveFactory contract on method getProtocolTreasury
// Other contract addresses can be found at https://docs.stabull.finance/amm/contracts
const configs: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    factory: { address: "0x2e9E34b5Af24b66F12721113C1C8FFcbB7Bc8051", fromBlock: 19773852 },
    start: '2024-04-29',
  },
  [CHAIN.POLYGON]: {
    factory: { address: "0x3c60234db40e6e5b57504e401b1cdc79d91faf89", fromBlock: 56377840 },
    start: '2024-04-29',
  },
  [CHAIN.BASE]: {
    factory: { address: "0x86Ba17ebf8819f7fd32Cf1A43AbCaAe541A5BEbf", fromBlock: 32584321 },
    start: '2025-07-08',
  },
};

// This method dynamically fetches pool addresses, this way newly created pools will be counted automatically in the future
const getPools = async (options: FetchOptions): Promise<string[]> => {
  const {address, fromBlock} = configs[options.chain].factory
  const logs = await options.getLogs({
    target: address,
    eventAbi: events.newCurve,
    cacheInCloud: true,
    fromBlock,
  });
  return logs.map(log => log.curve);
}

const fetch: any = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()

  const poolAddresses = await getPools(options);
  const tradeEvents: Array<any> = await options.getLogs({
    targets: poolAddresses,
    eventAbi: events.trade,
  })
  
  for (const event of tradeEvents) {
    addOneToken({ balances: dailyVolume, chain: options.chain, token0: event.origin, amount0: event.originAmount, token1: event.target, amount1: event.targetAmount })
  }
  
  const dailyFees = dailyVolume.clone(0.0015)
  const dailyRevenue = dailyFees.clone(0.3)
  const dailySupplySideRevenue = dailyFees.clone(0.7)
  
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
};

const adapters: Adapter = {
  version: 2,
  fetch,
  adapter: configs,
  methodology: {
    Fees: 'Stabull charges a flat rate of 0.15% per swap per pool',
    Revenue: '30% of all fees goes to the protocol treasury',
    ProtocolRevenue: '30% of all fees goes to the protocol treasury',
    SupplySideRevenue: '70% of all fees goes to the LPs',
  },
};

export default adapters;
