import * as AWS from 'aws-sdk';
import * as dotenv from 'dotenv';

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
        Bucket: process.env.BUCKET_NAME || process.env.AWS_BUCKET_NAME || '',
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

export default uploadFileUrl;