import puppeteer, { type Browser, type Page } from 'puppeteer';

/** One headless Chrome page reused for every frame. Pages always get an explicit white background. */
export class Renderer {
  private readonly browser: Browser;
  private readonly page: Page;

  private constructor(browser: Browser, page: Page) {
    this.browser = browser;
    this.page = page;
  }

  static async launch(): Promise<Renderer> {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    return new Renderer(browser, page);
  }

  async renderHtml(html: string, width: number, height: number, pauseAtMs?: number): Promise<Buffer> {
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    await this.page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await this.page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${html}</body></html>`);
    if (pauseAtMs !== undefined) {
      await this.page.evaluate((ms) => {
        for (const a of document.getAnimations()) {
          a.pause();
          a.currentTime = ms;
        }
      }, pauseAtMs);
    }
    return Buffer.from(await this.page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: w, height: h } }));
  }

  renderSvg(svg: string, width: number, height: number, pauseAtMs?: number): Promise<Buffer> {
    return this.renderHtml(svg, width, height, pauseAtMs);
  }

  /** Full-page screenshot, for contact sheets and montages. */
  async renderPage(html: string, width = 1400): Promise<Buffer> {
    await this.page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
    await this.page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${html}</body></html>`);
    return Buffer.from(await this.page.screenshot({ type: 'png', fullPage: true }));
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
