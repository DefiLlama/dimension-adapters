import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { id, zeroPadValue } from "ethers";

const ONE_INCH_AGGREGATOR = "0x111111125421cA6dc452d289314280a0f8842A65";
const PROXY_TRADE_ADDRESS_POL = "0xbec2b1fd0aa1f13046be83547abf227470290693";
const PROXY_TRADE_ADDRESS_ETH = "0x43f46e43a7c186ec898C8fECE5325A83DD3C822b";
const SYNTH_TREASURY_POL = "0x1FC39644C58396e567aa44840cF5E5c9696a9a1c";
const SYNTH_TREASURY_ETH = "0x23Ca477089466Ac4D563a89E4F0df8C46B92735d";

const methodology = {
  Fees: "A 0.15% fee is charged to users on every swap.",
};

function getParams(chain: string) {
  switch (chain) {
    case CHAIN.POLYGON:
      return [PROXY_TRADE_ADDRESS_POL, SYNTH_TREASURY_POL];
    case CHAIN.ETHEREUM:
      return [PROXY_TRADE_ADDRESS_ETH, SYNTH_TREASURY_ETH];
    default:
      throw new Error("Chain not found!");
  }
}

function groupLogsByTransactionHash(logs: any) {
  return logs.reduce((acc: any, log: any) => {
    if (!acc[log.transactionHash]) {
      acc[log.transactionHash] = [];
    }
    acc[log.transactionHash].push(log);
    return acc;
  }, {});
}

const fetch: any = async (options: FetchOptions) => {
  const [proxyTrade, synthTreasury] = getParams(options.chain);
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({
    topics: [
      id("Transfer(address,address,uint256)"),
      null as any,
      zeroPadValue(proxyTrade.toLowerCase(), 32),
    ],
    noTarget: true,
  });

  const reducedLogs: Record<string, any> = groupLogsByTransactionHash(logs);

  for (const logs of Object.values(reducedLogs)) {
    let log = logs.find(
      (l: any) => l.topics[1] === zeroPadValue(synthTreasury.toLowerCase(), 32)
    );

    if (!log && logs.length === 2) {
      log = logs.find(
        (l: any) =>
          l.topics[1] !== zeroPadValue(ONE_INCH_AGGREGATOR.toLowerCase(), 32)
      );
    }

    if (log) {
      const fee = (BigInt(log.data) * BigInt(150)) / BigInt(1000);
      dailyVolume.add(log.address, log.data);
      dailyFees.add(log.address, fee);
    }
  }

  return { dailyVolume, dailyFees };
};

export default {
  version: 2,
  pullHourly: true,
  methodology,
  fetch,
  adapter: {
    [CHAIN.POLYGON]: { start: '2025-01-21', },
    [CHAIN.ETHEREUM]: { start: '2025-01-10', },
  },
};
