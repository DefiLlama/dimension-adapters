import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const PSWAP_CONTRACTS: Record<string, string[]>  = {
    [CHAIN.ARBITRUM]: ["0x3D084Fc4Cc4D5A0B8d6B6517341f359505b35336"],
    [CHAIN.PHAROS]: ["0xee860417fc843a7191d88c62b2937bb891b24bc6"],
}
const PGOLD: Record<string, string> = {
    [CHAIN.ARBITRUM]: "0x3e76BB02286BFeAA89DD35f11253f2CbCE634F91",
    [CHAIN.PHAROS]: "0x531f1e4a3ca96b9f42467659d8088b07fe8d2839",
}
const PUSD = "0xC8Fb643D18F1e53698CFDa5c8Fdf0cdC03C1dBec"
const USDPM: Record<string, string> = {
    [CHAIN.ARBITRUM]: "0x0122947b771672e4ed24c6b8959202fc5171ac77",
    [CHAIN.PHAROS]: "0x16a7228ac1e772c5029d7069f3a6eca66f894218",
}

const swapPGOLDToPUSD = "event SwapPGOLDToPUSD(address user, uint256 inAmount, uint256 outAmount, uint256 fee)";
const swapPUSDToPGOLD = "event SwapPUSDToPGOLD(address user, uint256 inAmount, uint256 outAmount, uint256 fee)";
const swapPGOLDToUSDPM = "event SwapPGOLDToUSDpm(address user , uint256 inAmount , uint256 outAmount , uint256 fee)";
const swapUSDPMToPGOLD = "event SwapUSDpmToPGOLD(address user , uint256 inAmount , uint256 outAmount , uint256 fee)"

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const contracts = PSWAP_CONTRACTS[options.chain]

    const [pGoldToPUSDLogs, pUSDToPGOLDLogs, PGOLDToUSDPMLogs, USDPMToPGOLDLogs] = await Promise.all([
        options.getLogs({ targets: contracts, eventAbi: swapPGOLDToPUSD }),
        options.getLogs({ targets: contracts, eventAbi: swapPUSDToPGOLD }),
        options.getLogs({ targets: contracts, eventAbi: swapPGOLDToUSDPM }),
        options.getLogs({ targets: contracts, eventAbi: swapUSDPMToPGOLD }),
    ]);

    // SwapPGOLDToPUSD: fee is in PUSD (18 decimals, USD-pegged)
    for (const log of pGoldToPUSDLogs) {
        dailyFees.add(PUSD, log.fee);
    }
    // SwapPGOLDToUSDPM: fee is in USDPM (18 decimals, USD-pegged)
    for (const log of PGOLDToUSDPMLogs) {
        dailyFees.add(USDPM[options.chain], log.fee);
    }

    // SwapPUSDToPGOLD: fee is in PGOLD
    for (const log of pUSDToPGOLDLogs.concat(USDPMToPGOLDLogs)) {
        dailyFees.add(PGOLD[options.chain], log.fee);
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
        },
        [CHAIN.PHAROS]: {
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
