import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  getTimestampAtStartOfDayUTC,
  getTimestampAtStartOfNextDayUTC,
} from "../../utils/date";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const topic0NewTransferAdded =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type TAddress = {
  [l: string | Chain]: string;
};

const address: TAddress = {
  [CHAIN.ARBITRUM]: "0x282e51D8E5812adbff5751DA50a36A9A6a0eC6F2",
};

interface ITx {
  data: string;
  transactionHash: string;
  topics: string[];
}

interface IData {
  contract_address: string;
  amount: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: any): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp.fromTimestamp;
    const toTimestamp = timestamp.toTimestamp;
    const fromBlock = await getBlock(fromTimestamp, chain, {});
    const toBlock = await getBlock(toTimestamp, chain, {});
    console.log("target", address[chain]);

    console.log({ fromBlock, toBlock });
    const logs: ITx[] = (
      await sdk.getEventLogs({
        target: address[chain],
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [topic0NewTransferAdded],
        chain,
      })
    ).map((e: any) => {
      return {
        data: e.data.replace("0x", ""),
        transactionHash: e.transactionHash,
        topics: e.topics,
      } as ITx;
    });
    console.log(logs);

    const raw_data_logs: IData[] = logs.map((tx: ITx) => {
      const amount = Number("0x" + tx.data);
      const address = tx.topics[1];
      const contract_address = "0x" + address.slice(26, address.length);
      return {
        amount,
        contract_address,
        tx: tx.transactionHash,
      };
    });
    console.log({ raw_data_logs });
    const feesAmuntsUSD: any[] = raw_data_logs.map((d: any) => {
      return { amount: d.amount / 10 ** 18, tx: d.tx, a: d.contract_address }; // debug
    });
    const dailyFee = feesAmuntsUSD.reduce(
      (a: number, b: any) => a + b.amount,
      0
    );
    const supplySideRev = dailyFee;
    const dailyHoldersRevenue = dailyFee;
    const protocolRev = dailyFee;
    console.log({ dailyFee });

    return {
      dailyFees: dailyFee.toString(),
      dailySupplySideRevenue: supplySideRev.toString(),
      dailyHoldersRevenue: dailyHoldersRevenue.toString(),
      dailyProtocolRevenue: protocolRev.toString(),
      dailyRevenue: (protocolRev + dailyHoldersRevenue).toString(),
      timestamp,
    };
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 210487219,
    },
  },
};

export default adapter;
