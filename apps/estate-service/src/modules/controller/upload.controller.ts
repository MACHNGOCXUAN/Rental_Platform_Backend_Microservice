import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    UploadedFiles,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CloudinaryService, CloudinaryUploadResult } from '../services/cloudinary.service';

// File size limits
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_IMAGES = 12;
const MAX_VIDEOS = 3;

// Allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];

interface UploadResponse {
    success: boolean;
    data?: CloudinaryUploadResult | CloudinaryUploadResult[];
    message?: string;
}

// Define file interface to match multer file structure
interface MulterFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
}

@Controller('upload')
export class UploadController {
    constructor(private readonly cloudinaryService: CloudinaryService) { }

    /**
     * Upload a single image
     */
    @Post('image')
    @UseInterceptors(
        FileInterceptor('file', {
            limits: { fileSize: MAX_IMAGE_SIZE },
        }),
    )
    async uploadImage(@UploadedFile() file: MulterFile): Promise<UploadResponse> {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
            throw new BadRequestException(
                `Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
            );
        }

        try {
            const result = await this.cloudinaryService.uploadImage(file);
            return {
                success: true,
                data: result,
                message: 'Image uploaded successfully',
            };
        } catch (error) {
            throw new BadRequestException(`Upload failed: ${error.message}`);
        }
    }

    /**
     * Upload multiple images (up to 12)
     */
    @Post('images')
    @UseInterceptors(
        FilesInterceptor('files', MAX_IMAGES, {
            limits: { fileSize: MAX_IMAGE_SIZE },
        }),
    )
    async uploadImages(@UploadedFiles() files: MulterFile[]): Promise<UploadResponse> {
        if (!files || files.length === 0) {
            throw new BadRequestException('No files uploaded');
        }

        // Validate file types
        for (const file of files) {
            if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
                throw new BadRequestException(
                    `Invalid file type: ${file.originalname}. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
                );
            }
        }

        try {
            const results = await this.cloudinaryService.uploadMultipleImages(files);
            return {
                success: true,
                data: results,
                message: `${results.length} image(s) uploaded successfully`,
            };
        } catch (error) {
            throw new BadRequestException(`Upload failed: ${error.message}`);
        }
    }

    /**
     * Upload a single video
     */
    @Post('video')
    @UseInterceptors(
        FileInterceptor('file', {
            limits: { fileSize: MAX_VIDEO_SIZE },
        }),
    )
    async uploadVideo(@UploadedFile() file: MulterFile): Promise<UploadResponse> {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        if (!ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
            throw new BadRequestException(
                `Invalid file type. Allowed types: ${ALLOWED_VIDEO_TYPES.join(', ')}`,
            );
        }

        try {
            const result = await this.cloudinaryService.uploadVideo(file);
            return {
                success: true,
                data: result,
                message: 'Video uploaded successfully',
            };
        } catch (error) {
            throw new BadRequestException(`Upload failed: ${error.message}`);
        }
    }

    /**
     * Upload multiple videos (up to 3)
     */
    @Post('videos')
    @UseInterceptors(
        FilesInterceptor('files', MAX_VIDEOS, {
            limits: { fileSize: MAX_VIDEO_SIZE },
        }),
    )
    async uploadVideos(@UploadedFiles() files: MulterFile[]): Promise<UploadResponse> {
        if (!files || files.length === 0) {
            throw new BadRequestException('No files uploaded');
        }

        // Validate file types
        for (const file of files) {
            if (!ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
                throw new BadRequestException(
                    `Invalid file type: ${file.originalname}. Allowed types: ${ALLOWED_VIDEO_TYPES.join(', ')}`,
                );
            }
        }

        try {
            const results = await this.cloudinaryService.uploadMultipleVideos(files);
            return {
                success: true,
                data: results,
                message: `${results.length} video(s) uploaded successfully`,
            };
        } catch (error) {
            throw new BadRequestException(`Upload failed: ${error.message}`);
        }
    }
}
