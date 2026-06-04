const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const ABI = [
    `event ContractTerminated(string contractId, uint256 terminatedAt)`
  ];
  const contractAddress = '0x0B306BF915C4d645ff596e518fAf3F9669b97016';
  const contract = new ethers.Contract(contractAddress, ABI, provider);

  const contractId = '4180a068-8d6e-488c-b6f2-95ebe43a0791';
  
  const filter = contract.filters.ContractTerminated(contractId);
  const events = await contract.queryFilter(filter, 0, 'latest');
  
  console.log("Terminated events:", events.length);
  for (const event of events) {
      console.log(`Terminated At: ${new Date(Number(event.args.terminatedAt) * 1000).toLocaleString()}`);
  }
}

main().catch(console.error);
