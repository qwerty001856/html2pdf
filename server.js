const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { install, computeExecutablePath, Browser, BrowserPlatform } = require('@puppeteer/browsers');

const CHROME_VERSION = '127.0.6533.88';
const CACHE_DIR = path.join(__dirname, '.cache', 'puppeteer');

// --- Ensure Chrome is installed ---
async function ensureChrome() {
  try {
    // Check if Chrome already exists in our cache dir
    const existingPath = computeExecutablePath({
      browser: Browser.CHROME,
      buildId: CHROME_VERSION,
      cacheDir: CACHE_DIR,
    });
    if (fs.existsSync(existingPath)) {
      console.log('Chrome found at:', existingPath);
      return existingPath;
    }
  } catch {
    // computeExecutablePath throws if not found — that's expected
  }

  console.log('Chrome not found. Downloading (one-time)...');
  const result = await install({
    browser: Browser.CHROME,
    buildId: CHROME_VERSION,
    cacheDir: CACHE_DIR,
  });
  console.log('Chrome downloaded to:', result.executablePath);
  return result.executablePath;
}

// --- Express app ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/generate-pdf', async (req, res) => {
  const { html } = req.body;

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'No HTML provided' });
  }

  let browser;
  try {
    // Set env so Puppeteer uses our cache dir for launch
    process.env.PUPPETEER_CACHE_DIR = CACHE_DIR;

    const executablePath = await ensureChrome();

    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();

    // Wrap the HTML in a full document if it doesn't already have html/body tags
    const fullHtml = /<html[\s>]/i.test(html)
      ? html
      : `<!DOCTYPE html><html><head><style>
          body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
        </style></head><body>${html}</body></html>`;

    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="document.pdf"',
      'Content-Length': pdf.length,
    });

    res.send(pdf);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'Failed to generate PDF: ' + err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Start server after ensuring Chrome is ready
ensureChrome().then(() => {
  app.listen(PORT, () => {
    console.log(`html2pdf server running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to install Chrome:', err);
  process.exit(1);
});
