import time
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, HttpUrl

from .config import TIMEOUT_MS

app = FastAPI(title="Scrapling Sidecar", version="1.0.0")

_start_time = time.time()


class FetchOptions(BaseModel):
    wait_selector: Optional[str] = None
    wait_ms: Optional[int] = None
    block_resources: Optional[bool] = True
    raw_text: Optional[bool] = False
    timeout_ms: Optional[int] = None


class FetchRequest(BaseModel):
    url: str
    mode: str = "stealth"
    options: FetchOptions = FetchOptions()


class FetchResponse(BaseModel):
    ok: bool
    html: Optional[str] = None
    error: Optional[str] = None
    status_code: int = 200
    elapsed_ms: int = 0


@app.get("/health")
async def health():
    return {"ok": True, "version": "1.0.0", "uptime_s": int(time.time() - _start_time)}


@app.post("/fetch", response_model=FetchResponse)
async def fetch(req: FetchRequest):
    start = time.time()
    timeout = req.options.timeout_ms or TIMEOUT_MS

    try:
        if req.mode == "stealth":
            html = await _stealth_fetch(req.url, req.options, timeout)
        else:
            html = await _fast_fetch(req.url, req.options, timeout)

        elapsed = int((time.time() - start) * 1000)

        if req.options.raw_text and html:
            from scrapling import Adaptor
            page = Adaptor(html, auto_match=False)
            text = page.get_all_text(separator="\n")
            return FetchResponse(ok=True, html=text, status_code=200, elapsed_ms=elapsed)

        return FetchResponse(ok=True, html=html, status_code=200, elapsed_ms=elapsed)

    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        return FetchResponse(ok=False, error=str(e), status_code=403, elapsed_ms=elapsed)


async def _stealth_fetch(url: str, options: FetchOptions, timeout_ms: int) -> str:
    from scrapling.fetchers import StealthyFetcher

    kwargs = {
        "headless": True,
        "block_images": options.block_resources,
        "timeout": timeout_ms,
    }

    if options.wait_selector:
        kwargs["wait_selector"] = options.wait_selector

    page = StealthyFetcher.fetch(url, **kwargs)

    if options.wait_ms and options.wait_ms > 0:
        import asyncio
        await asyncio.sleep(options.wait_ms / 1000)

    return page.html_content if hasattr(page, "html_content") else str(page)


async def _fast_fetch(url: str, options: FetchOptions, timeout_ms: int) -> str:
    from scrapling.fetchers import Fetcher

    kwargs = {
        "timeout": timeout_ms / 1000,
    }

    page = Fetcher.get(url, **kwargs)
    return page.html_content if hasattr(page, "html_content") else str(page)
