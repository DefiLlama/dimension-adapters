import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const quoteSettledEvent = `event QuoteSettled(
  address indexed maker,
  address indexed payer,
  address indexed inputToken,
  bytes32 quoteId,
  address to,
  address vault,
  address outputToken,
  uint256 grossAmountIn,
  uint256 feeAmount,
  address feeTo,
  uint256 amountOut,
  uint256 nonce
)`;

const settlementContracts: Record<string, string> = {
  [CHAIN.BSC]: "0x5F86475d57e9B488500d3CdA6F6Cb3938B192077",
  [CHAIN.BASE]: "0x5F86475d57e9B488500d3CdA6F6Cb3938B192077",
};

const fetch = async ({ getLogs, createBalances, chain }: FetchOptions) => {
  const settlement = settlementContracts[chain];
  const dailyVolume = createBalances();

  const logs = await getLogs({
    target: settlement,
    eventAbi: quoteSettledEvent,
  });

  logs.forEach((log: any) => {
    dailyVolume.add(log.outputToken, log.amountOut);
  });

  return { dailyVolume };
};

const adapter: any = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.BSC]: { start: '2026-03-24' },
    [CHAIN.BASE]: { start: '2026-03-24' },
  },
};

export default adapter;
