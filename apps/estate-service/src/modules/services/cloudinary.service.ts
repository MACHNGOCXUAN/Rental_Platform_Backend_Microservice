import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export interface CloudinaryUploadResult {
    publicId: string;
    url: string;
    secureUrl: string;
    format: string;
    resourceType: 'image' | 'video';
    width?: number;
    height?: number;
    duration?: number;
    bytes: number;
    thumbnail?: string;
}

// Define file interface to avoid Express.Multer dependency issues
interface UploadFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
}

@Injectable()
export class CloudinaryService {
    constructor(private configService: ConfigService) {
        cloudinary.config({
            cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
            api_key: this.configService.get('CLOUDINARY_API_KEY'),
            api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
        });
    }

    /**
     * Upload a single image to Cloudinary
     */
    async uploadImage(
        file: UploadFile,
        folder: string = 'real_estate/images',
    ): Promise<CloudinaryUploadResult> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    resource_type: 'image',
                    transformation: [
                        { quality: 'auto:good' },
                        { fetch_format: 'auto' },
                    ],
                },
                (error, result) => {
                    if (error) {
                        reject(new Error(error.message));
                    } else if (result) {
                        resolve({
                            publicId: result.public_id,
                            url: result.url,
                            secureUrl: result.secure_url,
                            format: result.format,
                            resourceType: 'image',
                            width: result.width,
                            height: result.height,
                            bytes: result.bytes,
                        });
                    }
                },
            );

            // Convert buffer to readable stream and pipe to upload
            const { Readable } = require('stream');
            const readableStream = new Readable();
            readableStream.push(file.buffer);
            readableStream.push(null);
            readableStream.pipe(uploadStream);
        });
    }

    /**
     * Upload a single video to Cloudinary
     */
    async uploadVideo(
        file: UploadFile,
        folder: string = 'real_estate/videos',
    ): Promise<CloudinaryUploadResult> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    resource_type: 'video',
                    eager: [
                        { format: 'jpg', transformation: [{ width: 300, height: 200, crop: 'fill' }] },
                    ],
                    eager_async: false,
                },
                (error, result) => {
                    if (error) {
                        reject(new Error(error.message));
                    } else if (result) {
                        // Generate thumbnail URL
                        const thumbnailUrl = cloudinary.url(result.public_id, {
                            resource_type: 'video',
                            format: 'jpg',
                            transformation: [
                                { width: 300, height: 200, crop: 'fill' },
                                { start_offset: '0' },
                            ],
                        });

                        resolve({
                            publicId: result.public_id,
                            url: result.url,
                            secureUrl: result.secure_url,
                            format: result.format,
                            resourceType: 'video',
                            width: result.width,
                            height: result.height,
                            duration: result.duration,
                            bytes: result.bytes,
                            thumbnail: thumbnailUrl,
                        });
                    }
                },
            );

            const { Readable } = require('stream');
            const readableStream = new Readable();
            readableStream.push(file.buffer);
            readableStream.push(null);
            readableStream.pipe(uploadStream);
        });
    }

    /**
     * Upload multiple images
     */
    async uploadMultipleImages(
        files: UploadFile[],
        folder: string = 'real_estate/images',
    ): Promise<CloudinaryUploadResult[]> {
        const uploadPromises = files.map((file) => this.uploadImage(file, folder));
        return Promise.all(uploadPromises);
    }

    /**
     * Upload multiple videos
     */
    async uploadMultipleVideos(
        files: UploadFile[],
        folder: string = 'real_estate/videos',
    ): Promise<CloudinaryUploadResult[]> {
        const uploadPromises = files.map((file) => this.uploadVideo(file, folder));
        return Promise.all(uploadPromises);
    }

    /**
     * Delete a resource from Cloudinary
     */
    async deleteResource(publicId: string, resourceType: 'image' | 'video' = 'image'): Promise<boolean> {
        try {
            const result = await cloudinary.uploader.destroy(publicId, {
                resource_type: resourceType,
            });
            return result.result === 'ok';
        } catch (error) {
            console.error('Error deleting resource from Cloudinary:', error);
            return false;
        }
    }

    /**
     * Delete multiple resources
     */
    async deleteMultipleResources(
        publicIds: string[],
        resourceType: 'image' | 'video' = 'image',
    ): Promise<{ success: string[]; failed: string[] }> {
        const results = { success: [] as string[], failed: [] as string[] };

        for (const publicId of publicIds) {
            const deleted = await this.deleteResource(publicId, resourceType);
            if (deleted) {
                results.success.push(publicId);
            } else {
                results.failed.push(publicId);
            }
        }

        return results;
    }

    /**
     * Get optimized image URL
     */
    getOptimizedImageUrl(
        publicId: string,
        options: {
            width?: number;
            height?: number;
            quality?: string;
            format?: string;
            crop?: string;
        } = {},
    ): string {
        const { width, height, quality = 'auto', format = 'auto', crop = 'fill' } = options;

        const transformations: any[] = [{ quality }, { fetch_format: format }];

        if (width || height) {
            transformations.push({
                width,
                height,
                crop,
            });
        }

        return cloudinary.url(publicId, {
            transformation: transformations,
            secure: true,
        });
    }
}
