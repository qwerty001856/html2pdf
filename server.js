const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');

// Store Chrome inside the project directory so it's bundled in the deployment slug.
// Render's build cache (/opt/render/.cache) is NOT available at runtime, but the
// project directory is. Force-set (not ||=) because Render's env already sets this.
process.env.PUPPETEER_CACHE_DIR = path.join(__dirname, '.cache', 'puppeteer');

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
    browser = await puppeteer.launch({
      headless: true,
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

app.listen(PORT, () => {
  console.log(`html2pdf server running on http://localhost:${PORT}`);
});
