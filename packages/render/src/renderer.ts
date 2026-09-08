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
    // CI runners (ubuntu-latest) restrict unprivileged user namespaces, which breaks Chrome's
    // setuid sandbox. These are throwaway CI/local processes rendering our own content, so
    // running without the sandbox there is an acceptable tradeoff.
    const args = process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];
    const browser = await puppeteer.launch({ args });
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

  /**
   * Like `renderHtml`, but for targets that draw asynchronously (e.g. a WASM runtime): waits for
   * the page to set `window.__ready = true` (or `window.__error`) before screenshotting.
   */
  async renderHtmlWhenReady(html: string, width: number, height: number, timeoutMs = 20_000): Promise<Buffer> {
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    await this.page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await this.page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${html}</body></html>`);
    await this.page.waitForFunction('window.__ready === true || window.__error', { timeout: timeoutMs });
    const error = await this.page.evaluate(() => (globalThis as unknown as { __error?: string }).__error);
    if (error) throw new Error(`page render failed: ${error}`);
    return Buffer.from(await this.page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: w, height: h } }));
  }

  /**
   * Loads `html` (expected to set `window.__done` to `true` once finished, and `window.__result`
   * to a JSON-serializable value, or `window.__error` to a message on failure) and returns
   * `__result`. For checks that need to run script in the page and read back data rather than a
   * screenshot, e.g. asserting on a loaded dotLottie's manifest.
   */
  async evaluate<T>(html: string, timeoutMs = 20_000): Promise<T> {
    // setContent replaces the DOM but keeps the window. Clear the handshake
    // before an asynchronous module can expose results from the previous check.
    await this.page.setContent(`<!doctype html><html><body style="margin:0;background:#fff"><script>window.__done=false;window.__error=undefined;window.__result=undefined;</script>${html}</body></html>`);
    await this.page.waitForFunction('window.__done === true || window.__error', { timeout: timeoutMs });
    const error = await this.page.evaluate(() => (globalThis as unknown as { __error?: string }).__error);
    if (error) throw new Error(`page evaluation failed: ${error}`);
    return this.page.evaluate(() => (globalThis as unknown as { __result: unknown }).__result) as Promise<T>;
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
