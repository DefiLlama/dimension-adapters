import {
  FetchResult,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

const FACTORY = "0xE7206Ecac3A51afe7e6179182ad4130A26068dD1";
const START = "2026-07-10";

const rootOptions = {
  pullHourly: true,
  methodology: {
    Volume:
      "Swap volume from SwapHood V2 pairs on Robinhood Chain. Pairs are TVL-filtered before their Swap logs are queried.",
  },
};

const adapter: SimpleAdapter = uniV2Exports(
  {
    [CHAIN.ROBINHOOD]: {
      factory: FACTORY,
      start: START,
      allowReadPairs: true,
      customLogic: ({ dailyVolume }: FetchResult) => ({
        dailyVolume,
      }),
    },
  },
  rootOptions,
);

export default adapter;
