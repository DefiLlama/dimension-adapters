import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FACTORY = '0xdf97B25A935EB72378e0C2D4DC15955ecE612b49';

const eventAbis = {
  swap: 'event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, tuple(tuple(address token, uint256 amount) swapFee, tuple(address token, uint256 amount) takerFee, tuple(address token, uint256 amount) wbfFee, tuple(address token, uint256 amount) slippageFee, tuple(address token, uint256 amount) wbrFee) feeDetails)'
};

async function fetch(fetchOptions: FetchOptions) {
  const { api, createBalances } = fetchOptions;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  
  const pools = await api.fetchList({ lengthAbi: 'getPoolCount', itemAbi: 'pools', target: FACTORY });
  
  const logs = await fetchOptions.getLogs({
    targets: pools,
    eventAbi: eventAbis.swap,
  });

  // Current fee distribution ratios from Ryze Protocol
  // Swap Fees: 100% to Holders (distributionAddress)
  // Taker Fees: 100% to Protocol
  // Slippage Fees: 50% Protocol, 50% Holders
  // WBF Fees: 25% Protocol, 25% Holders, 50% Treasury (not considered revenue/fees usually)
  
  logs.forEach((log: any) => {
    // The ethers v6 parsed log returns named arguments in log.args (or directly if mapped by SDK)
    // DefiLlama getLogs with eventAbi puts the parsed args directly on the log object
    const tokenIn = log.tokenIn;
    const amountIn = log.amountIn;
    const feeDetails = log.feeDetails; // This is an array-like Result object containing the 5 tuples
    
    // Arrays matching the tuple structure: [ [token, amount], [token, amount], ... ]
    // Index 0: swapFee, Index 1: takerFee, Index 2: wbfFee, Index 3: slippageFee, Index 4: wbrFee
    const swapFee = { token: feeDetails[0].token || feeDetails[0][0], amount: Number(feeDetails[0].amount || feeDetails[0][1]) };
    const takerFee = { token: feeDetails[1].token || feeDetails[1][0], amount: Number(feeDetails[1].amount || feeDetails[1][1]) };
    const wbfFee = { token: feeDetails[2].token || feeDetails[2][0], amount: Number(feeDetails[2].amount || feeDetails[2][1]) };
    const slippageFee = { token: feeDetails[3].token || feeDetails[3][0], amount: Number(feeDetails[3].amount || feeDetails[3][1]) };
    
    // Add volume
    dailyVolume.add(tokenIn, amountIn);
    
    // Process Swap Fee (100% Holders Revenue)
    if (swapFee.amount > 0) {
      dailyFees.add(swapFee.token, swapFee.amount);
      dailyHoldersRevenue.add(swapFee.token, swapFee.amount);
    }
    
    // Process Taker Fee (100% Protocol Revenue)
    if (takerFee.amount > 0) {
      dailyFees.add(takerFee.token, takerFee.amount);
      dailyProtocolRevenue.add(takerFee.token, takerFee.amount);
    }
    
    // Process WBF Fee (25% Protocol, 25% Holders)
    if (wbfFee.amount > 0) {
      dailyFees.add(wbfFee.token, wbfFee.amount);
      dailyProtocolRevenue.add(wbfFee.token, wbfFee.amount * 0.25);
      dailyHoldersRevenue.add(wbfFee.token, wbfFee.amount * 0.25);
    }
    
    // Process Slippage Fee (50% Protocol, 50% Holders)
    if (slippageFee.amount > 0) {
      dailyFees.add(slippageFee.token, slippageFee.amount);
      dailyProtocolRevenue.add(slippageFee.token, slippageFee.amount * 0.50);
      dailyHoldersRevenue.add(slippageFee.token, slippageFee.amount * 0.50);
    }
  });

  const dailyRevenue = dailyHoldersRevenue.clone();
  dailyRevenue.addBalances(dailyProtocolRevenue);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      pullHourly: true,
      start: '2026-04-01',
      meta: {
        methodology: {
          Volume: "Daily volume is tracked by summing the amountIn of all Swap events across all Ryze pools.",
          Fees: "Daily fees are calculated by summing the swapFee, takerFee, wbfFee, and slippageFee emitted in Swap events.",
          Revenue: "Total Revenue equals Holders Revenue plus Protocol Revenue.",
          HoldersRevenue: "Holders receive 100% of Swap Fees, 25% of WBF Fees, and 50% of Slippage Fees.",
          ProtocolRevenue: "Protocol receives 100% of Taker Fees, 25% of WBF Fees, and 50% of Slippage Fees.",
          SupplySideRevenue: "LPs do not receive direct swap fees; fees are routed to protocol, holders, and treasury."
        }
      }
    }
  }
};

export default adapter;
