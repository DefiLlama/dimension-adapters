import { BreakdownAdapter } from "../../adapters/types";
import aggregatorAdapter from "../../aggregators/thetis-market-aggregator";
import derivativeAdapter from "./derivative";

const adapter: BreakdownAdapter = {
  breakdown: {
    "thetis-market-derivative": derivativeAdapter["adapter"],
    "thetis-market-aggregator": aggregatorAdapter["adapter"],
  },
};

export default adapter;
