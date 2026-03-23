import { CHAIN } from "../helpers/chains";
import { ProtocolType, SimpleAdapter } from "../adapters/types";
import { etherscanFeeAdapter } from "../helpers/etherscanFees";

const adapter: SimpleAdapter = {
  ...etherscanFeeAdapter(
    CHAIN.MEGAETH,
    'https://mega.etherscan.io/chart/transactionfee?output=csv',
    'ethereum'
  ),
  start: '2026-01-30',
};

export default adapter;
