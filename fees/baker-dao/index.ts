import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { nullAddress } from '../../helpers/token';
import { METRIC } from '../../helpers/metrics';

// source: https://routescan.io/address/0x0003eEDFdd020bf60D10cf684ABAc7C4534B7eAd#code
const BREAD_CONTRACT_ADDRESS = "0x0003eEDFdd020bf60D10cf684ABAc7C4534B7eAd";

// Bread.sol: uint256 public constant PROTOCOL_FEE_SHARE_BPS = 3500
// Applied in every fee-bearing operation: bake, burn, loop, borrow, increaseBorrow, extendLoan, flashBurn
// Formula per operation: treasuryAmount = grossFee * 3500 / 10000  →  gross = treasury * 10000 / 3500
const PROTOCOL_FEE_SHARE_BPS = 3500n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  const [sendBeraLogs, bountyLogs, tokenLockedLogs, [polFeeBpsRaw], [tokenLockerFeeBpsRaw], [feeAddress]] = await Promise.all([
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
    options.api.multiCall({ abi: 'function polFeeBps() view returns (uint256)', calls: [{ target: BREAD_CONTRACT_ADDRESS }] }),
    options.api.multiCall({ abi: 'function tokenLockerFeeBps() view returns (uint256)', calls: [{ target: BREAD_CONTRACT_ADDRESS }] }),
    options.api.multiCall({ abi: 'function breadTreasury() view returns (address)', calls: [{ target: BREAD_CONTRACT_ADDRESS }] }),
  ]);

  const polFeeBps = BigInt(polFeeBpsRaw);
  const tokenLockerFeeBps = BigInt(tokenLockerFeeBpsRaw);

  // claimBribeBounty: gross = full bounty paid (msg.value == bribeBounty).
  // Treasury receives polFeeBps% — no PROTOCOL_FEE_SHARE_BPS applied here.
  // Remaining (100 - polFeeBps)% stays in contract as bonding curve backing.
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
  // All call _sendBera(breadTreasury, fee * PROTOCOL_FEE_SHARE_BPS / BPS_DENOMINATOR).
  // Gross = treasury * 10000 / 3500; holders backing = gross * 6500 / 10000.
  // Subtract bounty treasury already accounted for above to isolate the 35%-split stream.
  let mainTreasuryTotal = 0n;
  for (const log of sendBeraLogs) {
    if (log.to.toLowerCase() === feeAddress.toLowerCase()) {
      mainTreasuryTotal += BigInt(log.amount);
    }
  }
  mainTreasuryTotal -= bountyTreasuryTotal;

  if (mainTreasuryTotal > 0n) {
    const mainGross = mainTreasuryTotal * 10000n / PROTOCOL_FEE_SHARE_BPS;
    dailyFees.add(nullAddress, mainGross, METRIC.MINT_REDEEM_FEES);
    dailyProtocolRevenue.add(nullAddress, mainTreasuryTotal, METRIC.PROTOCOL_FEES);
    dailyHoldersRevenue.add(nullAddress, mainGross - mainTreasuryTotal, METRIC.TOKEN_BUY_BACK);
  }

  // lockTokens: fee = lockAmount * tokenLockerFeeBps / (10000 - tokenLockerFeeBps)
  // Bread.sol: breadFee = amount * tokenLockerFeeBps / BPS_DENOMINATOR; lockAmount = amount - breadFee
  // Inverse: fee = lockAmount * feeBps / (10000 - feeBps). Fee is ERC-20, 100% retained as backing.
  if (tokenLockerFeeBps > 0n) {
    for (const log of tokenLockedLogs) {
      const lockedAmount = BigInt(log.lockAmount);
      const fee = lockedAmount * tokenLockerFeeBps / (10000n - tokenLockerFeeBps);
      dailyFees.add(log.token, fee, METRIC.SERVICE_FEES);
      dailyHoldersRevenue.add(log.token, fee, METRIC.TOKEN_BUY_BACK);
    }
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue, dailyHoldersRevenue }
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: 'Gross fees from bake, burn, loop, borrow, flashBurn, and extendLoan — reconstructed as treasury / 0.35 (PROTOCOL_FEE_SHARE_BPS = 3500)',
    [METRIC.SERVICE_FEES]: 'Full bounty paid in claimBribeBounty (polFeeBps% to treasury, rest to backing); ERC-20 tokenLockerFee retained as backing on lockTokens',
  },
  Revenue: {
    [METRIC.MINT_REDEEM_FEES]: 'Gross fees from bake, burn, loop, borrow, flashBurn, and extendLoan — reconstructed as treasury / 0.35 (PROTOCOL_FEE_SHARE_BPS = 3500)',
    [METRIC.SERVICE_FEES]: 'Full bounty paid in claimBribeBounty (polFeeBps% to treasury, rest to backing); ERC-20 tokenLockerFee retained as backing on lockTokens',
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: '35% of main operation fees sent to breadTreasury; polFeeBps% of bounty claims sent to breadTreasury',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: '65% of main operation fees + (100 - polFeeBps)% of bounty claims + 100% of tokenLockerFee retained as BREAD bonding curve backing',
  },
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.BERACHAIN],
  fetch,
  start: '2025-03-20',
  pullHourly: true,
  methodology: {
    Fees: "Gross fees from bake/burn/loop/borrow/flashBurn/extendLoan (BERA), full bounty paid in claimBribeBounty (BERA), and ERC-20 tokenLockerFee on lockTokens",
    Revenue: "Gross fees from bake/burn/loop/borrow/flashBurn/extendLoan (BERA), full bounty paid in claimBribeBounty (BERA), and ERC-20 tokenLockerFee on lockTokens",
    ProtocolRevenue: "35% of main operation fees sent to breadTreasury; polFeeBps% of bounty claims sent to breadTreasury",
    HoldersRevenue: "65% of main operation fees + 90% of bounty claims + 100% of tokenLockerFee retained as BREAD bonding curve backing",
  },
  breakdownMethodology,
};

export default adapter;
