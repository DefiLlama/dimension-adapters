import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.BOBA]: sdk.graph.modifyEndpoint('opoNLKkoTJtLzbPv5pf6XDzQp4XUk9pJfqvgHCUyzqo'),
};

const fetch = univ2Adapter({
  endpoints,
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.BOBA],
  start: 1635938988,
}

export default adapter;