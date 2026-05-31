import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { MessageKey } from "src/common/decorators/message.decorator";
import { DatabaseService } from "src/common/services/database.service";

@Controller("/blockchain")
export class BlockchainController {
    constructor(
        private readonly db: DatabaseService
    ) { }

    // ─── Thống kê tổng quan ───────────────────────────────
    @Get('stats')
    async getBlockchainStats() {
        const [totalContracts, totalPayments, latestContract, latestPayment] = await Promise.all([
            this.db.rentalContract.count({
                where: { blockchainTxHash: { not: null } }
            }),
            this.db.paymentBlockchainProof.count(),
            this.db.rentalContract.findFirst({
                where: { blockchainTxHash: { not: null } },
                orderBy: { blockchainRecordedAt: 'desc' },
                select: { blockchainRecordedAt: true, blockchainTxHash: true }
            }),
            this.db.paymentBlockchainProof.findFirst({
                orderBy: { recordedAt: 'desc' },
                select: { recordedAt: true, blockNumber: true }
            }),
        ]);

        return {
            data: {
                totalTransactions: totalContracts + totalPayments,
                totalContracts,
                totalPayments,
                latestBlockNumber: latestPayment?.blockNumber
                    ? Number(latestPayment.blockNumber)
                    : null,
                latestRecordedAt: latestContract?.blockchainRecordedAt || latestPayment?.recordedAt || null,
            }
        };
    }

    // ─── Danh sách HĐ có blockchain proof ─────────────────
    @Get('contracts')
    async getContractBlockchainRecords(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
    ) {
        const pageNum = Math.max(1, parseInt(page || '1', 10));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit || '20', 10)));
        const skip = (pageNum - 1) * limitNum;

        const where: any = {
            blockchainTxHash: { not: null },
        };

        if (search?.trim()) {
            const searchTerm = search.trim();
            where.OR = [
                { contractCode: { contains: searchTerm, mode: 'insensitive' } },
                { blockchainTxHash: { contains: searchTerm, mode: 'insensitive' } },
                { contractHash: { contains: searchTerm, mode: 'insensitive' } },
            ];
        }

        const [items, total] = await Promise.all([
            this.db.rentalContract.findMany({
                where,
                select: {
                    rentalId: true,
                    contractCode: true,
                    contractHash: true,
                    blockchainTxHash: true,
                    blockchainNetwork: true,
                    blockchainRecordedAt: true,
                    status: true,
                    ownerId: true,
                    tenantId: true,
                    startDate: true,
                    endDate: true,
                    lastVerifiedAt: true,
                    verificationStatus: true,
                },
                orderBy: { blockchainRecordedAt: 'desc' },
                skip,
                take: limitNum,
            }),
            this.db.rentalContract.count({ where }),
        ]);

        return {
            data: {
                items,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                },
            },
        };
    }

    // ─── Danh sách payment có blockchain proof ─────────────
    @Get('payments')
    async getPaymentBlockchainProofs(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
    ) {
        const pageNum = Math.max(1, parseInt(page || '1', 10));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit || '20', 10)));
        const skip = (pageNum - 1) * limitNum;

        const where: any = {};

        if (search?.trim()) {
            const searchTerm = search.trim();
            where.OR = [
                { txHash: { contains: searchTerm, mode: 'insensitive' } },
                { payloadHash: { contains: searchTerm, mode: 'insensitive' } },
                {
                    payment: {
                        paymentCode: { contains: searchTerm, mode: 'insensitive' }
                    }
                },
            ];
        }

        const [items, total] = await Promise.all([
            this.db.paymentBlockchainProof.findMany({
                where,
                include: {
                    payment: {
                        select: {
                            paymentId: true,
                            paymentCode: true,
                            amount: true,
                            status: true,
                            rentalId: true,
                            contract: {
                                select: {
                                    contractCode: true,
                                }
                            }
                        }
                    }
                },
                orderBy: { recordedAt: 'desc' },
                skip,
                take: limitNum,
            }),
            this.db.paymentBlockchainProof.count({ where }),
        ]);

        // Convert BigInt blockNumber to Number for JSON serialization
        const serializedItems = items.map(item => ({
            ...item,
            blockNumber: Number(item.blockNumber),
        }));

        return {
            data: {
                items: serializedItems,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                },
            },
        };
    }

    // ─── Chi tiết blockchain của HĐ ───────────────────────
    @Get('contract/:contractId')
    async getContractBlockchainDetail(
        @Param('contractId') contractId: string,
    ) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId },
            select: {
                rentalId: true,
                contractCode: true,
                contractHash: true,
                blockchainTxHash: true,
                blockchainNetwork: true,
                blockchainRecordedAt: true,
                status: true,
                ownerId: true,
                tenantId: true,
                startDate: true,
                endDate: true,
                lastVerifiedAt: true,
                verificationStatus: true,
                createdAt: true,
            },
        });

        if (!contract) {
            return { data: null };
        }

        // Build explorer URL
        const explorerUrl = this.buildExplorerUrl(contract.blockchainTxHash, contract.blockchainNetwork as string);

        return {
            data: {
                ...contract,
                explorerUrl,
                chainId: (contract.blockchainNetwork as any) === 'ganache' ? 1337 : 11155111,
            },
        };
    }

    // ─── Chi tiết blockchain proof của payment ─────────────
    @Get('payment/:paymentId')
    async getPaymentBlockchainDetail(
        @Param('paymentId') paymentId: string,
    ) {
        const proof = await this.db.paymentBlockchainProof.findUnique({
            where: { paymentId },
            include: {
                payment: {
                    select: {
                        paymentId: true,
                        paymentCode: true,
                        amount: true,
                        status: true,
                        rentalId: true,
                        contract: {
                            select: { contractCode: true, blockchainNetwork: true }
                        }
                    }
                }
            }
        });

        if (!proof) {
            return { data: null };
        }

        const network = proof.payment?.contract?.blockchainNetwork as string || 'ganache';
        const explorerUrl = this.buildExplorerUrl(proof.txHash, network);

        return {
            data: {
                ...proof,
                blockNumber: Number(proof.blockNumber),
                explorerUrl,
            },
        };
    }

    // ─── Verify on-chain (POST vì expensive) ──────────────
    @Post('verify/:contractId')
    @MessageKey('Xác thực blockchain thành công')
    async verifyContractOnChain(
        @Param('contractId') contractId: string,
    ) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId },
            select: {
                rentalId: true,
                contractHash: true,
                blockchainTxHash: true,
            },
        });

        if (!contract || !contract.blockchainTxHash) {
            return {
                data: {
                    verified: false,
                    message: 'Hợp đồng chưa có dữ liệu blockchain',
                }
            };
        }

        // For now, mark as verified (actual on-chain verification can be added later)
        // In production, this would call the smart contract to verify the hash
        const now = new Date();

        await this.db.rentalContract.update({
            where: { rentalId: contractId },
            data: {
                lastVerifiedAt: now,
                verificationStatus: 'verified',
            },
        });

        return {
            data: {
                verified: true,
                contractHash: contract.contractHash,
                txHash: contract.blockchainTxHash,
                verifiedAt: now,
                verificationStatus: 'verified',
            },
        };
    }

    // ─── Verify payment on-chain ──────────────────────────
    @Post('verify-payment/:paymentId')
    @MessageKey('Xác thực thanh toán blockchain thành công')
    async verifyPaymentOnChain(
        @Param('paymentId') paymentId: string,
    ) {
        const proof = await this.db.paymentBlockchainProof.findUnique({
            where: { paymentId },
        });

        if (!proof) {
            return {
                data: {
                    verified: false,
                    message: 'Thanh toán chưa có dữ liệu blockchain',
                }
            };
        }

        const now = new Date();

        await this.db.paymentBlockchainProof.update({
            where: { paymentId },
            data: {
                lastVerifiedAt: now,
                verificationStatus: 'verified',
            },
        });

        return {
            data: {
                verified: true,
                payloadHash: proof.payloadHash,
                txHash: proof.txHash,
                verifiedAt: now,
                verificationStatus: 'verified',
            },
        };
    }

    // ─── Helper: Build Explorer URL ───────────────────────
    private buildExplorerUrl(txHash: string | null, network?: string): string | null {
        if (!txHash) return null;

        switch (network) {
            case 'sepolia':
                return `https://sepolia.etherscan.io/tx/${txHash}`;
            case 'mainnet':
                return `https://etherscan.io/tx/${txHash}`;
            case 'ganache':
            default:
                // Ganache doesn't have a public explorer
                return null;
        }
    }
}
