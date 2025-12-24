import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MINER_ADDRESS = "0xF69614F4Ee8D4D3879dd53d5A039eB3114C794F6";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006"; // WETH on Base

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

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

  let totalTreasuryWei = BigInt(0);
  for (const log of dailyTreasuryLogs) {
    totalTreasuryWei += BigInt(log.amount);
  }

  let totalProviderWei = BigInt(0);
  for (const log of dailyProviderLogs) {
    totalProviderWei += BigInt(log.amount);
  }

  const totalFeesWei = totalTreasuryWei + totalProviderWei;

  dailyFees.add(WETH_ADDRESS, totalFeesWei);
  dailyRevenue.add(WETH_ADDRESS, totalTreasuryWei);
  dailySupplySideRevenue.add(WETH_ADDRESS, totalProviderWei);

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
    Fees: 'Treasury fees (15-20%) + provider fees (0-5%) from mining payments.',
    Revenue: 'Treasury fees from each mining payment (15-20% of payments)',
    ProtocolRevenue: 'Treasury fees from each mining payment (15-20% of payments)',
    SupplySideRevenue: 'provider fees from each mining payment (0-5% of payments)',
  }
};

export default adapter;
