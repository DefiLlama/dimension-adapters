import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONTROLLER = '0x17bA239f2815BA01152522521737275a2439216f'

const EXECUTED_EVENT_ABI = 'event Executed(uint256 indexed proposalIdx, uint256 totalVotes, uint256 voteTokenTotalSupply)'
const GET_PROPOSAL_ABI = 'function getProposal(uint256 _proposalIdx) view returns (address _target, uint256 _action, uint256 _totalVotes, address _vetoApprover, bool _executed, uint256 _deadline)'
const POOL_WHITELISTED_ABI = 'function poolWhitelisted(address) view returns (bool)'
const NEWSUBPOOL_EVENT_ABI = 'event NewSubPool(address loanCcyToken, address collCcyToken, uint256 loanTenor, uint256 maxLoanPerColl, uint256 r1, uint256 r2, uint256 liquidityBnd1, uint256 liquidityBnd2, uint256 minLoan, uint256 creatorFee, address poolController, uint96 rewardCoefficient)'
const GET_POOL_INFO_ABI = 'function getPoolInfo() external view returns (address _loanCcyToken, address _collCcyToken, uint256 _maxLoanPerColl, uint256 _minLoan, uint256 _loanTenor, uint256 _totalLiquidity, uint256 _totalLpShares, uint96 _rewardCoefficient, uint256 _loanIdx)'
const BORROW_EVENT_ABI = 'event Borrow(address indexed borrower, uint256 loanIdx, uint256 collateral, uint256 loanAmount, uint256 repaymentAmount, uint256 totalLpShares, uint256 indexed expiry, uint256 indexed referralCode)'

const fetch = async ({ getLogs, createBalances, api }: FetchOptions) => {
  // Retrieve whitelisted pools by getting whitelist proposal logs and checking if the target pool is whitelisted
  const executedLogs = await getLogs({ target: CONTROLLER, eventAbi: EXECUTED_EVENT_ABI, fromBlock: 5000, cacheInCloud: true })
  const proposals = await api.multiCall({ target: CONTROLLER, abi: GET_PROPOSAL_ABI, calls: executedLogs.map(l => l.proposalIdx.toString()) })
  const potentialPools = proposals.map(p => p._target)
  const isWhitelisted = await api.multiCall({ target: CONTROLLER, abi: POOL_WHITELISTED_ABI, calls: potentialPools })
  const whitelistedPools = potentialPools.filter((_, idx) => isWhitelisted[idx])

  // Retrieve pool info for whitelisted pools
  const poolInfos = await api.multiCall({ abi: GET_POOL_INFO_ABI, calls: whitelistedPools })
  const dailyFees = createBalances();

  await Promise.all(whitelistedPools.map(async (pool, idx) => {
    // Creator fee is determined at the time of pool creation
    // It's expressed in wei, so we need to divide by 10^18 to get the actual fee
    const subPoolLogs = await getLogs({ target: pool, eventAbi: NEWSUBPOOL_EVENT_ABI, fromBlock: 5000, cacheInCloud: true })
    const creatorFee = subPoolLogs[0].creatorFee
    const logs = await getLogs({ target: pool, eventAbi: BORROW_EVENT_ABI, })

    logs.forEach(log => {
      const fee = BigInt(log.collateral) * BigInt(creatorFee) / (BigInt(10) ** BigInt(18))
      dailyFees.addToken(poolInfos[idx]._collCcyToken, fee)
    })
  }));

  return { dailyFees };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.VINUCHAIN]: { fetch, start: '2023-10-01' }
  }
};

export default adapter;
