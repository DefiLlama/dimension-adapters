import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

// Protocol fee collection accounts for Parrot Finance CDP
const FEE_ACCOUNTS = [
  'AwFV1s3vXqDRXe38YPNqQ23mvQgN88BiEomrQFekP5zT', // Protocol Controlled Reserve
  'EMaPxqea4UzxxyWcmJvfky6w6KCvWigv87KEanshL8Di', // EARN Profits Distributor
  '2MbGB5NQiXPUtnQnh6si6pNLopbiC1NGRSup6FWoy2wd', // PAI Debt Originator
  'E2Z1LARf4JhYB4KM4HM9nZYTkown9UqcDKV7iYDcfwFP', // pBTC Debt Originator
  '7rAdiCgEKtzRie684jct9K1KmMZuatj3CLn7Gtgx7yef', // pSOL Debt Originator
];

const PRT_TOKEN = 'PRT88RkA4Kg5z7pKnezeNH4mafTvtQdfFgpQTGRjz44'; // Exclude governance token

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    targets: FEE_ACCOUNTS,
    blacklist_mints: [PRT_TOKEN]
  });
  
  return { 
    dailyFees,
    dailyRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2021-10-31',
    },
  },
  methodology: {
    Fees: "Fees collected from CDP operations including minting fees for PAI, pBTC, pSOL, interest on debt positions, Interest paid by borrowers, liquidation fees, and EARN vault profits",
    Revenue: "Protocol fees that accrue to Protocol Controlled Reserve and EARN Profits Distributor"
  },
  isExpensiveAdapter: true
};

export default adapter;