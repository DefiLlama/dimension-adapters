import {Adapter, FetchOptions, FetchResultV2} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import { addTokensReceived } from '../../helpers/token';
import {Balances} from "@defillama/sdk";


const events = {
  trade: 'event Trade( address indexed trader, address indexed origin, address indexed target, uint256 originAmount, uint256 targetAmount, int128 rawProtocolFee)',
  newCurve: 'event NewCurve (address indexed caller, bytes32 indexed id, address indexed curve)'
}

// Sources: treasury address is defined on the curveFactory contract on method getProtocolTreasury
// Other contract addresses can be found at https://docs.stabull.finance/amm/contracts
const configs: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    factory: { address: "0x2e9E34b5Af24b66F12721113C1C8FFcbB7Bc8051", fromBlock: 19773852 },
    treasury: '0xaBd582EFa8ff22D5258FAFf769082002B3a1d919',
    startDate: '2024-04-29',
  },
  [CHAIN.POLYGON]: {
    factory: { address: "0x3c60234db40e6e5b57504e401b1cdc79d91faf89", fromBlock: 56377840 },
    treasury: '0x2ABbb079e97bd30605CcD65b8aDFB756AFE4f511',
    startDate: '2024-04-29',
  },
  [CHAIN.BASE]: {
    factory: { address: "0x86Ba17ebf8819f7fd32Cf1A43AbCaAe541A5BEbf", fromBlock: 32584321 },
    treasury: '0x1ea84Ba9598AA1083D7F4096E06B532Da2c3dEf5',
    startDate: '2025-07-08',
  },
};

// This method dynamically fetches pool addresses, this way newly created pools will be counted automatically in the future
const getPools = async (options: FetchOptions): Promise<string[]> => {
  const {address, fromBlock} = configs[options.chain].factory
  const logs = await options.getLogs({
    target: address,
    eventAbi: events.newCurve,
    onlyArgs: true,
    fromBlock,
  });
  return logs.map(log => log.curve);
}

const fetchVolume = async (options: FetchOptions, targets: string[], dailyVolume: Balances) => {
  const tradeEvents: Array<any> = await options.getLogs({
    targets: targets,
    eventAbi: events.trade,
  })

  for (const event of tradeEvents) {
    dailyVolume.addToken(event.origin, event.originAmount)
  }
}

const fetchRevenue = async (options: FetchOptions, fromAdddesses: string[], dailyFees: Balances) => {
  await addTokensReceived({
    options,
    balances: dailyFees,
    targets: [configs[options.chain].treasury], // Treasury address
    fromAdddesses,
  })
}

const fetch: any = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()
  const dailyRevenue = options.createBalances()

  const poolAddresses = await getPools(options);

  await fetchVolume(options, poolAddresses, dailyVolume);
  await fetchRevenue(options, poolAddresses, dailyRevenue);


  return {
    dailyVolume,
    dailyRevenue,
    // Protocol collects 30% of total fees as revenue, so to derive the full 100% fees:
    // dailyFees = dailyRevenue / 0.3, equivalently dailyRevenue * (10 / 3)
    dailyFees: dailyRevenue.clone(10/3),
  }
};

const adapters: Adapter = {
  version: 2,
  adapter: Object.keys(configs).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: configs[chain].startDate,
      }
    }
  }, {}),
  methodology: {
    Fees: 'Stabull charges a flat rate of 0.15% per swap per pool',
    Revenue: '30% of all fees goes to the protocol treasury',
  },
};
export default adapters;
