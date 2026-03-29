export interface VnptCertificateRequest {
    sp_id: string;
    sp_password: string;
    user_id: string;
    transaction_id: string;
    serial_number: string;
}

export interface VnptCertificate {
    cert_id: string;
    serial_number: string;
    cert_status: string;
    cert_status_code: string;
    cert_subject: string;
    cert_valid_from: string;
    cert_valid_to: string;
    cert_data: string;
}

export interface VnptResponse {
    status_code: number;
    message: string;
    data?: {
        user_certificates: VnptCertificate[];
    };
}


export interface SignFile {
    file_type: 'pdf' | 'xml';
    data_to_be_signed: string; // SHA256 hash
    doc_id: string;
    sign_type: 'hash';
}

export interface SignRequest {
    sp_id: string;
    sp_password: string;
    user_id: string;
    transaction_id: string;
    transaction_desc: string;
    serial_number: string;
    sign_files: SignFile[];
    time_stamp: string;
}

export interface SignResponse {
    status_code: number;
    message: string;
    data?: {
        transaction_id?: string;
        tran_code?: string;
        expired_in?: number;
        [key: string]: any;
    } | null;
}

export interface Signatures {
    doc_id: string;
    signature_value: string;
    timestamp_signature: string;
}

export interface SignStatusResponse {
    status_code: number;
    message: string;
    data?: {
        transaction_id?: string;
        expired_in: number;
        signatures: Signatures[]
    } | null;
}