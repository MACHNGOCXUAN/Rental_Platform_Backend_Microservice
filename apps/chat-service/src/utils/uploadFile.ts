import * as AWS from 'aws-sdk';
import * as dotenv from 'dotenv';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { log } from 'console';

dotenv.config();

AWS.config.update({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();

const randomString = (num: number) => {
    return `${Math.random().toString(36).substring(2, num + 2)}`;
}

export const uploadFileUrl = async (buffer: Buffer, originalname: string, mimetype?: string): Promise<string> => {
    const filePath = `${randomString(4)}-${new Date().getTime()}-${originalname}`;

    const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: process.env.AWS_BUCKET_NAME || 'rental-platform-s3',
        Body: buffer,
        Key: filePath,
        ContentType: mimetype || 'application/pdf',
        // Uncomment if you want the uploaded file to be public directly via S3 link
        // ACL: 'public-read' 
    };

    try {
        const data = await s3.upload(uploadParams).promise();
        console.log(`File uploaded successfully: ${data.Location}`);
        return data.Location;
    } catch (error) {
        console.error("Error uploading file to AWS S3: ", error);
        throw new Error("Upload file to AWS S3 failed");
    }
}

export const getUploadUrl = async (fileName: string, fileType: string) => {
    const region = process.env.AWS_REGION || "ap-southeast-1";

    const client = new S3Client({
        region,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
        },
    });

    const bucket = process.env.AWS_BUCKET_NAME || "rental-platform-s3";

    if (!bucket) {
        throw new Error("Bucket name không tồn tại");
    }

    const key = `uploads/${Date.now()}-${fileName}`;

    // 🔥 Chuẩn hóa fileType (QUAN TRỌNG)
    const normalizedType = fileType || "application/octet-stream";

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: normalizedType,
    });

    const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: 3600,
    });

    return {
        uploadUrl,
        key,
        fileUrl: `https://${bucket}.s3.${region}.amazonaws.com/${key}`, // 👈 fix region
    };
};

export default uploadFileUrl;