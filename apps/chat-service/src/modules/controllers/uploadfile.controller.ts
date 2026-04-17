import { Body, Controller, Post } from "@nestjs/common";
import { getUploadUrl } from "src/utils/uploadFile";

@Controller("/upload-file")
export class UploadFileController {

    // Trả url upload file lên AWS S3, sau đó FE sẽ dùng url này để upload trực tiếp lên S3 mà không phải qua BE
    @Post()
    async uploadFile(@Body() body: { fileName: string; fileType: string }) {
        const upload = await getUploadUrl(body.fileName, body.fileType);
        return {
            uploadUrl: upload.uploadUrl,
            fileUrl: upload.fileUrl,
        }
    }
}