import { ethers } from 'ethers';

type StoreHashResult = {
    txHash: string;
    blockNumber: number;
    chainId: number;
};

const RPC_URL = 'http://host.docker.internal:7545';
const PRIVATE_KEY = '0x429a0e5f45af7f09da267f026a167173a6d600dc1358872fbee620c6f3ca1194';
const CONTRACT_ADDRESS = '0x91D2763829E33156B60811338D2dA78bD4715EB0';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const abi = [
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_hash",
				"type": "string"
			}
		],
		"name": "store",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "string",
				"name": "hash",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "sender",
				"type": "address"
			}
		],
		"name": "Stored",
		"type": "event"
	}
];

const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

function isValidSha256Hex(input: string): boolean {
    const normalized = input.toLowerCase().trim();
    return /^([a-f0-9]{64}|0x[a-f0-9]{64})$/.test(normalized);
}

export async function storeHash(hash: string): Promise<StoreHashResult> {
    if (!isValidSha256Hex(hash)) {
        throw new Error('Invalid hash format.');
    }

    const hashBytes32 = '0x' + hash;

    try {
        console.log("Sending transaction...");

        const tx = await contract.store(hashBytes32);
        const receipt = await tx.wait();

        console.log("TX HASH:", receipt.hash);

        return {
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            chainId: Number((await provider.getNetwork()).chainId)
        };

    } catch (error: any) {
        const message = error?.shortMessage || error?.reason || error?.message;
        throw new Error(`Blockchain store failed: ${message}`);
    }
}

async function test() {
    try {
        const network = await provider.getNetwork();
        console.log('Connected to network:', network);
        
    } catch (err) {
        console.error('Cannot connect:', err);
    }
}

test();