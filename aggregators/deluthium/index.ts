import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

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

const SWAP_FEE_LABEL = "Swap Fees";

const fetch = async ({ getLogs, createBalances, chain }: FetchOptions) => {
  const settlement = settlementContracts[chain];
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const logs = await getLogs({ target: settlement, eventAbi: quoteSettledEvent, });

  logs.forEach((log: any) => {
    addOneToken({ chain, balances: dailyVolume, token0: log.outputToken, amount0: log.amountOut, token1: log.inputToken, amount1: log.grossAmountIn });
    dailyVolume.add(log.outputToken, log.amountOut);
    dailyFees.add(log.feeTo, log.feeAmount, SWAP_FEE_LABEL);
  });

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, };
};

const methodology = {
  Volume: "Sum of output token amounts from QuoteSettled events emitted by the Deluthium settlement contract.",
  Fees: "Swap fees collected by the Deluthium settlement contract, taken from the feeAmount field of each QuoteSettled event.",
  Revenue: "All swap fees are retained by the protocol.",
  ProtocolRevenue: "All swap fees are retained by the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [SWAP_FEE_LABEL]: "Swap fees paid by the user",
  },
  Revenue: {
    [SWAP_FEE_LABEL]: "Swap fees paid by the user",
  },
  ProtocolRevenue: {
    [SWAP_FEE_LABEL]: "Swap fees paid by the user",
  },
};

const adapter: any = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.BSC]: { start: '2026-03-24' },
    [CHAIN.BASE]: { start: '2026-03-24' },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
