import * as puppeteer from 'puppeteer';
import { existsSync } from 'fs';

const normalizeHtmlForPdf = (html: string): string => {
    const raw = (html || '').trim();
    const fixed = raw.replace(/min-padding\s*:/gi, 'padding:');

    if (/<html[\s>]/i.test(fixed)) {
        return fixed;
    }

    return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    @page { size: A4; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: "Times New Roman", Times, serif;
    }
    *, *::before, *::after { box-sizing: border-box; }
  </style>
</head>
<body>${fixed}</body>
</html>`;
};

/**
 * Chuyển HTML string thành PDF Buffer bằng Puppeteer + Chromium hệ thống.
 */
export const htmlStringToPdfBuffer = async (html: string): Promise<Buffer> => {
    const executableCandidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_BIN,
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/lib/chromium/chromium',
    ].filter((value): value is string => Boolean(value));

    const executablePath = executableCandidates.find(path => existsSync(path));
    if (!executablePath) {
        throw new Error(`System Chromium not found. Checked: ${executableCandidates.join(', ')}`);
    }

    const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    });

    try {
        const page = await browser.newPage();
        const htmlForPdf = normalizeHtmlForPdf(html);

        await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
        await page.emulateMediaType('screen');

        await page.setContent(htmlForPdf, {
            waitUntil: 'networkidle0',
            timeout: 45000,
        });

        await page.evaluate(async () => {
            if (document.fonts?.ready) {
                await document.fonts.ready;
            }
        });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            margin: {
                top: '0mm',
                right: '0mm',
                bottom: '0mm',
                left: '0mm',
            },
        });

        return Buffer.from(pdfBuffer);
    } finally {
        await browser.close();
    }
};