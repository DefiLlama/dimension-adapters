import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.BOBA]: sdk.graph.modifyEndpoint('opoNLKkoTJtLzbPv5pf6XDzQp4XUk9pJfqvgHCUyzqo'),
};

const adapter = univ2Adapter(endpoints, {});

adapter.adapter.boba.start = 1635938988;

export default adapter
