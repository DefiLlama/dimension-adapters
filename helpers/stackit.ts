import { FetchOptions } from "../adapters/types";

const CONTRACT = "0xE31eE34E37752d90dF52E251069352ba67284807";
const DEPLOY_TIMESTAMP = 1745366400; // 2026-04-23 00:00 UTC

const sipCreatedAbi = "event SIPCreated(address indexed user, uint256 planIndex, uint256 planId, uint256 amount, uint256 frequency, address stablecoin, address targetToken)";
const basketCreatedAbi = "event BasketSIPCreated(address indexed user, uint256 planIndex, uint256 planId, uint256 amount, uint256 frequency, address stablecoin, uint256 basketSize)";

export { CONTRACT };

export const investmentExecutedAbi = "event InvestmentExecuted(address indexed user, uint256 planIndex, uint256 planId, uint256 amountIn, uint256 amountOut, uint256 feeAmount)";
export const basketInvestmentExecutedAbi = "event BasketInvestmentExecuted(address indexed user, uint256 planIndex, uint256 planId, uint256 amountIn, uint256 feeAmount)";

export async function getPlanIdToStablecoin(options: FetchOptions): Promise<Map<string, string>> {
  const { getLogs } = options;
  const [createdLogs, basketCreatedLogs] = await Promise.all([
    getLogs({ target: CONTRACT, eventAbi: sipCreatedAbi, fromTimestamp: DEPLOY_TIMESTAMP }),
    getLogs({ target: CONTRACT, eventAbi: basketCreatedAbi, fromTimestamp: DEPLOY_TIMESTAMP }),
  ]);
  const map = new Map<string, string>();
  for (const l of createdLogs) map.set(l.planId.toString(), l.stablecoin);
  for (const l of basketCreatedLogs) map.set(l.planId.toString(), l.stablecoin);
  return map;
}
