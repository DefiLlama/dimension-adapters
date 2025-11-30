import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const bondingCurve = '0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE'
const lpManager = '0xAebe5522749b65eaE7b2A35c593145CC3128b515'

const abi = {
  "CurveBuy": "event CurveBuy(address indexed sender, address indexed token, uint256 amountIn, uint256 amountOut)",
  "CurveCreate": "event CurveCreate(address indexed creator, address indexed token, address indexed pool, string name, string symbol, string tokenURI, uint256 virtualMon, uint256 virtualToken, uint256 targetTokenAmount)",
  "CurveGraduate": "event CurveGraduate(address indexed token, address indexed pool)",
  "CurveSell": "event CurveSell(address indexed sender, address indexed token, uint256 amountIn, uint256 amountOut)",
  "LpManagerCollect": "event LpManagerCollect(address indexed token, address indexed pool, uint256 monAmount, uint256 tokenAmount, uint256 lastCollectTime)", 
}


const metrics = {
  CreationFees: 'Creation Fees',
  GraduationFees: 'Graduation Fees',
  LpManagerCollect: 'LP Manager Collect',
  BuyFees: 'Buy Fees',
  SellFees: 'Sell Fees',
}

// https://github.com/Naddotfun/contract-v3-abi
const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()
  const dailyVolume = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const creationLogs = await options.getLogs({ target: bondingCurve, eventAbi: abi.CurveCreate })
  const buyLogs = await options.getLogs({ target: bondingCurve, eventAbi: abi.CurveBuy })
  const sellLogs = await options.getLogs({ target: bondingCurve, eventAbi: abi.CurveSell })
  const graduateLogs = await options.getLogs({ target: bondingCurve, eventAbi: abi.CurveGraduate })
  const lpManagerCollectLogs = await options.getLogs({ target: lpManager, eventAbi: abi.LpManagerCollect })

  dailyFees.addGasToken(10 * creationLogs.length * 1e18, metrics.CreationFees)  // 10 MON per token created
  dailyFees.addGasToken(3_000 * graduateLogs.length * 1e18, metrics.GraduationFees) // 3_000 MON per token graduated
  dailyRevenue.addGasToken(10 * creationLogs.length * 1e18, metrics.CreationFees)  // 10 MON per token created
  dailyRevenue.addGasToken(3_000 * graduateLogs.length * 1e18, metrics.GraduationFees) // 3_000 MON per token graduated
  
  lpManagerCollectLogs.forEach((log) => {
    const collectFee = Number(log.monAmount);
    dailyFees.addGasToken(collectFee, metrics.LpManagerCollect); // 40% goes to Foundation, 30% goes to Community, 30% goes to Creator
    dailyRevenue.addGasToken(collectFee * 0.4, metrics.LpManagerCollect); // 40% of collected Fees goes to Foundation Treasury
    dailySupplySideRevenue.addGasToken(collectFee * 0.6, metrics.LpManagerCollect); // 30% goes to Community, 30% goes to Creator
  });

  buyLogs.forEach(log => {
    const fee = Number(log.amountIn) * 1 / 100  // 1% fee on buys
    dailyFees.addGasToken(fee, metrics.BuyFees)
    dailyRevenue.addGasToken(fee, metrics.BuyFees)
    dailyVolume.addGasToken(Number(log.amountIn))
  })

  sellLogs.forEach(log => {
    const fee = Number(log.amountOut) * 1 / 100  // 1% fee on sells
    dailyFees.addGasToken(fee, metrics.SellFees)
    dailyRevenue.addGasToken(fee, metrics.SellFees)
    dailyVolume.addGasToken(log.amountOut)
  })


  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue, };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
    },
  },
  version: 2,
  methodology: {
    Fees: "Protocol fees are generated from Bonding Curve token actions (create, buy, sell, graduate) and from post-graduation LP manager fee collections.",
    Revenue: "All fees generated on the Bonding Curve itself (create, buy, sell, graduate) are counted as protocol revenue. For post-graduation LP manager collections, only 40% of the collected amount (the Foundation share) is treated as protocol revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [metrics.CreationFees]: '10 MON fee charged when a new token is created on the Bonding Curve.',
      [metrics.GraduationFees]: 'Flat 3,000 MON fee charged when a token graduates from the Bonding Curve to the DEX pool.',
      [metrics.BuyFees]: "1% fee charged on the MON input amount for Bonding Curve buy trades.",
      [metrics.SellFees]: "1% fee charged on the token output amount for Bonding Curve sell trades.",
      [metrics.LpManagerCollect]: "Fees collected by the LP Manager on graduated pools.",
    },
    Revenue: {
      [metrics.CreationFees]: '10 MON fee charged when a new token is created on the Bonding Curve.',
      [metrics.GraduationFees]: 'Flat 3,000 MON fee charged when a token graduates from the Bonding Curve to the DEX pool.',
      [metrics.BuyFees]: "1% fee charged on the MON input amount for Bonding Curve buy trades.",
      [metrics.SellFees]: "1% fee charged on the token output amount for Bonding Curve sell trades.",
      [metrics.LpManagerCollect]: "40% of fees collected by the LP Manager on graduated pools.",
    },
    SupplySideRevenue: {
      [metrics.LpManagerCollect]: "40% of fees collected by the LP Manager on graduated pools to community and creators.",
    },
  }
};

export default adapter;
