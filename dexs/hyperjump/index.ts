import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0xac653ce27e04c6ac565fd87f18128ad33ca03ba2' }), start: '2020-11-10' },
    [CHAIN.FANTOM]: { fetch: getUniV2LogAdapter({ factory: '0x991152411A7B5A14A8CF0cDDE8439435328070dF' }), start: '2021-04-19' },
    [CHAIN.METIS]: { fetch: getUniV2LogAdapter({ factory: '0xAA1504c878B158906B78A471fD6bDbf328688aeB' }), start: '2022-05-04' },
  },
}

export default adapter;
