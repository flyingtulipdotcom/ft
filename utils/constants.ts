import { EndpointId } from "@layerzerolabs/lz-definitions";

// LayerZero EndpointV2 addresses by chain ID
export const ENDPOINT_V2_ADDRESSES: Record<string, string> = {
  // Mainnets
  "1": "0x1a44076050125825900e736c501f859c50fE728c", // Ethereum
  "137": "0x1a44076050125825900e736c501f859c50fE728c", // Polygon
  "42161": "0x1a44076050125825900e736c501f859c50fE728c", // Arbitrum
  "56": "0x1a44076050125825900e736c501f859c50fE728c", // BSC
  "43114": "0x1a44076050125825900e736c501f859c50fE728c", // Avalanche
  "146": "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B", // Sonic

  // Testnets
  "11155111": "0x6EDCE65403992e310A62460808c4b910D972f10f", // Sepolia
  "421614": "0x6EDCE65403992e310A62460808c4b910D972f10f", // Arbitrum Sepolia
  "80002": "0x6EDCE65403992e310A62460808c4b910D972f10f" // Polygon Amoy
};

export const EXECUTOR_ADDRESSES: Record<string, string> = {
  // Mainnets
  "146": "0x4208D6E27538189bB48E603D6123A94b8Abe0A0b", // Sonic
  "43114": "0x90E595783E43eb89fF07f63d27B8430e6B44bD9c" // Avalanche

  // Testnets
};

// Pathways (only need )

// Can add confirmations to it as well

export const DVN_ADDRESSES: Record<string, string[]> = {
  // Mainnets
  "146": ["0x282b3386571f7f794450d5789911a9804fa346b4", "0xdd7b5e1db4aafd5c8ec3b764efb8ed265aa5445b"], // Sonic (LayerZero Labs, Stargate)
  "43114": ["0x252b234545e154543ad2784c7111eb90406be836", "0x962f502a63f5fbeb44dc9ab932122648e8352959"] // Avalanche (LayerZero Labs, Stargate)
  // Testnets
};

export const SEND_LIBRARY_ADDRESSES: Record<string, string> = {
  // Mainnets
  "146": "0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7", // Sonic
  "43114": "0x197D1333DEA5Fe0D6600E9b396c7f1B1cFCc558a" // Avalanche
};

export const RECIEVE_LIBRARY_ADDRESSES: Record<string, string> = {
  // Mainnets
  "146": "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043", // Sonic
  "43114": "0xbf3521d309642FA9B1c91A08609505BA09752c61" // Avalanche
};

export const FT_TOKEN_ADDRESSES: Record<number, string> = {
  // Mainnets
  [EndpointId.SONIC_V2_MAINNET]: require(`../deployments/sonic-mainnet/FT.json`).address,
  [EndpointId.AVALANCHE_V2_MAINNET]: require(`../deployments/avalanche-mainnet/FT.json`).address
};

export const FT_DELEGATE_ADDRESSES: Record<string, string> = {
  // Mainnets
  "146": "0x3419E83fe5583028e056b1aa5E62601D80799572",
  "43114": "0x3419E83fe5583028e056b1aa5E62601D80799572"
};

export const FT_CONFIGURATOR_ADDRESSES: Record<string, string> = {
  // Mainnets
  "146": "0x3419E83fe5583028e056b1aa5E62601D80799572",
  "43114": "0x3419E83fe5583028e056b1aa5E62601D80799572"
};

export const TOKEN_CONTRACT_NAME = 'FT'

