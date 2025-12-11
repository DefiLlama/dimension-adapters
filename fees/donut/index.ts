import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MINER_ADDRESS = "0xF69614F4Ee8D4D3879dd53d5A039eB3114C794F6";
const MINER_MINED_TOPIC = "0xc7df6706a5d0329f817217dcb0736bff7e6a29909dc28819c1fd4fe198127236";
const TREASURY_FEE_TOPIC = "0x37cc5ab17812d0e5a106defe33d607121c48f562ab71a54d25421e1571b401aa";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

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

  const totalFees = dailyFeesLogs.reduce((acc: Number, log: any) => Number(acc) + Number(log.price), 0);
  const totalTreasury = dailyTreasuryLogs.reduce((acc: Number, log: any) => Number(acc) + Number(log.amount), 0);

  dailyFees.addUSDValue(Number(totalFees) / 1e18);
  dailyRevenue.addUSDValue(Number(totalTreasury) / 1e18);

  const dailySupplySideRevenue = dailyFees.subtract(dailyRevenue);

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
    Fees: 'mining 5% frontend fee',
    Revenue: 'Fees going to the treasury',
    ProtocolRevenue: 'Mining fees going to the protocol',
    SupplySideRevenue: 'fees earned by miners',
  }
};

export default adapter;
