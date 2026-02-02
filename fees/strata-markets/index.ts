import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const ACCOUNTING = '0xa436c5Dd1Ba62c55D112C10cd10E988bb3355102';
const USDE = '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3';

const FEE_ACCRUED_EVENT = "event FeeAccrued(bool isJrt, uint256 amountToReserve, uint256 amountToTranche)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [startBlock, endBlock] = await Promise.all([
    options.getStartBlock(),
    options.getEndBlock(),
  ]);

  let totalAmountToReserve = 0;
  let totalExitFees = 0;
  let performanceFees = 0;

  // Get NAV and reserveBps
  const [navT0, navT1, reserveBps] = await Promise.all([
    options.api.call({
      target: ACCOUNTING,
      abi: "function nav() view returns (uint256)",
      block: startBlock,
    }),
    options.api.call({
      target: ACCOUNTING,
      abi: "function nav() view returns (uint256)",
      block: endBlock,
    }),
    options.api.call({
      target: ACCOUNTING,
      abi: "function reserveBps() view returns (uint256)",
      block: endBlock,
    }),
  ]);

  // Calculate NAV change (gains/losses)
  const navGrowth = Number(navT1) - Number(navT0);

  // Calculate performance fees from gains (only if there are gains)
  if (navGrowth > 0 && reserveBps > 0) {
    // Reserve gets a portion of gains: gain * reserveBps / 1e18
    performanceFees = Number(navGrowth * reserveBps / 1e18);
  }
  const logs = await options.getLogs({
    target: ACCOUNTING,
    eventAbi: FEE_ACCRUED_EVENT,
  });
  logs.forEach((log: any) => {
    const amountToReserve = log.amountToReserve;
    const amountToTranche = log.amountToTranche;
    const totalFee = Number(amountToReserve) + Number(amountToTranche);
    totalExitFees += Number(totalFee);
    totalAmountToReserve += Number(amountToReserve);
  });

  // Calculate fee distribution
  const trancheFees = totalExitFees - totalAmountToReserve;
  const protocolRevenue = totalAmountToReserve + performanceFees;
  const totalFees = totalExitFees + performanceFees;

  dailyFees.add(USDE, totalFees);
  dailyRevenue.add(USDE, protocolRevenue);
  dailyProtocolRevenue.add(USDE, protocolRevenue);
  dailySupplySideRevenue.add(USDE, Number(trancheFees));

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
};

const methodology = {
  Fees: "Includes performance fees (5% of yield generated from pooled collateral) and redemption fees.",
  Revenue: "Protocol treasury receives performance fees and a portion of redemption fees.",
  ProtocolRevenue: "Protocol treasury receives performance fees and a portion of redemption fees.",
  SupplySideRevenue: "Redemption fees distributed to senior and junior tranche holders."
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2025-10-05',
  methodology,
}

export default adapter;
