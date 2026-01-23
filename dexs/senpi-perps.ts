import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://senpi.ai/

const START = '2025-11-10';
const HL_BUILDER_ADDRESS = '0x1368f4311db5807f7c7924d736adaeb83e47bafe';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })
