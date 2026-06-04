const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const ABI = [
    `function contracts(string) view returns (
      string contractId,
      string propertyId,
      bytes32 contractHash,
      string landlordId,
      string tenantId,
      uint256 version,
      uint256 signedAt,
      uint256 updatedAt,
      uint8 status,
      bool exists
    )`
  ];
  const contractAddress = '0x0B306BF915C4d645ff596e518fAf3F9669b97016';
  const contract = new ethers.Contract(contractAddress, ABI, provider);

  const blockNumber = await provider.getBlockNumber();
  console.log("Connected to blockchain, block:", blockNumber);
  
  // Let's check a contract. But which one? Let's check the events to get a contract ID.
  const filter = contract.filters.ContractRegistered();
  const events = await contract.queryFilter(filter, 0, 'latest');
  
  if (events.length > 0) {
    const lastEvent = events[events.length - 1];
    const contractId = lastEvent.args.contractId;
    console.log("Found contractId:", contractId);
    
    const record = await contract.contracts(contractId);
    console.log("Record exists:", record.exists);
    console.log("Status:", record.status, "Type:", typeof record.status);
    if (typeof record.status === 'bigint') {
       console.log("Status (Number):", Number(record.status));
    }
  } else {
    console.log("No contracts found.");
  }
}

main().catch(console.error);
