import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { nullAddress } from '../../helpers/token';
import { METRIC } from '../../helpers/metrics';

const BREAD_CONTRACT_ADDRESS = "0x0003eEDFdd020bf60D10cf684ABAc7C4534B7eAd";
// uint256 public constant PROTOCOL_FEE_SHARE_BPS = 3500 — Bread.sol L155
const PROTOCOL_FEE_SHARE_BPS = 3500n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  const [sendBeraLogs, bountyLogs, tokenLockedLogs, polFeeBpsRaw, tokenLockerFeeBpsRaw, feeAddress] = await Promise.all([
    options.getLogs({
      target: BREAD_CONTRACT_ADDRESS,
      eventAbi: 'event SendBera(address to, uint256 amount)'
    }),
    options.getLogs({
      target: BREAD_CONTRACT_ADDRESS,
      eventAbi: 'event BountyCollected(address claimer, uint256 bounty, address[] tokens, uint256[] amounts)'
    }),
    options.getLogs({
      target: BREAD_CONTRACT_ADDRESS,
      eventAbi: 'event TokenLocked(address indexed user, address indexed token, uint256 lockAmount, uint256 unlockTime)'
    }),
    options.api.call({
      target: BREAD_CONTRACT_ADDRESS,
      abi: 'function polFeeBps() view returns (uint256)'
    }),
    options.api.call({
      target: BREAD_CONTRACT_ADDRESS,
      abi: 'function tokenLockerFeeBps() view returns (uint256)'
    }),
    options.api.call({
      target: BREAD_CONTRACT_ADDRESS,
      abi: 'function breadTreasury() view returns (address)'
    })
  ]);

  const polFeeBps = BigInt(polFeeBpsRaw);
  const tokenLockerFeeBps = BigInt(tokenLockerFeeBpsRaw);

  // claimBribeBounty: gross = full bounty paid; treasury receives polFeeBps% (no PROTOCOL_FEE_SHARE_BPS).
  // The remaining (100 - polFeeBps)% stays in the contract as bonding curve backing.
  // Bread.sol: uint256 treasuryAmount = msg.value * polFeeBps / BPS_DENOMINATOR
  let bountyTreasuryTotal = 0n;
  for (const log of bountyLogs) {
    const bountyPaid = BigInt(log.bounty);
    const treasuryShare = bountyPaid * polFeeBps / 10000n;
    bountyTreasuryTotal += treasuryShare;
    dailyFees.add(nullAddress, bountyPaid, METRIC.SERVICE_FEES);
    dailyProtocolRevenue.add(nullAddress, treasuryShare, METRIC.PROTOCOL_FEES);
    dailyHoldersRevenue.add(nullAddress, bountyPaid - treasuryShare, METRIC.TOKEN_BUY_BACK);
  }

  // bake/burn/loop/borrow/increaseBorrow/extendLoan/flashBurn:
  // all send treasury = gross * PROTOCOL_FEE_SHARE_BPS / BPS_DENOMINATOR (35%).
  // Reconstruct: gross = treasury * 10000 / 3500
  // Subtract the bounty treasury amounts already accounted for above.
  let mainTreasuryTotal = 0n;
  for (const log of sendBeraLogs) {
    if (log.to.toLowerCase() === feeAddress.toLowerCase()) {
      mainTreasuryTotal += BigInt(log.amount);
    }
  }
  mainTreasuryTotal -= bountyTreasuryTotal;

  // lockTokens: fee = lockAmount * tokenLockerFeeBps / (10000 - tokenLockerFeeBps)
  // Bread.sol: breadFee = amount * tokenLockerFeeBps / BPS_DENOMINATOR; lockAmount = amount - breadFee
  // Fee is ERC-20 token retained as bonding curve backing (100% to holders).
  if (tokenLockerFeeBps > 0n) {
    for (const log of tokenLockedLogs) {
      const lockedAmount = BigInt(log.lockAmount);
      const fee = lockedAmount * tokenLockerFeeBps / (10000n - tokenLockerFeeBps);
      dailyFees.add(log.token, fee, METRIC.SERVICE_FEES);
      dailyHoldersRevenue.add(log.token, fee, METRIC.TOKEN_BUY_BACK);
    }
  }

  if (mainTreasuryTotal > 0n) {
    const mainGross = mainTreasuryTotal * 10000n / PROTOCOL_FEE_SHARE_BPS;
    dailyFees.add(nullAddress, mainGross, METRIC.MINT_REDEEM_FEES);
    dailyProtocolRevenue.add(nullAddress, mainTreasuryTotal, METRIC.PROTOCOL_FEES);
    dailyHoldersRevenue.add(nullAddress, mainGross - mainTreasuryTotal, METRIC.TOKEN_BUY_BACK);
  }

  return { dailyFees, dailyProtocolRevenue, dailyHoldersRevenue }
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: 'Gross fees from bake, burn, loop, borrow, flashBurn, and extendLoan',
    [METRIC.SERVICE_FEES]: 'Full bounty paid by claimBribeBounty callers (polFeeBps% to treasury, rest to backing); ERC-20 tokenLockerFee retained as backing on each lockTokens call',
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: 'Treasury receipts: 35% of main operation fees + polFeeBps% of bounty claims',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: '65% of main operation fees + (100 - polFeeBps)% of bounty claims retained as BREAD bonding curve backing',
  },
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.BERACHAIN],
  fetch,
  start: '2025-03-17',
  pullHourly: true,
  methodology: {
    Fees: "Gross fees from bake/burn/loop/borrow/flashBurn/extendLoan (BERA), full bounty paid in claimBribeBounty (BERA), and ERC-20 tokenLockerFee on lockTokens",
    ProtocolRevenue: "35% of main operation fees sent to breadTreasury; polFeeBps% of bounty claims sent to breadTreasury",
    HoldersRevenue: "65% of main operation fees + 90% of bounty claims retained in BREAD bonding curve backing",
  },
  breakdownMethodology,
};

export default adapter;
