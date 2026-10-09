import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const OBV3_ESCROW = "0x890482680C3a0116aBB003B17e7D694D13a6c1eB";
const USDC = ADDRESSES.sxr.USDC;

async function fetch(options: FetchOptions) {
    const escrowBalance = await options.toApi.call({ target: USDC, abi: "erc20:balanceOf", params: [OBV3_ESCROW] });
    const openInterestAtEnd = options.createBalances();
    openInterestAtEnd.addUSDValue(Number(escrowBalance) / 1e6);
    return { openInterestAtEnd };
}

const adapter: SimpleAdapter = {
    version: 2,
    // Open interest is the escrow's USDC balance at the window end. Under pullHourly the runner
    // sums the 24 hourly snapshots, which would report about 24x the real figure.
    pullHourly: false,
    fetch,
    chains: [CHAIN.SXR],
    start: '2026-08-27',
    methodology: {
        OpenInterest: "USDC held by the V3 escrow at the end of the day, which backs matched bets that are not settled yet.",
    },
};

export default adapter;
