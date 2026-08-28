import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import type { FetchOptions } from "../adapters/types"

const POOL_ADDRESS = '0x55F9F26b3d7a4459205c70994c11775629530eA5'
const DEPLOY_BLOCK = 15819910

const ABIs = {
  poolCreated: 'event PoolCreated(address indexed,address indexed ,address)',
  loanCreated: 'event LoanCreated(uint256 indexed loanId, uint256 nft, uint256 interest, uint256 startTime, uint216 borrowed)',
  ownerOf: 'function ownerOf(uint256 tokenId) view returns (address)',
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const poolCreatedLogs = await options.getLogs({
    target: POOL_ADDRESS,
    eventAbi: ABIs.poolCreated,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
  })

  const pools = poolCreatedLogs.map(log => log[2]);

  const loans = await options.getLogs({
    targets: pools,
    eventAbi: ABIs.loanCreated,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
    flatten: false,
  });

  const owners = await options.api.multiCall({
    abi: ABIs.ownerOf,
    calls: pools.flatMap((pool, poolIndex) =>
      loans[poolIndex].map((loan: any) => ({ target: pool, params: [loan.loanId] }))
    ),
    permitFailure: true,
  });

  loans.flat().forEach((loan, index) => {
    const isLoanActive = owners[index]
    if (isLoanActive) {
      const dailyInterest = BigInt(loan.interest) * BigInt(loan.borrowed) * BigInt(options.endTimestamp - options.startTimestamp) / 10n ** 18n;
      dailyFees.addGasToken(dailyInterest);
    }
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
  };
};


const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: '2022-11-01',
  chains: [CHAIN.ETHEREUM],
  methodology: {
    Fees: "Interest paid by borrowers",
    UserFees: "Interest paid to borrow ETH",
    SupplySideRevenue: "Interest paid to NFTs lenders",
    Revenue: "Governance have no revenue",
    HoldersRevenue: "Token holders have no revenue",
    ProtocolRevenue: "Protocol have no revenue"
  }
}

export default adapter;
