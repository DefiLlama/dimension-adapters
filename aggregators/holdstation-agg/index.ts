import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const contractAddress = "0x43222f934ea5c593a060a6d46772fdbdc2e2cff0";
const contractAddress2 = "0x49D02f4F1515746978A821386E559ad57D5c69fd";

const event_fillQuoteEthToToken =
  "event FillQuoteEthToToken(address indexed buyToken,address indexed user,address target,uint256 amountSold,uint256 amountBought,uint256 feeAmount)";
const event_fillQuoteTokenToEth =
  "event FillQuoteTokenToEth(address indexed sellToken,address indexed user,address target,uint256 amountSold,uint256 amountBought,uint256 feeAmount)";
const event_fillQuoteTokenToToken =
  "event FillQuoteTokenToToken(address indexed sellToken,address indexed buyToken,address indexed user,address target,uint256 amountSold,uint256 amountBought,uint8 feeToken,uint256 feeAmount)";
const event_swap =
  "event Swapped(address indexed tokenIn,address indexed receiver,address tokenOut,uint256 amountIn,uint256 amountOut)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const [
    log_fillQuoteEthToToken,
    log_fillQuoteTokenToEth,
    log_fillQuoteTokenToToken,
    log_swapped,
  ] = await Promise.all([
    options.getLogs({ target: contractAddress, eventAbi: event_fillQuoteEthToToken, }),
    options.getLogs({ target: contractAddress, eventAbi: event_fillQuoteTokenToEth, }),
    options.getLogs({ target: contractAddress, eventAbi: event_fillQuoteTokenToToken, }),
    options.getLogs({ target: contractAddress2, eventAbi: event_swap, }),
  ]);

  log_fillQuoteEthToToken.forEach((log) => {
    dailyVolume.addGasToken(log.amountSold)
    dailyVolume.addGasToken(log.feeAmount)
  })

  log_fillQuoteTokenToEth.forEach((log) => {
    dailyVolume.addGasToken(log.amountBought)
    dailyVolume.addGasToken(log.feeAmount)
  })

  log_fillQuoteTokenToToken.forEach((log) => {
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: log.sellToken, amount0: log.amountSold, token1: log.buyToken, amount1: log.amountBought })
    const feeToken = log.feeToken === 0n ? log.sellToken : log.buyToken
    dailyFees.addToken(feeToken, log.feeAmount)
  })

  log_swapped.forEach((log) => {
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOut })
    dailyFees.addToken(log.tokenIn, log.amountIn)
  })

  return {
    dailyVolume, dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.WC]: {
      fetch,
      start: "2025-04-16",
      meta: {
        methodology: {
          dailyVolume:
            "Volume is calculated by summing the token volume of all trades settled on the protocol that day.",
        },
      },
    },
  },
};

export default adapter;
