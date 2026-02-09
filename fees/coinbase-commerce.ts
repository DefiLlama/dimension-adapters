import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

type TContract = {
  [s: string | CHAIN]: string[];
}
const contracts: TContract = {
  [CHAIN.ETHEREUM]: ['0x3263bc4976C8c180bd5EB90a57ED1A2f1CFcAC67', '0x7915f087685fffD71608E5d118f3B70c27D9eF4e', "0x131642c019AF815Ae5F9926272A70C84AE5C37ab", "0x1DAe28D7007703196d6f456e810F67C33b51b25C", "0x1FA57f879417e029Ef57D7Ce915b0aA56A507C31"],
  [CHAIN.POLYGON]: ["0x551c6791c2f01c3Cd48CD35291Ac4339F206430d", "0xe63fb3a3cd48df6a336560a91f78ac6013557f7d", "0x7f52269092F2a5EF06C36C91e46F9196deb90336", "0x48073112c8C48e2550Bd42E4CD0aA483a416c5af", "0xc2252Ce3348B8dAf90583E53e07Be53d3aE728FB", "0x288844216a63638381784E0C1081A3826fD5a2E4"],
  [CHAIN.BASE]: ["0xeF0D482Daa16fa86776Bc582Aff3dFce8d9b8396", "0x131642c019AF815Ae5F9926272A70C84AE5C37ab", "0x9Bb4D44e6963260A1850926E8f6bEB8d5803836F", "0x30E95edE0b3C7Ef147EE97A5e88FdE06311EA11f", "0xeADE6bE02d043b3550bE19E960504dbA14A14971", "0x03059433BCdB6144624cC2443159D9445C32b7a8"],
}

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyFees = createBalances()

  await Promise.all(contracts[chain].map(async contract => {
    const logs = await getLogs({ target: contract, eventAbi: 'event Transferred (address indexed operator, bytes16 id, address recipient, address sender, uint256 spentAmount, address spentCurrency)' })
    logs.forEach((i: any) => {
      const amount = i.spentAmount / BigInt(100)
      dailyFees.add(i.spentCurrency, amount, METRIC.SERVICE_FEES)
    })
  }))

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const methodology = {
  Fees: 'All fees paid by users using Coinbase Commerce service.',
  Revenue: 'All fees paid by users using Coinbase Commerce service.',
  ProtocolRevenue: 'All fees paid by users using Coinbase Commerce service.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "1% of each transfer amount processed through Coinbase Commerce contracts, derived from the Transferred event spentAmount.",
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.POLYGON],
  start: '2023-11-14',
  methodology,
  breakdownMethodology,
}

export default adapter;
