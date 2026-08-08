import { Balances } from "@defillama/sdk";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
    BURN_COMPLETED_EVENT,
    chainConfig,
    FEE_EVENT,
    getSisTokens,
    LP_DIVIDEND_RATIO_ABI,
    OCTOPOOL_START,
    OCTOPOOLS,
    OMNIPOOL_FEE_EVENT,
    REVERT_BURN_COMPLETED_EVENT,
    REVERT_SYNTHESIZE_EVENT,
    SIS_SYNTHESIS,
    SIS_SYNTHESIS_START,
    SisToken,
    SisTokens,
    SYNTHESIZE_COMPLETED_EVENT,
    WAD,
} from "./constants";

const LABELS = {
    partner: "Partner Fees",
    partnerToSymbiosis: "Partner Fees To Symbiosis",
    partnerToPartners: "Partner Fees To Partners",
    swap: "Octopool Swap Fees",
    swapToProtocol: "Octopool Swap Fees To Protocol",
    swapToLps: "Octopool Swap Fees To LPs",
    bridging: "Bridging Fees",
    bridgingToBridge: "Bridging Fees To Bridge",
}

type DailyBalances = {
    dailyFees: Balances,
    dailyRevenue: Balances,
    dailyProtocolRevenue: Balances,
    dailySupplySideRevenue: Balances,
}

// a chain is queried from the earliest of its fee sources, so the later ones are skipped until the
// period reaches the day they were deployed
const isLive = (options: FetchOptions, start: string) => options.endTimestamp >= Date.parse(start) / 1000;

// tokens are always handed over as a coingecko id so llama prices them at the block of the period,
// tokens with no known id never make it into the map
const addFee = (balances: Balances, fee: any, token: SisToken, label: string, share = 1) => {
    const amount = (Number(fee) / 10 ** token.decimals) * share;
    balances.addCGToken(token.cgId, amount, label);
}

// partners routing a swap through symbiosis charge their own fee on the way in, the share taken by
// symbiosis itself is the one collected by default_fee_addr
const addPartnerFees = async (options: FetchOptions, balances: DailyBalances, tokens?: SisTokens) => {
    const { partner_fee_collector, partner_fee_start, default_fee_addr } = chainConfig[options.chain];
    if (!partner_fee_collector) return;
    if (partner_fee_start && !isLive(options, partner_fee_start)) return;

    const logs = await options.getLogs({ target: partner_fee_collector, eventAbi: FEE_EVENT });

    logs.forEach((log: any) => {
        // fees on the symbiosis chain are taken in synth tokens priced by coingecko id, everywhere
        // else the token is a real one llama prices itself
        let credit: (target: Balances, label: string) => void;

        if (tokens) {
            const token = tokens.sisTokens[log.token.toLowerCase()];
            if (!token) return;

            credit = (target, label) => addFee(target, log.fee, token, label);
        } else {
            credit = (target, label) => target.add(log.token, log.fee, label);
        }

        credit(balances.dailyFees, LABELS.partner);

        if (log.partner.toLowerCase() === default_fee_addr?.toLowerCase()) {
            credit(balances.dailyRevenue, LABELS.partnerToSymbiosis);
            credit(balances.dailyProtocolRevenue, LABELS.partnerToSymbiosis);
        } else {
            credit(balances.dailySupplySideRevenue, LABELS.partnerToPartners);
        }
    });
}

// octopools charge a swap fee on both sides of a swap and split it between the lps and the protocol
// fee receiver by lpDividendRatio, a governance setter read at the block of the period
const addOctopoolFees = async (options: FetchOptions, balances: DailyBalances, tokens: SisTokens) => {
    if (!isLive(options, OCTOPOOL_START)) return;

    const logsPerPool = await options.getLogs({ targets: OCTOPOOLS, eventAbi: OMNIPOOL_FEE_EVENT, flatten: false });
    const ratios = await options.api.multiCall({ abi: LP_DIVIDEND_RATIO_ABI, calls: OCTOPOOLS });

    logsPerPool.forEach((poolLogs: any[], i: number) => {
        const lpShare = Number(ratios[i]) / WAD;

        poolLogs.forEach((log: any) => {
            const token = tokens.sisTokens[log.token.toLowerCase()];
            if (!token) return;

            addFee(balances.dailyFees, log.fee, token, LABELS.swap);
            addFee(balances.dailySupplySideRevenue, log.fee, token, LABELS.swapToLps, lpShare);
            addFee(balances.dailyRevenue, log.fee, token, LABELS.swapToProtocol, 1 - lpShare);
            addFee(balances.dailyProtocolRevenue, log.fee, token, LABELS.swapToProtocol, 1 - lpShare);
        });
    });
}

// stableBridgingFee is deducted on the destination leg of every cross chain transfer and paid to the
// bridge, which only the owner/admin can withdraw from, so none of it is supply side
const addBridgeFees = async (options: FetchOptions, balances: DailyBalances, tokens?: SisTokens) => {
    if (tokens && isLive(options, SIS_SYNTHESIS_START)) {
        // the mint leg mints the fee straight to the bridge
        const synthesizeLogs = await options.getLogs({ target: SIS_SYNTHESIS, eventAbi: SYNTHESIZE_COMPLETED_EVENT });
        const revertBurnLogs = await options.getLogs({ target: SIS_SYNTHESIS, eventAbi: REVERT_BURN_COMPLETED_EVENT });

        const addBridgeFee = (fee: any, token?: SisToken) => {
            if (!token) return;
            addFee(balances.dailyFees, fee, token, LABELS.bridging);
            addFee(balances.dailyRevenue, fee, token, LABELS.bridgingToBridge);
            addFee(balances.dailyProtocolRevenue, fee, token, LABELS.bridgingToBridge);
        };

        // the mint leg reports the real token on its origin chain, priced 1:1 with the synth it mints
        synthesizeLogs.forEach((log: any) => addBridgeFee(log.bridgingFee, tokens.realTokens[log.token.toLowerCase()]));
        // reverts refund the synth itself, so this one already reports a token that can be priced
        revertBurnLogs.forEach((log: any) => addBridgeFee(log.bridgingFee, tokens.sisTokens[log.token.toLowerCase()]));
    }

    const { portal } = chainConfig[options.chain];
    if (!portal) return;

    // the unlock leg takes its fee in the real token, on revert the same fee is charged on the refund
    const burnLogs = await options.getLogs({ target: portal, eventAbi: BURN_COMPLETED_EVENT });
    const revertLogs = await options.getLogs({ target: portal, eventAbi: REVERT_SYNTHESIZE_EVENT });

    burnLogs.concat(revertLogs).forEach((log: any) => {
        balances.dailyFees.add(log.token, log.bridgingFee, LABELS.bridging);
        balances.dailyRevenue.add(log.token, log.bridgingFee, LABELS.bridgingToBridge);
        balances.dailyProtocolRevenue.add(log.token, log.bridgingFee, LABELS.bridgingToBridge);
    });
}

const fetch = async (options: FetchOptions) => {
    const balances: DailyBalances = {
        dailyFees: options.createBalances(),
        dailyRevenue: options.createBalances(),
        dailyProtocolRevenue: options.createBalances(),
        dailySupplySideRevenue: options.createBalances(),
    };

    // fees on the symbiosis chain are taken in synthetic tokens the llama coins api has no price for
    const tokens = options.chain === CHAIN.SIS ? await getSisTokens() : undefined;

    await addPartnerFees(options, balances, tokens);
    await addBridgeFees(options, balances, tokens);

    // octopools only exist on the symbiosis chain
    if (tokens) await addOctopoolFees(options, balances, tokens);

    return balances;
}

const methodology = {
    Fees: "Partner fees charged on swaps routed through symbiosis, octopool swap fees on the symbiosis chain, and the stableBridgingFee deducted on every cross chain transfer.",
    Revenue: "The symbiosis share of partner fees, the octopool fee share sent to the protocol fee receiver, and the whole bridging fee, which is paid to the bridge contract.",
    ProtocolRevenue: "The same flows as Revenue, all of which are controlled by symbiosis. None of it is distributed to token holders on chain, so there is no holders revenue.",
    SupplySideRevenue: "Partner fees claimed by the partner that routed the swap, and the octopool fee share that stays with the liquidity providers.",
}

const breakdownMethodology = {
    Fees: {
        [LABELS.partner]: "Fee collected by the PartnerFeeCollector on each routed swap.",
        [LABELS.swap]: "Swap fee charged by the octopools on both sides of a swap, read from the FeeCollected event.",
        [LABELS.bridging]: "stableBridgingFee deducted on the destination leg of a transfer, on the mint leg from the Synthesis contract and on the unlock leg from the Portal contract.",
    },
    Revenue: {
        [LABELS.partnerToSymbiosis]: "Partner fees collected by the symbiosis owned fee address.",
        [LABELS.swapToProtocol]: "Share of the octopool swap fee sent to the protocol fee receiver, one minus lpDividendRatio.",
        [LABELS.bridgingToBridge]: "The whole bridging fee, minted or transferred to the BridgeV2 contract which only the owner or admin can withdraw from.",
    },
    ProtocolRevenue: {
        [LABELS.partnerToSymbiosis]: "Partner fees collected by the symbiosis owned fee address.",
        [LABELS.swapToProtocol]: "Share of the octopool swap fee sent to the protocol fee receiver, one minus lpDividendRatio.",
        [LABELS.bridgingToBridge]: "The whole bridging fee, minted or transferred to the BridgeV2 contract which only the owner or admin can withdraw from.",
    },
    SupplySideRevenue: {
        [LABELS.partnerToPartners]: "Partner fees claimed by the partner that routed the swap.",
        [LABELS.swapToLps]: "Share of the octopool swap fee kept by the liquidity providers, lpDividendRatio.",
    },
}

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    adapter: chainConfig,
    fetch,
    methodology,
    breakdownMethodology,
}

export default adapter;
