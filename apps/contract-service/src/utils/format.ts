import { generatePdf } from 'html-pdf-node';
import { Buffer } from 'buffer';

/**
 * Chuyển HTML string thành PDF Buffer bằng html-pdf-node
 */
export const htmlStringToPdfBuffer = async (html: string): Promise<Buffer> => {
    const file = { content: html };
    const options = { format: 'A4' };

    const pdfBuffer = await generatePdf(file, options);
    return Buffer.from(pdfBuffer);
};