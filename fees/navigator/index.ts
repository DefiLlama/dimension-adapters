import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPositionedLogArgs, PositionedLogArgs } from "../../helpers/logs";
import { METRIC } from "../../helpers/metrics";

// The Stable Pool (NSLP, Vault 0x41cD8CaFc24A771031B9eB9C57cFC94D86045eB6) is not tracked here.
const VAULT = '0xe9263682E837eFabb145f8C632B9d2c518D90652';

// Fee split per https://docs.navigator.exchange/navigator-exchange/tokenomics (unchanged since at least 2025-05):
// 50% to NLP/NSLP, 20% to NAVI stakers (S rewards), 20% to the public treasury, 5% buybacks and adding liquidity,
// 3% LP incentives, 2% bot maintenance
const LP_SHARE = 0.5;
const STAKERS_SHARE = 0.2;
const PROTOCOL_SHARE = 0.3;

// vault actions that charge a swap fee, each emitted right after its CollectSwapFees log
const SWAP_FEE_ACTIONS: [string, string][] = [
  [METRIC.MINT_REDEEM_FEES, 'event BuyUSDN(address account, address token, uint256 tokenAmount, uint256 usdnAmount, uint256 feeBasisPoints)'],
  [METRIC.MINT_REDEEM_FEES, 'event SellUSDN(address account, address token, uint256 usdnAmount, uint256 tokenAmount, uint256 feeBasisPoints)'],
  [METRIC.SWAP_FEES, 'event Swap(address account, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 amountOutAfterFees, uint256 feeBasisPoints)'],
];

// Fees are valued with the vault's own feeUsd (its Pyth oracle price): Sonic USDT (0x6047828dc181963ba44974801ff68e538da5eaf9),
// one of the vault's tokens, has no DefiLlama price before 2025-08-21.
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // position (open/close), borrow and funding fees, including those charged on liquidation
  const marginFeeLogs = await options.getLogs({
    target: VAULT,
    eventAbi: 'event CollectMarginFees(address token, uint256 feeUsd, uint256 feeTokens)',
  });
  marginFeeLogs.forEach((log: any) => dailyFees.addUSDValue(Number(log.feeUsd) / 1e30, METRIC.MARGIN_FEES));

  const swapFeeLogs: (PositionedLogArgs & { label?: string })[] = await getPositionedLogArgs(options, {
    target: VAULT,
    eventAbi: 'event CollectSwapFees(address token, uint256 feeUsd, uint256 feeTokens)',
  });
  for (const [label, eventAbi] of SWAP_FEE_ACTIONS) {
    const actionLogs = await getPositionedLogArgs(options, { target: VAULT, eventAbi });
    actionLogs.forEach((log) => swapFeeLogs.push({ ...log, label }));
  }
  swapFeeLogs.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  let pendingFee: PositionedLogArgs | undefined;
  for (const log of swapFeeLogs) {
    if (!log.label) {
      if (pendingFee) throw new Error(`navigator: CollectSwapFees at block ${pendingFee.blockNumber} log ${pendingFee.logIndex} has no mint/redeem/swap log`);
      pendingFee = log;
      continue;
    }
    if (pendingFee?.blockNumber !== log.blockNumber) throw new Error(`navigator: mint/redeem/swap at block ${log.blockNumber} log ${log.logIndex} has no CollectSwapFees log`);
    dailyFees.addUSDValue(Number(pendingFee.feeUsd) / 1e30, log.label);
    pendingFee = undefined;
  }
  if (pendingFee) throw new Error(`navigator: CollectSwapFees at block ${pendingFee.blockNumber} log ${pendingFee.logIndex} has no mint/redeem/swap log`);

  const dailySupplySideRevenue = dailyFees.clone(LP_SHARE, 'Fees To NLP Holders');
  const dailyHoldersRevenue = dailyFees.clone(STAKERS_SHARE, 'Fees To NAVI Stakers');
  const dailyProtocolRevenue = dailyFees.clone(PROTOCOL_SHARE, 'Fees To Treasury');
  const dailyRevenue = dailyHoldersRevenue.clone(1);
  dailyRevenue.addBalances(dailyProtocolRevenue);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: "Position, borrow, funding, swap and NLP mint/redeem fees paid to the Navigator Crypto Pool vault on Sonic. Excludes the Stable Pool (NSLP).",
  Revenue: "50% of Crypto Pool fees: 20% distributed to NAVI stakers and 30% kept by the protocol for the treasury, buybacks, LP incentives and bot maintenance.",
  ProtocolRevenue: "30% of Crypto Pool fees: 20% to the public treasury, 5% to buybacks and adding liquidity, 3% to LP incentives and 2% to bot maintenance.",
  HoldersRevenue: "20% of Crypto Pool fees, distributed in S to NAVI stakers.",
  SupplySideRevenue: "50% of Crypto Pool fees, distributed in S to NLP holders.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.MARGIN_FEES]: 'Position open/close, borrow and funding fees paid by traders, including fees charged on liquidations.',
    [METRIC.MINT_REDEEM_FEES]: 'Fees paid when minting or redeeming NLP.',
    [METRIC.SWAP_FEES]: 'Fees paid on token swaps through the vault.',
  },
  Revenue: {
    'Fees To NAVI Stakers': '20% of Crypto Pool fees distributed in S to NAVI stakers.',
    'Fees To Treasury': '30% of Crypto Pool fees kept by the protocol for the treasury, buybacks, LP incentives and bot maintenance.',
  },
  ProtocolRevenue: {
    'Fees To Treasury': '30% of Crypto Pool fees kept by the protocol for the treasury, buybacks, LP incentives and bot maintenance.',
  },
  HoldersRevenue: {
    'Fees To NAVI Stakers': '20% of Crypto Pool fees distributed in S to NAVI stakers.',
  },
  SupplySideRevenue: {
    'Fees To NLP Holders': '50% of Crypto Pool fees distributed in S to NLP holders.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SONIC],
  start: '2024-12-26', // first vault fee log, tx 0xce0350d6d7c20d8cdae7daf898d37f921702b22d02098becc4e586e100d1c3d9
  methodology,
  breakdownMethodology,
}

export default adapter;
