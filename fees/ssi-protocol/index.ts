import { Adapter, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// 定义合约地址数组
const contractAddresses = [
  "0x9E6A46f294bB67c20F1D1E7AfB0bBEf614403B55",
  "0x164ffdaE2fe3891714bc2968f1875ca4fA1079D0",
  "0xdd3acDBDc7b358Df453a6CB6bCA56C92aA5743aA",
];

const eventAbiString = "event SetFeeTokenset(tuple(string chain, string symbol, string addr, uint8 decimals, uint256 amount)[] feeTokenset)";
const GASTOKEN_MAPPING: Record<string, string> = {
  ETH: "ethereum",
  BTC: "bitcoin",
  SOL: "solana",
  DOGE: "dogecoin",
  XRP: "ripple",
  ADA: "cardano",
  BSC_BNB: "binancecoin",
}
const CHAIN_MAPPING: Record<string, string> = {
  ETH: "ethereum",
  BTC: "bitcoin",
  SOL: "solana",
  DOGE: "doge",
  XRP: "ripple",
  ADA: "cardano",
  BSC_BNB: "bsc",
}

async function processContract(getLogs: any, createBalances: any, contractAddress: string, endTimestamp: number, getBlock: any) {
  const dailyFees = createBalances();
  const dailyRevenue = dailyFees;
  const endDate = new Date(endTimestamp * 1000);
  const logdayStart = new Date(endDate);
  logdayStart.setUTCDate(endDate.getUTCDate() - 7);
  const dayStart = new Date(endDate);
  dayStart.setUTCDate(endDate.getUTCDate() - 1);
  const logstartTime = Math.floor(logdayStart.getTime() / 1000);
  const logendTime = Math.floor(endDate.getTime() / 1000);
  const startTime = Math.floor(dayStart.getTime() / 1000);
  const [startBlock, endBlock, firstBlock] = await Promise.all([
    getBlock(logstartTime, CHAIN.BASE, {}),
    getBlock(logendTime, CHAIN.BASE, {}),
    getBlock(startTime, CHAIN.BASE, {})
  ]);
  const logWithblocknumber = await getLogs({
    target: contractAddress,
    eventAbi: eventAbiString,
    fromBlock: startBlock,
    toBlock: endBlock,
    entireLog: true
  });
  const logs = await getLogs({
    target: contractAddress,
    eventAbi: eventAbiString,
    fromBlock: startBlock,
    toBlock: endBlock,
  });
  if (logs.length < 2) {
    return {
      dailyFees,
      dailyRevenue,
    };
  }
  const createTokenMap = (log: any) => {
    const map = new Map<string, { amount: bigint; decimals: number; address: string; chain: string; rawaddress: string;}>();
    log[0].forEach((token: any) => {
      const chain = token[0].toString();
      const symbol = token[1].toString();
      const decimals = Number(token[3]) || 18;
      const amount = BigInt(token[4].toString());
      const rawAddress = token[2].toString();
      let address;
      let rawaddress;
      if (!rawAddress || rawAddress === '') {
        address = GASTOKEN_MAPPING[chain];
        rawaddress = "";
      } else {
        address = CHAIN_MAPPING[chain] + ':' + rawAddress;
        rawaddress = address;
      }
      map.set(symbol, { amount, decimals, address, chain, rawaddress});
    });
    return map;
  };

  for (let i = logs.length - 1; i > 0; i--) {
    const currentLog = logs[i];
    const currentMap = createTokenMap(currentLog);
    const previousLog = logs[i - 1];
    const previousMap = createTokenMap(previousLog);
    let hasNegativeDelta = false; // 标记是否有delta < 0
    currentMap.forEach((current, symbol) => {
      const previous = previousMap.get(symbol);
      if (!previous) return;
      const delta = current.amount - previous.amount;
      if (delta < 0n) {
        hasNegativeDelta = true;
      }
    });
    if (hasNegativeDelta) {
      continue;
    }
    // 判断 currentLog blocknumber是否为当日
    if (logWithblocknumber[i].blockNumber < firstBlock) {
      continue
    }
    currentMap.forEach((current, symbol) => {
      const previous = previousMap.get(symbol);
      if (!previous) return;
      const delta = current.amount - previous.amount;
      const token_decimal = Number(current.decimals);
      if (delta > 0n) {
        let actualAmount;
        if (current.rawaddress !== "") {
          actualAmount = Number(delta);
        } else {
          actualAmount = Number(delta) / 10 ** token_decimal;
        }
        if (current.chain === "BASE") {
          dailyFees.addToken(current.address, actualAmount);
        } else {
          dailyFees.addToken(current.address, actualAmount, {
            skipChain: true
          });
        }
      }
    });
    break
  }
  return { dailyFees, dailyRevenue };
}

export default {
  adapter: {
    [CHAIN.BASE]: {
      fetch: (async ({ getLogs, createBalances, endTimestamp, getBlock }) => {
        // 创建总余额容器
        const totalFees = createBalances();
        const totalRevenue = createBalances();

        // 并行处理所有合约
        await Promise.all(contractAddresses.map(async (address) => {
          const { dailyFees, dailyRevenue } = await processContract(
            getLogs,
            createBalances,
            address,
            endTimestamp,
            getBlock
          );

          totalFees.addBalances(dailyFees);
          totalRevenue.addBalances(dailyRevenue);
        }));

        return {
          dailyFees: totalFees,
          dailyRevenue: totalRevenue
        };
      }) as FetchV2,
    },
  },
  version: 2,
} as Adapter;