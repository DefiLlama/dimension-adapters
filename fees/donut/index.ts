import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MINER_ADDRESS = "0xF69614F4Ee8D4D3879dd53d5A039eB3114C794F6";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006"; // WETH on Base
const MINER_MINED_TOPIC = "0xc7df6706a5d0329f817217dcb0736bff7e6a29909dc28819c1fd4fe198127236";
const TREASURY_FEE_TOPIC = "0x37cc5ab17812d0e5a106defe33d607121c48f562ab71a54d25421e1571b401aa";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const dailyFeesLogs = await options.getLogs({
    target: MINER_ADDRESS,
    topic: MINER_MINED_TOPIC,
    eventAbi: "event Miner__Mined(address indexed sender, address indexed miner, uint256 price, string uri)",
    onlyArgs: true,
  });

  const dailyTreasuryLogs = await options.getLogs({
    target: MINER_ADDRESS,
    topic: TREASURY_FEE_TOPIC,
    eventAbi: "event Miner__TreasuryFee(address indexed treasury, uint256 amount)",
    onlyArgs: true,
  });

  // Sum fees in wei (BigInt for precision)
  let totalFeesWei = BigInt(0);
  for (const log of dailyFeesLogs) {
    totalFeesWei += BigInt(log.price);
  }

  let totalTreasuryWei = BigInt(0);
  for (const log of dailyTreasuryLogs) {
    totalTreasuryWei += BigInt(log.amount);
  }

  const supplySideWei = totalFeesWei - totalTreasuryWei;

  // Add as WETH so DefiLlama prices it correctly in USD
  dailyFees.add(WETH_ADDRESS, totalFeesWei);
  dailyRevenue.add(WETH_ADDRESS, totalTreasuryWei);
  dailySupplySideRevenue.add(WETH_ADDRESS, supplySideWei);

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
    Fees: 'Total WETH payments for mining donuts',
    Revenue: 'Treasury fees (15% of payments)',
    ProtocolRevenue: 'Treasury fees (15% of payments)',
    SupplySideRevenue: 'Fees to miners (80%) and frontend providers (5%)',
  }
};

export default adapter;
