import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const PSWAP_CONTRACTS: Record<string, string[]>  = {
    [CHAIN.ARBITRUM]: ["0x3D084Fc4Cc4D5A0B8d6B6517341f359505b35336", "0xeC84f112aa21F62E1b51f7ee7DFD26C6B915b3Fe"],
    [CHAIN.PHAROS]: ["0xee860417fc843a7191d88c62b2937bb891b24bc6"],
}
const PUSD: Partial<Record<string, string>> = {
    [CHAIN.ARBITRUM]: "0xC8Fb643D18F1e53698CFDa5c8Fdf0cdC03C1dBec",
}
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
    const dailyHoldersRevenue = options.createBalances();
    const contracts = PSWAP_CONTRACTS[options.chain]
    const pusd = PUSD[options.chain]

    const [pGoldToPUSDLogs, pUSDToPGOLDLogs, PGOLDToUSDPMLogs, USDPMToPGOLDLogs] = await Promise.all([
        pusd ? options.getLogs({ targets: contracts, eventAbi: swapPGOLDToPUSD }) : Promise.resolve([]),
        pusd ? options.getLogs({ targets: contracts, eventAbi: swapPUSDToPGOLD }) : Promise.resolve([]),
        options.getLogs({ targets: contracts, eventAbi: swapPGOLDToUSDPM }),
        options.getLogs({ targets: contracts, eventAbi: swapUSDPMToPGOLD }),
    ]);

    // SwapPGOLDToPUSD: fee is in PUSD (18 decimals, USD-pegged)
    if (pusd) for (const log of pGoldToPUSDLogs) {
        dailyFees.add(pusd, log.fee, METRIC.SWAP_FEES);
        dailyHoldersRevenue.add(pusd, log.fee, "Token Swap Fees to Stakers");
    }
    // SwapPGOLDToUSDPM: fee is in USDPM (18 decimals, USD-pegged)
    for (const log of PGOLDToUSDPMLogs) {
        dailyFees.add(USDPM[options.chain], log.fee, METRIC.SWAP_FEES);
        dailyHoldersRevenue.add(USDPM[options.chain], log.fee, "Token Swap Fees to Stakers");
    }

    // SwapPUSDToPGOLD: fee is in PGOLD
    for (const log of [...pUSDToPGOLDLogs, ...USDPMToPGOLDLogs]) {
        dailyFees.addCGToken("pleasing-gold", Number(log.fee) / 1e18, METRIC.SWAP_FEES);
        dailyHoldersRevenue.addCGToken("pleasing-gold", Number(log.fee) / 1e18, "Token Swap Fees to Stakers");
    }

    return { dailyFees, dailyRevenue: dailyHoldersRevenue, dailyHoldersRevenue };
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
            start: '2026-05-12',
        }
    },
    methodology: {
        Fees: "Fees collected on PGOLD<>PUSD/USDPM swaps via the Pleasing Golden spot market.",
        Revenue: "All the fees collected on PGOLD<>PUSD/USDPM swaps generates yield for PGOLD stakers",
        HoldersRevenue: "All the fees collected on PGOLD<>PUSD/USDPM swaps generates yield for PGOLD stakers.",
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.SWAP_FEES]: "Fees collected on PGOLD<>PUSD/USDPM swaps via the Pleasing Golden spot market"
        },
        Revenue: {
            "Token Swap Fees to Stakers": "All the fees collected on PGOLD<>PUSD/USDPM swaps generates yield for PGOLD stakers"
        },
        HoldersRevenue: {
            "Token Swap Fees to Stakers": "All the fees collected on PGOLD<>PUSD/USDPM swaps generates yield for PGOLD stakers"
        },
    }
};

export default adapter;
