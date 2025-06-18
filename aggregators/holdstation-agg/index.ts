import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { uniV2Exports } from "../../helpers/uniswap";

const contractAddress = "0x43222f934ea5c593a060a6d46772fdbdc2e2cff0";
const factory = "0x02E72c4edf877FBacfD1fC594422004D9746E14D";

const event_fillQuoteEthToToken =
  "event FillQuoteEthToToken(address indexed buyToken,address indexed user,address target,uint256 amountSold,uint256 amountBought,uint256 feeAmount)";
const event_fillQuoteTokenToEth =
  "event FillQuoteTokenToEth(address indexed sellToken,address indexed user,address target,uint256 amountSold,uint256 amountBought,uint256 feeAmount)";
const event_fillQuoteTokenToToken =
  "event FillQuoteTokenToToken(address indexed sellToken,address indexed buyToken,address indexed user,address target,uint256 amountSold,uint256 amountBought,uint8 feeToken,uint256 feeAmount)";

const customLogic = async ({ dailyVolume, dailyFees, fetchOptions }: any) => {
  const options: FetchOptions = fetchOptions;

  const [
    log_fillQuoteEthToToken,
    log_fillQuoteTokenToEth,
    log_fillQuoteTokenToToken,
  ] = await Promise.all([
    options.getLogs({ target: contractAddress, eventAbi: event_fillQuoteEthToToken, }),
    options.getLogs({ target: contractAddress, eventAbi: event_fillQuoteTokenToEth, }),
    options.getLogs({ target: contractAddress, eventAbi: event_fillQuoteTokenToToken, }),
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

  return { dailyVolume, dailyFees };
};

export default uniV2Exports({
  [CHAIN.WC]: { factory, customLogic, start: "2025-04-16" },
})
