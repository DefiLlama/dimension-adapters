import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Miner fees: treasury + provider fees (20% of price)
// Auction fees: LP tokens burned
// Governance fees: tokens paid to acquire WETH from DAO strategies (dynamically fetched)

const MINER_ADDRESS = "0xF69614F4Ee8D4D3879dd53d5A039eB3114C794F6";
const AUCTION_ADDRESS = "0xC23E316705Feef0922F0651488264db90133ED38";
const VOTER_ADDRESS = "0x1fAfC7Ec84ee588F1836833a4217b8a3e6632522";

// Token addresses on Base
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const LP_TOKEN_ADDRESS = "0xD1DbB2E56533C55C3A637D13C53aeEf65c5D5703"; // DONUT/WETH LP

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // 1. Miner fees (treasury + provider)
  const dailyTreasuryLogs = await options.getLogs({
    target: MINER_ADDRESS,
    eventAbi: "event Miner__TreasuryFee(address indexed treasury, uint256 amount)",
    onlyArgs: true,
  });

  const dailyProviderLogs = await options.getLogs({
    target: MINER_ADDRESS,
    eventAbi: "event Miner__ProviderFee(address indexed provider, uint256 amount)",
    onlyArgs: true,
  });

  // 2. Old Auction LP token burns
  const dailyAuctionLogs = await options.getLogs({
    target: AUCTION_ADDRESS,
    eventAbi: "event Auction__Buy(address indexed buyer, address indexed assetsReceiver, uint256 paymentAmount)",
    onlyArgs: true,
  });

  // 3. Dynamically fetch all governance strategies from Voter contract
  const strategies: string[] = await options.api.call({
    target: VOTER_ADDRESS,
    abi: "function getStrategies() external view returns (address[])",
  });

  // Get payment token for each strategy
  const paymentTokens: string[] = await Promise.all(
    strategies.map((strategy: string) =>
      options.api.call({
        target: strategy,
        abi: "function paymentToken() external view returns (address)",
      })
    )
  );

  // Fetch Strategy__Buy events from all strategies
  const strategyLogsPromises = strategies.map((addr: string) =>
    options.getLogs({
      target: addr,
      eventAbi: "event Strategy__Buy(address indexed buyer, address indexed assetsReceiver, uint256 revenueAmount, uint256 paymentAmount)",
      onlyArgs: true,
    })
  );
  const allStrategyLogs = await Promise.all(strategyLogsPromises);

  // Sum miner fees
  let totalTreasuryWei = BigInt(0);
  for (const log of dailyTreasuryLogs) {
    totalTreasuryWei += BigInt(log.amount);
  }

  let totalProviderWei = BigInt(0);
  for (const log of dailyProviderLogs) {
    totalProviderWei += BigInt(log.amount);
  }

  // Sum auction LP burns
  let totalAuctionLpWei = BigInt(0);
  for (const log of dailyAuctionLogs) {
    totalAuctionLpWei += BigInt(log.paymentAmount);
  }

  // Add WETH fees from mining
  dailyFees.add(WETH_ADDRESS, totalTreasuryWei + totalProviderWei);
  dailyRevenue.add(WETH_ADDRESS, totalTreasuryWei);
  dailySupplySideRevenue.add(WETH_ADDRESS, totalProviderWei);

  // Add LP tokens burned from old auction
  dailyFees.add(LP_TOKEN_ADDRESS, totalAuctionLpWei);
  dailyRevenue.add(LP_TOKEN_ADDRESS, totalAuctionLpWei);

  // Add governance strategy payments (tokens paid to DAO)
  for (let i = 0; i < strategies.length; i++) {
    const logs = allStrategyLogs[i];
    const paymentToken = paymentTokens[i];

    let totalPayment = BigInt(0);
    for (const log of logs) {
      totalPayment += BigInt(log.paymentAmount);
    }

    if (totalPayment > 0) {
      dailyFees.add(paymentToken, totalPayment);
      dailyRevenue.add(paymentToken, totalPayment);
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BASE],
  start: '2025-11-07',
  methodology: {
    Fees: 'Mining fees (treasury 15-20% + provider 0-5%), LP tokens burned via auction, and tokens paid through governance strategies (DONUT, LP, USDC, cbBTC).',
    Revenue: 'Treasury fees + LP burned + governance strategy payments to DAO',
    ProtocolRevenue: 'Treasury fees + LP burned + governance strategy payments to DAO',
    SupplySideRevenue: 'Provider fees from mining payments (0-5%)',
  }
};

export default adapter;
