import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const CommissionFromTokenRecordEvent = 'event CommissionFromTokenRecord(address tokenAddress, uint256 commissionAmount, address referrerAddress)';
const CommissionToTokenRecordEvent = 'event CommissionToTokenRecord(address tokenAddress, uint256 commissionAmount, address referrerAddress)';

interface IRouter {
  addresses: Array<string>;
}

const routers: Record<string, IRouter> = {
  [CHAIN.ETHEREUM]: {
    addresses: [
      '0x2E1Dee213BA8d7af0934C49a23187BabEACa8764',
    ],
  },
  [CHAIN.SONIC]: {
    addresses: [
      '0x8feB9E84b7E9DC86adc6cD6Eb554C5B4355c8405',
    ],
  },
  [CHAIN.ERA]: {
    addresses: [
      '0x010BC6B1014E5ed8284ab0667b116AAb99588159',
    ],
  },
  [CHAIN.OPTIMISM]: {
    addresses: [
      '0x86F752f1F662f39BFbcBeF95EE56B6C20d178969',
    ],
  },
  [CHAIN.POLYGON]: {
    addresses: [
      '0xF5402CCC5fC3181B45D7571512999D3Eea0257B6',
    ],
  },
  [CHAIN.BSC]: {
    addresses: [
      '0x6015126d7D23648C2e4466693b8DeaB005ffaba8',
    ],
  },
  [CHAIN.AVAX]: {
    addresses: [
      '0x79f7C6C6dc16Ed3154E85A8ef9c1Ef31CEFaEB19',
    ],
  },
  [CHAIN.ARBITRUM]: {
    addresses: [
      '0x5e2F47bD7D4B357fCfd0Bb224Eb665773B1B9801',
    ],
  },
  [CHAIN.LINEA]: {
    addresses: [
      '0x6f7c20464258c732577c87a9B467619e03e5C158',
    ],
  },
  [CHAIN.BASE]: {
    addresses: [
      '0x5e2F47bD7D4B357fCfd0Bb224Eb665773B1B9801',
    ],
  },
  [CHAIN.MANTLE]: {
    addresses: [
      '0x69C236E021F5775B0D0328ded5EaC708E3B869DF',
    ],
  },
  [CHAIN.BLAST]: {
    addresses: [
      '0x69C236E021F5775B0D0328ded5EaC708E3B869DF',
    ],
  },
  [CHAIN.UNICHAIN]: {
    addresses: [
      '0x411d2C093e4c2e69Bf0D8E94be1bF13DaDD879c6',
    ],
  },
  [CHAIN.PLASMA]: {
    addresses: [
      '0xd30D8CA2E7715eE6804a287eB86FAfC0839b1380',
    ],
  },
  [CHAIN.METIS]: {
    addresses: [
      '0xcF76984119C7f6ae56fAfE680d39C08278b7eCF4',
    ],
  },
}

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const fromEvents: Array<any> = await options.getLogs({
    eventAbi: CommissionFromTokenRecordEvent,
    targets: routers[options.chain].addresses,
    flatten: true,
  })
  const toEvents: Array<any> = await options.getLogs({
    eventAbi: CommissionToTokenRecordEvent,
    targets: routers[options.chain].addresses,
    flatten: true,
  })
  for (const event of fromEvents.concat(toEvents)) {
    dailyFees.add(event.tokenAddress, event.commissionAmount)
  }

  return {
    dailyFees: dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  methodology: {
    Fees: 'Totalcomission fees from every trade.',
    UserFees: 'Users pay small amount of fees on trades.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'All comission fees distributed to referrer addresses.',
  },
  chains: Object.keys(routers),
  start: '2025-08-05',
}

export default adapter;
