import * as sdk from "@defillama/sdk";
import { Adapter, DISABLED_ADAPTER_KEY } from "../../adapters/types";
import type { ChainEndpoints } from "../../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { CHAIN } from "../../helpers/chains";
import { fetch } from "./seaport";
import disabledAdapter from "../../helpers/disabledAdapter";

const seaportEndpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('kGCuz7xhxMuyRSk8QdnUgijUEqgvhGwkzAVHkbYedCk'),
}

const graphs = (_: ChainEndpoints) => {
  return (_: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const fees = await fetch(timestamp);
      return {
        ...fees,
        timestamp: todaysTimestamp,
      }
    };
  };
};

const adapter: Adapter = {
  version: 1,
  breakdown: {
    v1: {
      [DISABLED_ADAPTER_KEY]: disabledAdapter,
      [CHAIN.ETHEREUM]: disabledAdapter
    },
    v2: {
      [DISABLED_ADAPTER_KEY]: disabledAdapter,
      [CHAIN.ETHEREUM]: disabledAdapter
    },
    seaport: {
      [CHAIN.ETHEREUM]: {
        fetch: graphs(seaportEndpoints)(CHAIN.ETHEREUM),
        start: '2022-06-12',
      },
    }
  }
}

export default adapter;
