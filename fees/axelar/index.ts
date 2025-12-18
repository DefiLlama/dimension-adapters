// fees/axelar/index.ts
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";

const GAS_SERVICE: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
  [CHAIN.ARBITRUM]: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
  [CHAIN.OPTIMISM]: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
  [CHAIN.POLYGON]: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
};

const TOPICS = {
  GasPaidForContractCall: "0x99206760f0be19dd093729bd35e5924daff5e217bcedc5223ed067b60008cf8a",
  GasPaidForContractCallWithToken: "0x8875f9764f28fa82d3e7ff1b80bd5c8f665e1f42fcd8c2faebc7c400a4ba1bbd",
  NativeGasPaidForContractCall: "0x617332c1832058df6ee45fcbdf471251474c9945a8e5d229287a21a5f67ccf0a",
  GasPaidForExpressCall: "0xd171a7eb157e548ca493dd0a16016d125963a369ac5ae3c275ec12c96d527702",
  NativeGasPaidForExpressCall: "0x5cf48f121a0fecaa2c4a64b3eaf482c8c308d5387e161535970f3e9e4363eff6",
};

function extractFeeWei(log: any): BigNumber {
  if (!log?.data || log.data === "0x" || !log.topics?.[0]) return new BigNumber(0);
  const sig = (log.topics[0] as string).toLowerCase();
  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  if (data.length < 64) return new BigNumber(0);

  const last = "0x" + data.slice(-64);
  const secondLast = data.length >= 128 ? "0x" + data.slice(-128, -64) : last;

  if (
    sig === TOPICS.GasPaidForContractCall.toLowerCase() ||
    sig === TOPICS.GasPaidForExpressCall.toLowerCase()
  ) {
    return new BigNumber(last);
  }

  if (sig === TOPICS.GasPaidForContractCallWithToken.toLowerCase()) {
    return new BigNumber(secondLast);
  }

  if (
    sig === TOPICS.NativeGasPaidForContractCall.toLowerCase() ||
    sig === TOPICS.NativeGasPaidForExpressCall.toLowerCase()
  ) {
    return new BigNumber(last);
  }

  return new BigNumber(0);
}

const fetchChain = async (options: FetchOptions) => {
  const { chain, getLogs } = options;
  const target = GAS_SERVICE[chain];

  if (!target) return { dailyFees: "0", dailyUserFees: "0", dailyRevenue: "0" };

  const logs = await getLogs({
    target,
    topics: [[
      TOPICS.GasPaidForContractCall,
      TOPICS.GasPaidForContractCallWithToken,
      TOPICS.NativeGasPaidForContractCall,
      TOPICS.GasPaidForExpressCall,
      TOPICS.NativeGasPaidForExpressCall,
    ]] as any,
  });

  let totalWei = new BigNumber(0);
  for (const log of logs) totalWei = totalWei.plus(extractFeeWei(log));

  const totalTokens = totalWei.dividedBy(1e18);
  const feesStr = totalTokens.toFixed(6);

  return {
    dailyFees: feesStr,
    dailyUserFees: feesStr,
    dailyRevenue: "0",
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: fetchChain, start: "2022-02-01" },
    [CHAIN.ARBITRUM]: { fetch: fetchChain, start: "2022-04-10" },
    [CHAIN.OPTIMISM]: { fetch: fetchChain, start: "2022-05-20" },
    [CHAIN.POLYGON]: { fetch: fetchChain, start: "2022-03-15" },
  },
};

export default adapter;