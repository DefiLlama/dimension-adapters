import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const PSWAP_CONTRACT = "0x3D084Fc4Cc4D5A0B8d6B6517341f359505b35336";
const PGOLD = "0x3e76BB02286BFeAA89DD35f11253f2CbCE634F91";
const PUSD = "0xC8Fb643D18F1e53698CFDa5c8Fdf0cdC03C1dBec"

const swapPGOLDToPUSD = "event SwapPGOLDToPUSD(address user, uint256 inAmount, uint256 outAmount, uint256 fee)";
const swapPUSDToPGOLD = "event SwapPUSDToPGOLD(address user, uint256 inAmount, uint256 outAmount, uint256 fee)";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const [pGoldToPUSDLogs, pUSDToPGOLDLogs] = await Promise.all([
        options.getLogs({ target: PSWAP_CONTRACT, eventAbi: swapPGOLDToPUSD }),
        options.getLogs({ target: PSWAP_CONTRACT, eventAbi: swapPUSDToPGOLD }),
    ]);

    // SwapPGOLDToPUSD: fee is in PUSD (18 decimals, USD-pegged)
    for (const log of pGoldToPUSDLogs) {
        dailyFees.add(PUSD, log.fee);
    }

    // SwapPUSDToPGOLD: fee is in PGOLD
    for (const log of pUSDToPGOLDLogs) {
        dailyFees.add(PGOLD, log.fee);
    }

    return { dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2025-10-29',
        }
    },
    methodology: {
        Fees: "Fees collected on PGOLD<>PUSD swaps via the Pleasing Golden spot market.",
        Revenue: "No revenue",
        SupplySideRevenue: "All the fees collected on PGOLD<>PUSD swaps generates yield for PGOLD stakers.",
    }
};

export default adapter;
