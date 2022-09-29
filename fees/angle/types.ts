export type ChainMultiEndpoints = {
    [chains: string]: {
        [subgraphs: string]: string
    }
}

export type BorrowFee = {
    surplusFromInterests: number;
    surplusFromBorrowFees: number;
    surplusFromRepayFees: number;
    surplusFromLiquidationSurcharges: number;
    blockNumber: number;
    timestamp: number;
}

export type CoreFee = {
    totalProtocolFees: number;
    totalKeeperFees: number;
    totalProtocolInterests: number;
    totalSLPInterests: number;
    totalSLPFees: number;
    blockNumber: number;
    timestamp: number;
}

export type BorrowFeeQuery = {
    today: BorrowFee[],
    yesterday: BorrowFee[]
};

export type CoreFeeQuery = {
    today: CoreFee[],
    yesterday: CoreFee[]
};

export type BorrowResult = { totalFees: BorrowFee, deltaFees: BorrowFee };
export type CoreResult = { totalFees: CoreFee, deltaFees: CoreFee };


export type RewardWeekFee = {
    week: number;
    distributed: number;
};

export type FeeDistribution = {
    token: string;
    tokenName: string;
    tokenDecimals: number;
    tokensPerWeek: RewardWeekFee[];
};

export type veANGLEQuery = {
    feeDistributions: FeeDistribution[];
};