import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

// Protocol fee collection accounts
const PROTOCOL_FEE_ACCOUNTS = [
  'AwFV1s3vXqDRXe38YPNqQ23mvQgN88BiEomrQFekP5zT', // Protocol Controlled Reserve
  '2MbGB5NQiXPUtnQnh6si6pNLopbiC1NGRSup6FWoy2wd', // PAI Debt Originator
  'E2Z1LARf4JhYB4KM4HM9nZYTkown9UqcDKV7iYDcfwFP', // pBTC Debt Originator
  '7rAdiCgEKtzRie684jct9K1KmMZuatj3CLn7Gtgx7yef', // pSOL Debt Originator
];

// EARN vault accounts where LP rewards are distributed
const EARN_WALLET_ACCOUNTS = [
  '36swmX3oraDDNQ1tDXHDefPmGREZuo1KFH77NEvdXKQr', // USDC:PAI+EARN
  '35j2STGDvjwkG8uBZBBkmW7JMJYa4hAAxxEXhs14n5tc', // MER LP (USDC-USDT-UST):PAI+EARN
  '7ScRkHBwAFwqHPqetMRfnxkmBMBYNVbo9CSEH6wK1Vge', // MER LP (pSOL-SOL):PAI+EARN
  'FTUFAHGQEDBgGA6GjRogas1LW4s4HmyUebTjVJQSv8rN', // SBR LP (USDC-USDT):PAI+EARN
  'PU6dC57WT8QRxZb4Z3tcLEPw2xszskKmobQBqqemZkh',  // SBR LP (mSOL-SOL):PAI+EARN
  '6Pv7Z8bRYXEYYabXvnLyTW6qRpwmuHTB1uFhdnKeSXgy', // SBR LP (UST-USDC):PAI+EARN
  'Gmzr6b6iPWKvWQtCmqL9yB6hYGec8Rv3XksmMT2VThDg', // SBR LP (BTC-renBTC):pBTC+EARN
  '33iF7hwwmaJbu28ZueTQNmXFjXmNSNrQfRyj8i16MZEY', // SBR LP (prtSOL-SOL):pSOL+EARN
];

const PRT_TOKEN = 'PRT88RkA4Kg5z7pKnezeNH4mafTvtQdfFgpQTGRjz44';

const fetch = async (options: FetchOptions) => {
  // Protocol revenue
  const dailyRevenue = await getSolanaReceived({
    options,
    targets: PROTOCOL_FEE_ACCOUNTS,
    blacklist_mints: [PRT_TOKEN]
  });

  // Supply side revenue (EARN vault LP rewards)
  const dailySupplySideRevenue = await getSolanaReceived({
    options,
    targets: EARN_WALLET_ACCOUNTS,
    blacklist_mints: [PRT_TOKEN]
  });

  // Calculate total fees = protocol revenue + supply side revenue
  const allTokens = new Set([
    ...Object.keys(dailyRevenue),
    ...Object.keys(dailySupplySideRevenue)
  ]);

  const dailyFees = {} as typeof dailyRevenue;
  allTokens.forEach(token => {
    const protocolAmount = Number(dailyRevenue[token] || 0);
    const supplySideAmount = Number(dailySupplySideRevenue[token] || 0);
    dailyFees[token] = (protocolAmount + supplySideAmount).toString();
  });

  return { 
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
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
    Fees: "Total fees collected from CDP operations including minting fees, interest on debt positions, liquidation fees, and EARN vault profits. dailyFees = dailyRevenue + dailySupplySideRevenue",
    Revenue: "Protocol fees that accrue to Protocol Controlled Reserve and debt originators",
    SupplySideRevenue: "Interest and fees distributed to EARN vault liquidity providers through EARN wallet accounts"
  },
  isExpensiveAdapter: true
};

export default adapter;