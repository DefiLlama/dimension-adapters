import { BreakdownAdapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryEvents } from "../../helpers/sui";

async function getChainData(options: FetchOptions): Promise<FetchResultV2> {
  const events = await queryEvents({
    eventType:
      "0xe27969a70f93034de9ce16e6ad661b480324574e68d15a64b513fd90eb2423e5::position::OrderFilledEvent",
    options,
  });
  const dailyVolume = options.createBalances();

  for (const curr of events) {
    const parsedJson = curr;

    const trading_token_name = "0x" + parsedJson.symbol.base_token.name;
    dailyVolume.add(trading_token_name, Number(parsedJson.position_size));
  }

  return {
    dailyVolume,
  };
}

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    derivatives: {
      [CHAIN.SUI]: {
        fetch: getChainData,
        start: "2025-4-1",
      },
    },
  },
};

export default adapter;
