const { ethers } = require("ethers");
require("dotenv").config({ path: ".env" });

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
    
    const abi = ["function backend() view returns (address)"];
    const contract = new ethers.Contract(process.env.BLOCKCHAIN_CONTRACT_ADDRESS, abi, provider);
    
    try {
        const backendAddress = await contract.backend();
        console.log("Backend address in contract:", backendAddress);
        
        const wallet = new ethers.Wallet(process.env.BLOCKCHAIN_PRIVATE_KEY, provider);
        console.log("Wallet address from private key:", wallet.address);
        
        if (backendAddress.toLowerCase() === wallet.address.toLowerCase()) {
            console.log("Addresses match! Backend is correctly configured.");
        } else {
            console.log("MISMATCH! The caller is NOT the authorized backend.");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}
main();
