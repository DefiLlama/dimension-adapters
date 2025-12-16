import {Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";

const EVM_ABI = {
  issue: 'event Issue(address indexed to, uint256 value, uint256 valueLocked)',
  totalSupply: "uint256:totalSupply",
}
const YIELD_DISTRIBUTION_HOUR_UTC = 15

const EVM_CONTRACTS: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    contracts : [
      {
        address: '0x7712c34205737192402172409a8f7ccef8aa2aec',
        start: '2024-03-01',
      },
      {
        address: '0x6a9DA2D710BB9B700acde7Cb81F10F1fF8C89041',
        start: '2024-12-17',
      }
    ],
    bps: 50,
  },
  [CHAIN.POLYGON]: {
    contracts : [
      {
        address: '0x2893ef551b6dd69f661ac00f11d93e5dc5dc0e99',
        start: '2024-11-04',
      },
    ],
    bps: 20
  },
  [CHAIN.AVAX]: {
    contracts : [
      {
        address: '0x53fc82f14f009009b440a706e31c9021e1196a2f',
        start: '2024-11-04',
      },
    ],
    bps: 20
  },
  [CHAIN.OPTIMISM]: {
    contracts : [
      {
        address: '0xa1cdab15bba75a80df4089cafba013e376957cf5',
        start: '2024-11-04',
      },
    ],
    bps: 50
  },
  [CHAIN.ARBITRUM]: {
    contracts : [
      {
        address: '0xa6525ae43edcd03dc08e775774dcabd3bb925872',
        start: '2024-11-04',
      },
    ],
    bps: 50
  },
  [CHAIN.BSC]: {
    contracts : [
      {
        address: '0x2d5bdc96d9c8aabbdb38c9a27398513e7e5ef84f',
        start: '2025-10-08',
      },
    ],
    bps: 18
  },
}

const estimateDailyManagementFee = (totalSupply: number, bps: number) => {
  return ((totalSupply / 1e6) * bps * 0.0001) / 365
}

const fetchEvm: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  for (const contract of EVM_CONTRACTS[options.chain].contracts) {
    const issueEvents: Array<any> = await options.getLogs({
      target: contract.address,
      eventAbi: EVM_ABI.issue,
      entireLog: true,

    })
    issueEvents.filter(e => new Date(parseInt(e.blockTimestamp,16) * 1000).getUTCHours() === YIELD_DISTRIBUTION_HOUR_UTC).forEach(e => {
      dailySupplySideRevenue.addToken(contract.address, e.parsedLog.args.value)
    })

    // estimate management fee
    const totalSupply = await options.fromApi.call({
      target: contract.address,
      abi:  EVM_ABI.totalSupply,
    })
    const mngmtFee = estimateDailyManagementFee(totalSupply, EVM_CONTRACTS[options.chain].bps);
    dailyRevenue.addUSDValue(mngmtFee)
  }

  const dailyFees = dailyRevenue.clone();
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
  }
};

const adapters: Adapter = {
  version: 2,
  adapter: Object.keys(EVM_CONTRACTS).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetchEvm,
        start: EVM_CONTRACTS[chain].contracts.map((c: {start: string}) => c.start).sort()[0], // return the oldest contract deployment date from array of contracts
      }
    }
  }, {
  }),
  methodology: {
    Fees: 'Total Yields + management fees',
    Revenue: 'management fees',
    SupplySideRevenue: 'All yields go to BUIDL token holders.',
  }
};
export default adapters;
