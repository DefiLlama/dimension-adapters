import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const contractAddress = "0x43222f934ea5c593a060a6d46772fdbdc2e2cff0";
const contractAddress2 = "0x49D02f4F1515746978A821386E559ad57D5c69fd";
const contractAddress3 = "0xa08401e6b79676fab508ca21c0c552f550e1b4fc";


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
    log_swapped3
  ] = await Promise.all([
    options.getLogs({ target: contractAddress, eventAbi: event_fillQuoteEthToToken, }),
    options.getLogs({ target: contractAddress, eventAbi: event_fillQuoteTokenToEth, }),
    options.getLogs({ target: contractAddress, eventAbi: event_fillQuoteTokenToToken, }),
    options.getLogs({ target: contractAddress2, eventAbi: event_swap, }),
    options.getLogs({ target: contractAddress3, eventAbi: event_swap, }),
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
    dailyFees.addToken(log.tokenIn, Number(log.amountIn) * 0.006) // fixed 0.6%
  })

  log_swapped3.forEach((log) => {
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOut })
    dailyFees.addToken(log.tokenIn, Number(log.amountIn) * 0.006) // fixed 0.6%
  })

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2025-04-16",
  methodology: {
    Volume: "Volume is calculated by summing the token volume of all trades settled on the protocol that day.",
    Fees: "Users pay fees (0.6%) per swap.",
    UserFees: "Users pay fees (0.6%) per swap.",
  },
  chains: [CHAIN.WC],
};

export default adapter;
