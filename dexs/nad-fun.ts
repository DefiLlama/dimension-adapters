import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const bondingCurve = '0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE'
const abi = {
  "CurveBuy": "event CurveBuy(address indexed sender, address indexed token, uint256 amountIn, uint256 amountOut)",
  "CurveCreate": "event CurveCreate(address indexed creator, address indexed token, address indexed pool, string name, string symbol, string tokenURI, uint256 virtualMon, uint256 virtualToken, uint256 targetTokenAmount)",
  "CurveGraduate": "event CurveGraduate(address indexed token, address indexed pool)",
  "CurveSell": "event CurveSell(address indexed sender, address indexed token, uint256 amountIn, uint256 amountOut)",
}


// https://github.com/Naddotfun/contract-v3-abi
const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()
  const dailyVolume = options.createBalances()
  const dailyRevenue = options.createBalances()

  const creationLogs = await options.getLogs({ target: bondingCurve, eventAbi: abi.CurveCreate })
  const buyLogs = await options.getLogs({ target: bondingCurve, eventAbi: abi.CurveBuy })
  const sellLogs = await options.getLogs({ target: bondingCurve, eventAbi: abi.CurveSell })
  const graduateLogs = await options.getLogs({ target: bondingCurve, eventAbi: abi.CurveGraduate })

  dailyFees.addGasToken(10 * creationLogs.length * 1e18, 'Creation Fees')  // 10 MON per token created
  dailyFees.addGasToken(12_960 * graduateLogs.length * 1e18, 'Graduation Fees')  // 1% of 1,296,000 MON (token marketcap) per token graduated

  buyLogs.forEach(log => {
    const fee = Number(log.amountIn) * 1 / 100  // 1% fee on buys
    dailyFees.addGasToken(fee, 'Buy Fees')
    dailyVolume.addGasToken(Number(log.amountIn))
  })

  sellLogs.forEach(log => {
    const fee = Number(log.amountOut) * 1 / 100  // 1% fee on sells
    dailyFees.addGasToken(fee, 'Sell Fees')
    dailyVolume.addGasToken(log.amountOut)
  })

  dailyRevenue.add(dailyFees)


  return { dailyFees, dailyRevenue, dailyVolume, };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
    },
  },
  version: 2,
  methodology: {
    Fees: "Fees collected from token creations, graduations, buys and sells on the Bonding Curve contract.",
    Revenue: "All collected fees are considered revenue.",
  },
  breakdownMethodology: {
    Fees: {
      'Creation Fees': 'Fees collected from token creations, 10 MON per token created.',
      'Graduation Fees': 'Fees collected from token graduations, 1% of 1,296,000 MON (token marketcap) per token graduated.',
      'Buy Fees': 'Fees collected from token buys, 1% fee on buys.',
      'Sell Fees': 'Fees collected from token sells, 1% fee on sells.',
    },
  }
};

export default adapter;
