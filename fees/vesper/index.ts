import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";

const VSP_TOKEN = "0x1b40183EFB4Dd766f11bda7a7c3ad8982e998421";
const DISTRIBUTOR = "0xd31f42cf356e02689d1720b5ffaa6fc7229d255b";
const COINGECKO_ID = "vesper-finance";
const TRANSFER_EVENT = 'event Transfer(address indexed from, address indexed to, uint256 value)';

const fetch = async (options: FetchOptions) => {
  const dailyRevenue = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: VSP_TOKEN,
    eventAbi: TRANSFER_EVENT,
    fromBlock: options.fromBlock,
    toBlock: options.toBlock,
  });

  logs.forEach((log: any) => {
    const to = log.to?.toLowerCase();
    const amount = Number(log.value) / 1e18;

    if (to === DISTRIBUTOR.toLowerCase()) {
      dailyRevenue.addCGToken(COINGECKO_ID, amount);
      dailyFees.addCGToken(COINGECKO_ID, amount);
      dailyHoldersRevenue.addCGToken(COINGECKO_ID, amount);
    }
  });

  return {
    dailyRevenue,
    dailyFees,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 1691558400, // Aug 9, 2023
      meta: {
        methodology: {
          Fees: "Tracks VSP deposited into the distributor contract.",
          Revenue: "Tracks VSP deposited into the distributor contract for esVSP lockers.",
          Holders: "Assumes all VSP sent to distributor is for holders.",
        },
      },
    },
  },
};

export default adapter;