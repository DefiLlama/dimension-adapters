import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";

const contractAddress = "0x43222f934ea5c593a060a6d46772fdbdc2e2cff0";
const WLD_ADDRESS = "0x2cfc85d8e48f8eab294be644d9e25c3030863003";
const NATIVE_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const event_fillQuoteEthToToken =
  "event FillQuoteEthToToken(address indexed buyToken,address indexed user,address target,uint256 amountSold,uint256 amountBought,uint256 feeAmount)";
const event_fillQuoteTokenToEth =
  "event FillQuoteTokenToEth(address indexed sellToken,address indexed user,address target,uint256 amountSold,uint256 amountBought,uint256 feeAmount)";
const event_fillQuoteTokenToToken =
  "event FillQuoteTokenToToken(address indexed sellToken,address indexed buyToken,address indexed user,address target,uint256 amountSold,uint256 amountBought,uint8 feeToken,uint256 feeAmount)";

const fetch = async (options: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);

  const [
    log_fillQuoteEthToToken,
    log_fillQuoteTokenToEth,
    log_fillQuoteTokenToToken,
  ] = await Promise.all([
    options.getLogs({
      target: contractAddress,
      eventAbi: event_fillQuoteEthToToken,
      fromBlock,
      toBlock,
    }),
    options.getLogs({
      target: contractAddress,
      eventAbi: event_fillQuoteTokenToEth,
      fromBlock,
      toBlock,
    }),
    options.getLogs({
      target: contractAddress,
      eventAbi: event_fillQuoteTokenToToken,
      fromBlock,
      toBlock,
    }),
  ]);

  const logs = [
    ...log_fillQuoteEthToToken,
    ...log_fillQuoteTokenToEth,
    ...log_fillQuoteTokenToToken,
  ];

  const volumeByDay: Record<string, number> = {};
  const tokenAddresses: Set<string> = new Set();

  const logData: {
    date: string;
    token: string;
    amount: bigint;
  }[] = [];

  for (const log of logs) {
    const { args } = log;
    let calToken = "";
    let amount = BigInt(0);

    if ("feeToken" in args) {
      if (args.buyToken.toLowerCase() === WLD_ADDRESS) {
        calToken = args.buyToken.toLowerCase();
        amount = args.amountBought;
      } else if (args.sellToken.toLowerCase() === WLD_ADDRESS) {
        calToken = args.sellToken.toLowerCase();
        amount = args.amountSold;
      } else if (Number(args.feeToken) === 0) {
        calToken = args.buyToken.toLowerCase();
        amount = args.amountBought;
      } else {
        calToken = args.sellToken.toLowerCase();
        amount = args.amountSold;
      }
    } else if (args.buyToken?.toLowerCase() === NATIVE_ADDRESS) {
      calToken = NATIVE_ADDRESS;
      amount = args.amountBought;
    } else if (args.sellToken?.toLowerCase() === NATIVE_ADDRESS) {
      calToken = NATIVE_ADDRESS;
      amount = args.amountSold;
    }

    if (!calToken || amount === BigInt(0)) continue;

    const date = new Date(log.blockTimestamp * 1000).toISOString().slice(0, 10);
    logData.push({ date, token: calToken, amount });
    tokenAddresses.add(calToken);
  }

  const priceMap = await getPrices([...tokenAddresses], options.startTimestamp);

  for (const { date, token, amount } of logData) {
    const priceInfo = priceMap[token];
    if (!priceInfo?.price) continue;

    const usdVolume =
      (Number(amount) * priceInfo.price) / 10 ** (priceInfo.decimals ?? 18);
    volumeByDay[date] = (volumeByDay[date] || 0) + usdVolume;
  }

  const totalVolume = Object.values(volumeByDay).reduce(
    (acc, val) => acc + val,
    0
  );

  const lastDate = Object.keys(volumeByDay).sort().pop();
  const lastDayVolume = lastDate ? volumeByDay[lastDate] : 0;

  return {
    dailyVolume: lastDayVolume,
    totalVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.WC]: {
      fetch,
      start: "2025-04-16",
      meta: {
        methodology: {
          totalVolume:
            "Volume is calculated by summing the token volume of all trades settled on the protocol since launch.",
          dailyVolume:
            "Volume is calculated by summing the token volume of all trades settled on the protocol that day.",
        },
      },
    },
  },
};

export default adapter;
