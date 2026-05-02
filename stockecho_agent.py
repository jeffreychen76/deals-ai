import json
import math
import random
import threading
import tkinter as tk
from tkinter import font, messagebox
from urllib import parse, request
from urllib.error import URLError
import webbrowser
from datetime import datetime, timedelta
import xml.etree.ElementTree as ET
from pathlib import Path


APP_NAME = "Echo"
WINDOW_SIZE = "1280x980"
BASE_DIR = Path(__file__).resolve().parent
WATCHLIST_FILE = BASE_DIR / "stockecho_watchlist.json"
POSTS_FILE = BASE_DIR / "stockecho_recent_posts.json"

DEFAULT_WATCHLIST = ["NVDA", "AAPL", "TSLA", "AMD", "MSFT"]
DEFAULT_TRACKED = ["NVDA", "TSLA", "AAPL", "GOOGL", "AMD", "SPX", "OIL"]

SYMBOL_ALIASES = {
    "SPX": "^GSPC",
    "OIL": "CL=F",
}

SYMBOL_META = {
    "NVDA": {"name": "NVIDIA", "cashtag": "$NVDA"},
    "TSLA": {"name": "Tesla", "cashtag": "$TSLA"},
    "AAPL": {"name": "Apple", "cashtag": "$AAPL"},
    "GOOGL": {"name": "Alphabet", "cashtag": "$GOOGL"},
    "AMD": {"name": "AMD", "cashtag": "$AMD"},
    "MSFT": {"name": "Microsoft", "cashtag": "$MSFT"},
    "AMZN": {"name": "Amazon", "cashtag": "$AMZN"},
    "META": {"name": "Meta", "cashtag": "$META"},
    "SPX": {"name": "S&P 500", "cashtag": "$SPY"},
    "OIL": {"name": "WTI Crude", "cashtag": "$USO"},
}

OFFLINE_QUOTES = {
    "NVDA": {"price": 946.82, "change": 24.48, "percent": 2.66, "marketCap": 2335000000000, "pe": 71.2, "high52": 974.0, "volume": 48620000},
    "TSLA": {"price": 176.14, "change": -3.18, "percent": -1.77, "marketCap": 561400000000, "pe": 53.1, "high52": 299.29, "volume": 84220000},
    "AAPL": {"price": 198.45, "change": 1.62, "percent": 0.82, "marketCap": 3040000000000, "pe": 31.4, "high52": 199.62, "volume": 51210000},
    "GOOGL": {"price": 163.24, "change": 2.01, "percent": 1.25, "marketCap": 2029000000000, "pe": 26.8, "high52": 165.0, "volume": 21980000},
    "AMD": {"price": 168.73, "change": 3.41, "percent": 2.06, "marketCap": 272300000000, "pe": 58.7, "high52": 227.3, "volume": 50400000},
    "MSFT": {"price": 418.28, "change": 4.12, "percent": 1.0, "marketCap": 3105000000000, "pe": 37.8, "high52": 430.82, "volume": 18300000},
    "SPX": {"price": 5238.84, "change": 32.17, "percent": 0.62, "marketCap": None, "pe": None, "high52": 5264.85, "volume": None},
    "OIL": {"price": 81.74, "change": 1.28, "percent": 1.59, "marketCap": None, "pe": None, "high52": 95.03, "volume": None},
}

OFFLINE_NEWS = {
    "market": [
        {
            "title": "Mega-cap leadership is still doing the heavy lifting",
            "subtitle": "Semis and software remain the cleanest risk-on read across the tape.",
            "link": "https://finance.yahoo.com/",
            "source": "Desk Note",
        },
        {
            "title": "Energy bid keeps inflation chatter alive",
            "subtitle": "Crude strength is back in focus as traders re-price the macro path.",
            "link": "https://finance.yahoo.com/",
            "source": "Desk Note",
        },
        {
            "title": "Breadth matters more than index headlines today",
            "subtitle": "The index can look fine while participation underneath starts to narrow.",
            "link": "https://finance.yahoo.com/",
            "source": "Desk Note",
        },
    ]
}

X_POST_LIBRARY = {
    "NVDA": {
        "author": "NVIDIA AI Developer",
        "handle": "@NVIDIAAIDev",
        "text": "It's official — the Arm + NVIDIA Developer Community is now LIVE with learning paths, livestreams, hackathons, and project spotlights.",
        "url": "https://x.com/NVIDIAAIDev/status/2031460080856473939",
    },
    "TSLA": {
        "author": "Tesla",
        "handle": "@Tesla",
        "text": "Tesla Investor Day.",
        "url": "https://x.com/Tesla/status/1631040930269609984",
    },
    "AAPL": {
        "author": "Reuters",
        "handle": "@Reuters",
        "text": "Foxconn first-quarter revenue jumps, company cautions on geopolitics.",
        "url": "https://x.com/Reuters/status/2040761421256945741",
    },
    "GOOGL": {
        "author": "Reuters",
        "handle": "@Reuters",
        "text": "Google secures EU antitrust approval for its $32 billion Wiz acquisition.",
        "url": "https://x.com/Reuters/status/2021364841101902226",
    },
    "AMD": {
        "author": "AMD",
        "handle": "@AMD",
        "text": "AMD says it is proud to be a founding member of the Optical Compute Interconnect MSA to help scale next-generation AI infrastructure.",
        "url": "https://x.com/AMD/status/2032135693468676430",
    },
    "SPX": {
        "author": "Reuters",
        "handle": "@Reuters",
        "text": "Stocks near record highs after bullish US jobs data.",
        "url": "https://x.com/Reuters/status/2021927318202065051",
    },
    "OIL": {
        "author": "Reuters",
        "handle": "@Reuters",
        "text": "Oil prices rise sharply as investors fear further Middle East escalation.",
        "url": "https://x.com/Reuters/status/2037224333924323815",
    },
    "MARKET": {
        "author": "Reuters",
        "handle": "@Reuters",
        "text": "Stocks near record highs after bullish US jobs data.",
        "url": "https://x.com/Reuters/status/2021927318202065051",
    },
}


class Theme:
    BG = "#f3f5f7"
    SURFACE = "#ffffff"
    SURFACE_ALT = "#f8fafb"
    BORDER = "#dfe5ea"
    TEXT = "#111111"
    MUTED = "#64707d"
    GREEN = "#c9f36d"
    GREEN_DARK = "#90c12d"
    BLUE = "#e9f2ff"
    RED = "#ffe8e4"
    RED_DARK = "#d45d4c"
    POSITIVE = "#0b8f55"
    NEGATIVE = "#cc563d"
    SHADOW = "#e7ebef"
    THUMB = "#dbe2e8"
    CHART = "#0f1720"
    GRID = "#dfe5ea"
    VOLUME = "#d2e5db"
    AVATAR_COLORS = ["#f5d0a9", "#cce4ff", "#d9f2d7", "#f6d2df", "#e5defa"]


def safe_json_load(path, default):
    if not path.exists():
        return default
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (json.JSONDecodeError, OSError):
        return default


def safe_json_save(path, payload):
    try:
        with path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
    except OSError:
        pass


def normalize_symbol(symbol):
    cleaned = (symbol or "").strip().upper().replace("$", "")
    return cleaned


def yahoo_symbol(symbol):
    return SYMBOL_ALIASES.get(symbol, symbol)


def display_symbol(raw_symbol):
    for alias, raw in SYMBOL_ALIASES.items():
        if raw == raw_symbol:
            return alias
    return raw_symbol


def friendly_name(symbol):
    return SYMBOL_META.get(symbol, {}).get("name", symbol)


def cashtag(symbol):
    return SYMBOL_META.get(symbol, {}).get("cashtag", f"${symbol}")


def format_price(value):
    if value is None:
        return "—"
    if abs(value) >= 1000:
        return f"{value:,.2f}"
    return f"{value:.2f}"


def format_change(change, percent):
    if change is None or percent is None:
        return "—"
    sign = "+" if change >= 0 else ""
    return f"{sign}{change:.2f} ({sign}{percent:.2f}%)"


def format_large_number(value):
    if value is None:
        return "—"
    absolute = abs(value)
    if absolute >= 1_000_000_000_000:
        return f"{value / 1_000_000_000_000:.2f}T"
    if absolute >= 1_000_000_000:
        return f"{value / 1_000_000_000:.2f}B"
    if absolute >= 1_000_000:
        return f"{value / 1_000_000:.2f}M"
    return f"{value:,.0f}"


def format_pe(value):
    if value in (None, 0):
        return "—"
    return f"{value:.1f}"


def human_time(dt_obj):
    hour = dt_obj.hour % 12 or 12
    minute = f"{dt_obj.minute:02d}"
    suffix = "AM" if dt_obj.hour < 12 else "PM"
    return f"{hour}:{minute} {suffix}"


def clamp_text(text, limit=88):
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "…"


def format_axis_time(timestamp, first_timestamp, last_timestamp):
    dt_obj = datetime.fromtimestamp(timestamp)
    if last_timestamp - first_timestamp <= 172800:
        return human_time(dt_obj)
    return dt_obj.strftime("%b %d")


class ScrollableFrame(tk.Frame):
    def __init__(self, parent, bg):
        super().__init__(parent, bg=bg)
        self.canvas = tk.Canvas(self, bg=bg, highlightthickness=0, bd=0)
        self.scrollbar = tk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.container = tk.Frame(self.canvas, bg=bg)

        self.container.bind(
            "<Configure>",
            lambda event: self.canvas.configure(scrollregion=self.canvas.bbox("all")),
        )

        self.window_id = self.canvas.create_window((0, 0), window=self.container, anchor="nw")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)
        self.canvas.bind(
            "<Configure>",
            lambda event: self.canvas.itemconfigure(self.window_id, width=event.width),
        )

        self.canvas.pack(side="left", fill="both", expand=True)
        self.scrollbar.pack(side="right", fill="y")

        self.canvas.bind("<Enter>", self._bind_mousewheel)
        self.canvas.bind("<Leave>", self._unbind_mousewheel)

    def _bind_mousewheel(self, _event):
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel, add="+")
        self.canvas.bind_all("<Button-4>", self._on_mousewheel_linux, add="+")
        self.canvas.bind_all("<Button-5>", self._on_mousewheel_linux, add="+")

    def _unbind_mousewheel(self, _event):
        self.canvas.unbind_all("<MouseWheel>")
        self.canvas.unbind_all("<Button-4>")
        self.canvas.unbind_all("<Button-5>")

    def _on_mousewheel(self, event):
        self.canvas.yview_scroll(int(-event.delta / 120), "units")

    def _on_mousewheel_linux(self, event):
        if event.num == 4:
            self.canvas.yview_scroll(-1, "units")
        elif event.num == 5:
            self.canvas.yview_scroll(1, "units")


class MarketService:
    def __init__(self):
        self.timeout = 6

    def _fetch_json(self, url):
        req = request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with request.urlopen(req, timeout=self.timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    def _fetch_xml(self, url):
        req = request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with request.urlopen(req, timeout=self.timeout) as response:
            return ET.fromstring(response.read())

    def fetch_quotes(self, symbols):
        normalized = [normalize_symbol(symbol) for symbol in symbols if normalize_symbol(symbol)]
        if not normalized:
            return {}

        raw_map = {symbol: yahoo_symbol(symbol) for symbol in normalized}
        symbols_query = ",".join(sorted(set(raw_map.values())))
        url = f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={parse.quote(symbols_query)}"

        try:
            payload = self._fetch_json(url)
            results = payload.get("quoteResponse", {}).get("result", [])
            by_raw = {item.get("symbol"): item for item in results}
            quotes = {}
            for symbol in normalized:
                raw = raw_map[symbol]
                row = by_raw.get(raw)
                if row:
                    quotes[symbol] = {
                        "symbol": symbol,
                        "name": row.get("shortName") or row.get("longName") or friendly_name(symbol),
                        "price": row.get("regularMarketPrice"),
                        "change": row.get("regularMarketChange"),
                        "percent": row.get("regularMarketChangePercent"),
                        "marketCap": row.get("marketCap"),
                        "pe": row.get("trailingPE"),
                        "high52": row.get("fiftyTwoWeekHigh"),
                        "volume": row.get("regularMarketVolume"),
                        "avgVolume": row.get("averageDailyVolume3Month"),
                        "dayHigh": row.get("regularMarketDayHigh"),
                        "dayLow": row.get("regularMarketDayLow"),
                        "time": row.get("regularMarketTime"),
                    }
            return quotes
        except (URLError, json.JSONDecodeError, TimeoutError, ValueError):
            return self.offline_quotes(normalized)

    def offline_quotes(self, symbols):
        quotes = {}
        for symbol in symbols:
            base = OFFLINE_QUOTES.get(symbol)
            if not base:
                base = {
                    "price": round(random.uniform(40, 420), 2),
                    "change": round(random.uniform(-4.8, 5.4), 2),
                    "percent": round(random.uniform(-2.2, 3.5), 2),
                    "marketCap": random.randint(20, 900) * 1_000_000_000,
                    "pe": round(random.uniform(15, 60), 1),
                    "high52": round(random.uniform(60, 460), 2),
                    "volume": random.randint(2, 80) * 1_000_000,
                }
            quotes[symbol] = {
                "symbol": symbol,
                "name": friendly_name(symbol),
                "price": base.get("price"),
                "change": base.get("change"),
                "percent": base.get("percent"),
                "marketCap": base.get("marketCap"),
                "pe": base.get("pe"),
                "high52": base.get("high52"),
                "volume": base.get("volume"),
                "avgVolume": base.get("volume"),
                "dayHigh": None,
                "dayLow": None,
                "time": None,
            }
        return quotes

    def fetch_chart(self, symbol, range_name="3mo", interval="1d"):
        raw_symbol = yahoo_symbol(normalize_symbol(symbol))
        url = (
            "https://query1.finance.yahoo.com/v8/finance/chart/"
            f"{parse.quote(raw_symbol)}?range={parse.quote(range_name)}&interval={parse.quote(interval)}"
        )
        try:
            payload = self._fetch_json(url)
            result = payload.get("chart", {}).get("result", [{}])[0]
            timestamps = result.get("timestamp") or []
            indicators = result.get("indicators", {}).get("quote", [{}])[0]
            closes = indicators.get("close") or []
            volumes = indicators.get("volume") or []
            points = []
            for timestamp, close, volume in zip(timestamps, closes, volumes):
                if close is None:
                    continue
                points.append(
                    {
                        "timestamp": timestamp,
                        "close": close,
                        "volume": volume or 0,
                    }
                )
            if points:
                return points
        except (URLError, json.JSONDecodeError, TimeoutError, ValueError, IndexError):
            pass
        return self.synthetic_chart(symbol)

    def synthetic_chart(self, symbol):
        quote = OFFLINE_QUOTES.get(symbol, {"price": 120.0})
        anchor = quote["price"]
        points = []
        price = anchor * random.uniform(0.92, 0.98)
        start = datetime.now() - timedelta(days=89)
        for day in range(90):
            drift = random.uniform(-0.02, 0.025)
            price = max(5, price * (1 + drift))
            points.append(
                {
                    "timestamp": int((start + timedelta(days=day)).timestamp()),
                    "close": round(price, 2),
                    "volume": random.randint(3_000_000, 65_000_000),
                }
            )
        return points

    def fetch_news(self, query_text, limit=6):
        encoded = parse.quote(query_text)
        url = f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en"
        try:
            root = self._fetch_xml(url)
            items = []
            for item in root.findall(".//item")[:limit]:
                title = item.findtext("title", default="")
                link = item.findtext("link", default="https://news.google.com/")
                pub_date = item.findtext("pubDate", default="")
                source = item.findtext("source", default="Google News")
                items.append(
                    {
                        "title": clamp_text(title.replace(" - ", " | "), 110),
                        "subtitle": clamp_text(pub_date, 90),
                        "link": link,
                        "source": source,
                    }
                )
            if items:
                return items
        except (URLError, ET.ParseError, TimeoutError, ValueError):
            pass
        return OFFLINE_NEWS.get("market", [])[:limit]


class StockEchoApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_NAME)
        self.geometry(WINDOW_SIZE)
        self.minsize(1120, 820)
        self.configure(bg=Theme.BG)

        self.service = MarketService()
        raw_watchlist = safe_json_load(WATCHLIST_FILE, DEFAULT_WATCHLIST)
        if not isinstance(raw_watchlist, list):
            raw_watchlist = DEFAULT_WATCHLIST
        self.watchlist = [normalize_symbol(item) for item in raw_watchlist]
        self.watchlist = [item for item in self.watchlist if item] or DEFAULT_WATCHLIST[:]
        raw_posts = safe_json_load(POSTS_FILE, [])
        self.recent_posts = raw_posts if isinstance(raw_posts, list) else []
        self.quotes = self.service.offline_quotes(DEFAULT_TRACKED + self.watchlist)
        self.market_news = OFFLINE_NEWS["market"][:]
        self.top_insights = []
        self.deep_dive_feed = []
        self.current_detail_symbol = "NVDA"
        self.current_post_text = ""
        self.current_post_topic = None
        self.autonomous_active = False
        self.autonomous_queue = []
        self.executed_auto_keys = set()
        self.loading_details = False

        self.title_font = font.Font(family="Helvetica", size=26, weight="bold")
        self.section_font = font.Font(family="Helvetica", size=16, weight="bold")
        self.card_title_font = font.Font(family="Helvetica", size=14, weight="bold")
        self.body_font = font.Font(family="Helvetica", size=11)
        self.small_font = font.Font(family="Helvetica", size=10)

        self._build_shell()
        self._build_home_page()
        self._build_deep_dive_page()
        self._build_detail_page()
        self.show_home()
        self.refresh_market_data()
        self.schedule_periodic_refresh()
        self.schedule_autonomous_tick()

    def _build_shell(self):
        self.topbar = tk.Frame(self, bg=Theme.SURFACE, height=88, highlightthickness=1, highlightbackground=Theme.BORDER)
        self.topbar.pack(fill="x", padx=18, pady=(18, 10))
        self.topbar.pack_propagate(False)

        brand = tk.Frame(self.topbar, bg=Theme.SURFACE)
        brand.pack(side="left", padx=28, pady=18)
        tk.Label(
            brand,
            text=APP_NAME,
            bg=Theme.SURFACE,
            fg=Theme.TEXT,
            font=self.title_font,
        ).pack(anchor="w")
        tk.Label(
            brand,
            text=datetime.now().strftime("%A, %B %d"),
            bg=Theme.SURFACE,
            fg=Theme.MUTED,
            font=self.body_font,
        ).pack(anchor="w", pady=(2, 0))

        self.generate_button = self.make_button(
            self.topbar,
            text="Generate Post",
            bg=Theme.GREEN,
            activebackground=Theme.GREEN_DARK,
            font=("Helvetica", 13, "bold"),
            padx=26,
            pady=12,
            command=self.open_post_modal,
        )
        self.generate_button.pack(side="right", padx=26, pady=18)

        self.page_host = tk.Frame(self, bg=Theme.BG)
        self.page_host.pack(fill="both", expand=True, padx=18, pady=(0, 10))

        self.bottom_bar = tk.Frame(self, bg=Theme.SURFACE, height=66, highlightthickness=1, highlightbackground=Theme.BORDER)
        self.bottom_bar.pack(fill="x", padx=18, pady=(0, 18))
        self.bottom_bar.pack_propagate(False)

        left = tk.Frame(self.bottom_bar, bg=Theme.SURFACE)
        left.pack(side="left", padx=20, pady=12)

        self.auto_button = self.make_button(
            left,
            text="Autonomous Mode",
            bg=Theme.BLUE,
            activebackground="#d8e7ff",
            padx=18,
            pady=10,
            command=self.start_autonomous_mode,
        )
        self.auto_button.pack(side="left")

        self.stop_button = self.make_button(
            left,
            text="Stop",
            bg="#f1f3f5",
            activebackground="#e7ecef",
            padx=18,
            pady=10,
            command=self.stop_autonomous_mode,
        )
        self.stop_button.pack(side="left", padx=(10, 0))

        self.status_label = tk.Label(
            self.bottom_bar,
            text="Live market dashboard ready.",
            bg=Theme.SURFACE,
            fg=Theme.MUTED,
            font=self.body_font,
        )
        self.status_label.pack(side="right", padx=22)

    def _build_home_page(self):
        self.home_page = ScrollableFrame(self.page_host, Theme.BG)
        self.home_page.place(relx=0, rely=0, relwidth=1, relheight=1)
        container = self.home_page.container

        self.top_card = self.make_card(container, pady=22)
        self.top_card.pack(fill="x", pady=(0, 18))
        header_row = tk.Frame(self.top_card, bg=Theme.SURFACE)
        header_row.pack(fill="x", padx=24, pady=(0, 14))

        tk.Label(
            header_row,
            text="📌 Top 3 Things to Know Today",
            bg=Theme.SURFACE,
            fg=Theme.TEXT,
            font=self.section_font,
        ).pack(side="left")

        prompt = tk.Label(
            header_row,
            text="Open Deep Dive",
            bg=Theme.SURFACE,
            fg=Theme.MUTED,
            font=self.body_font,
            cursor="hand2",
        )
        prompt.pack(side="right")
        prompt.bind("<Button-1>", lambda event: self.open_deep_dive())

        self.top_items_holder = tk.Frame(self.top_card, bg=Theme.SURFACE)
        self.top_items_holder.pack(fill="x", padx=24, pady=(0, 4))

        columns = tk.Frame(container, bg=Theme.BG)
        columns.pack(fill="x", pady=(0, 18))
        columns.grid_columnconfigure(0, weight=3)
        columns.grid_columnconfigure(1, weight=2)

        self.popular_card = self.make_card(columns, pady=18)
        self.popular_card.grid(row=0, column=0, sticky="nsew", padx=(0, 9))
        tk.Label(
            self.popular_card,
            text="🔥 Most Popular Stock Picks Right Now",
            bg=Theme.SURFACE,
            fg=Theme.TEXT,
            font=self.section_font,
        ).pack(anchor="w", padx=22, pady=(4, 12))
        self.popular_holder = tk.Frame(self.popular_card, bg=Theme.SURFACE)
        self.popular_holder.pack(fill="x", padx=22, pady=(0, 10))

        self.watchlist_card = self.make_card(columns, pady=18)
        self.watchlist_card.grid(row=0, column=1, sticky="nsew", padx=(9, 0))
        watchlist_header = tk.Frame(self.watchlist_card, bg=Theme.SURFACE)
        watchlist_header.pack(fill="x", padx=22, pady=(4, 12))
        tk.Label(
            watchlist_header,
            text="⭐ My Watchlist",
            bg=Theme.SURFACE,
            fg=Theme.TEXT,
            font=self.section_font,
        ).pack(side="left")

        add_row = tk.Frame(self.watchlist_card, bg=Theme.SURFACE)
        add_row.pack(fill="x", padx=22, pady=(0, 14))
        self.watchlist_entry = tk.Entry(
            add_row,
            font=self.body_font,
            bg=Theme.SURFACE_ALT,
            fg=Theme.TEXT,
            relief="flat",
            highlightthickness=1,
            highlightbackground=Theme.BORDER,
            highlightcolor=Theme.BORDER,
            insertbackground=Theme.TEXT,
        )
        self.watchlist_entry.pack(side="left", fill="x", expand=True, ipady=9, padx=(0, 10))
        self.watchlist_entry.bind("<Return>", lambda event: self.add_to_watchlist())

        add_button = self.make_button(
            add_row,
            text="Add",
            bg=Theme.GREEN,
            activebackground=Theme.GREEN_DARK,
            padx=18,
            pady=8,
            command=self.add_to_watchlist,
        )
        add_button.pack(side="right")

        self.watchlist_holder = tk.Frame(self.watchlist_card, bg=Theme.SURFACE)
        self.watchlist_holder.pack(fill="x", padx=22, pady=(0, 12))

        self.posts_card = self.make_card(container, pady=18)
        self.posts_card.pack(fill="x")
        tk.Label(
            self.posts_card,
            text="📜 My Recent Posts",
            bg=Theme.SURFACE,
            fg=Theme.TEXT,
            font=self.section_font,
        ).pack(anchor="w", padx=22, pady=(4, 12))
        self.posts_holder = tk.Frame(self.posts_card, bg=Theme.SURFACE)
        self.posts_holder.pack(fill="x", padx=22, pady=(0, 10))

    def _build_deep_dive_page(self):
        self.deep_dive_page = tk.Frame(self.page_host, bg=Theme.BG)
        self.deep_dive_page.place(relx=0, rely=0, relwidth=1, relheight=1)

        header = self.make_card(self.deep_dive_page, pady=18)
        header.pack(fill="x", pady=(0, 14))
        top = tk.Frame(header, bg=Theme.SURFACE)
        top.pack(fill="x", padx=22)
        self.make_button(
            top,
            text="←",
            bg="#f1f3f5",
            activebackground="#e7ecef",
            padx=14,
            pady=8,
            command=self.show_home,
        ).pack(side="left")

        title_wrap = tk.Frame(top, bg=Theme.SURFACE)
        title_wrap.pack(side="left", padx=16)
        tk.Label(
            title_wrap,
            text="Today's Top Picks",
            bg=Theme.SURFACE,
            fg=Theme.TEXT,
            font=self.section_font,
        ).pack(anchor="w")
        self.deep_dive_subtitle = tk.Label(
            title_wrap,
            text="Tap any article or X post to jump out.",
            bg=Theme.SURFACE,
            fg=Theme.MUTED,
            font=self.body_font,
        )
        self.deep_dive_subtitle.pack(anchor="w", pady=(2, 0))

        self.deep_scroll = ScrollableFrame(self.deep_dive_page, Theme.BG)
        self.deep_scroll.pack(fill="both", expand=True)
        self.deep_feed_holder = self.deep_scroll.container

    def _build_detail_page(self):
        self.detail_page = tk.Frame(self.page_host, bg=Theme.BG)
        self.detail_page.place(relx=0, rely=0, relwidth=1, relheight=1)

        header = self.make_card(self.detail_page, pady=18)
        header.pack(fill="x", pady=(0, 14))
        row = tk.Frame(header, bg=Theme.SURFACE)
        row.pack(fill="x", padx=22)

        self.make_button(
            row,
            text="← Back",
            bg="#f1f3f5",
            activebackground="#e7ecef",
            padx=16,
            pady=8,
            command=self.show_home,
        ).pack(side="left")

        label_wrap = tk.Frame(row, bg=Theme.SURFACE)
        label_wrap.pack(side="left", padx=16)
        self.detail_title = tk.Label(
            label_wrap,
            text="NVDA Detail",
            bg=Theme.SURFACE,
            fg=Theme.TEXT,
            font=self.section_font,
        )
        self.detail_title.pack(anchor="w")
        self.detail_subtitle = tk.Label(
            label_wrap,
            text="Loading market structure...",
            bg=Theme.SURFACE,
            fg=Theme.MUTED,
            font=self.body_font,
        )
        self.detail_subtitle.pack(anchor="w", pady=(2, 0))

        self.detail_scroll = ScrollableFrame(self.detail_page, Theme.BG)
        self.detail_scroll.pack(fill="both", expand=True)
        container = self.detail_scroll.container

        self.chart_card = self.make_card(container, pady=18)
        self.chart_card.pack(fill="x", pady=(0, 16))
        chart_header = tk.Frame(self.chart_card, bg=Theme.SURFACE)
        chart_header.pack(fill="x", padx=22, pady=(0, 12))
        self.chart_title_label = tk.Label(
            chart_header,
            text="NVDA  $—",
            bg=Theme.SURFACE,
            fg=Theme.TEXT,
            font=self.section_font,
        )
        self.chart_title_label.pack(side="left")

        self.chart_summary = tk.Label(
            chart_header,
            text="",
            bg=Theme.SURFACE,
            fg=Theme.MUTED,
            font=self.body_font,
        )
        self.chart_summary.pack(side="right")

        self.chart_canvas = tk.Canvas(
            self.chart_card,
            height=360,
            bg=Theme.SURFACE_ALT,
            highlightthickness=1,
            highlightbackground=Theme.BORDER,
            bd=0,
        )
        self.chart_canvas.pack(fill="x", padx=22, pady=(0, 14))

        stats_section = tk.Frame(container, bg=Theme.BG)
        stats_section.pack(fill="x", pady=(0, 16))
        stats_section.grid_columnconfigure(0, weight=1)
        stats_section.grid_columnconfigure(1, weight=1)
        stats_section.grid_columnconfigure(2, weight=1)
        stats_section.grid_columnconfigure(3, weight=1)

        self.stat_cards = []
        for idx in range(4):
            card = self.make_card(stats_section, pady=16)
            card.grid(row=0, column=idx, sticky="nsew", padx=(0 if idx == 0 else 8, 0 if idx == 3 else 8))
            label = tk.Label(card, text="", bg=Theme.SURFACE, fg=Theme.MUTED, font=self.small_font)
            label.pack(anchor="w", padx=18)
            value = tk.Label(card, text="", bg=Theme.SURFACE, fg=Theme.TEXT, font=("Helvetica", 15, "bold"))
            value.pack(anchor="w", padx=18, pady=(6, 0))
            self.stat_cards.append((label, value))

        self.catalyst_card = self.make_card(container, pady=18)
        self.catalyst_card.pack(fill="x")
        tk.Label(
            self.catalyst_card,
            text="Recent Catalysts & News",
            bg=Theme.SURFACE,
            fg=Theme.TEXT,
            font=self.section_font,
        ).pack(anchor="w", padx=22, pady=(0, 12))
        self.catalyst_holder = tk.Frame(self.catalyst_card, bg=Theme.SURFACE)
        self.catalyst_holder.pack(fill="x", padx=22, pady=(0, 10))

    def make_card(self, parent, pady=16):
        card = tk.Frame(parent, bg=Theme.SURFACE, highlightthickness=1, highlightbackground=Theme.BORDER)
        card.configure(padx=0, pady=pady)
        return card

    def make_button(self, parent, text, bg, activebackground, command, font=None, padx=14, pady=8):
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=bg,
            activebackground=activebackground,
            fg="#111111",
            activeforeground="#111111",
            relief="flat",
            bd=0,
            cursor="hand2",
            font=font or self.body_font,
            padx=padx,
            pady=pady,
        )

    def show_home(self):
        self.home_page.tkraise()

    def show_deep_dive(self):
        self.deep_dive_page.tkraise()

    def show_detail(self):
        self.detail_page.tkraise()

    def set_status(self, text):
        self.status_label.configure(text=text)

    def refresh_market_data(self):
        symbols = list(dict.fromkeys(DEFAULT_TRACKED + self.watchlist))
        self.set_status("Refreshing live quotes and headlines...")
        thread = threading.Thread(target=self._refresh_market_data_worker, args=(symbols,), daemon=True)
        thread.start()

    def _refresh_market_data_worker(self, symbols):
        quotes = self.service.fetch_quotes(symbols)
        market_news = self.service.fetch_news("US stock market today earnings inflation fed semiconductors", limit=6)
        self.after(0, lambda: self._apply_market_data(quotes, market_news))

    def _apply_market_data(self, quotes, market_news):
        self.quotes.update(quotes)
        self.market_news = market_news or self.market_news
        self.top_insights = self.build_top_insights()
        self.deep_dive_feed = self.build_deep_dive_feed()
        self.render_home()
        self.set_status(f"Last refresh {human_time(datetime.now())} • Yahoo Finance + public news feeds")

    def schedule_periodic_refresh(self):
        self.after(300000, self._periodic_refresh)

    def _periodic_refresh(self):
        self.refresh_market_data()
        self.schedule_periodic_refresh()

    def build_top_insights(self):
        tracked = [self.quotes.get(symbol) for symbol in DEFAULT_TRACKED if self.quotes.get(symbol)]
        leaders = [row for row in tracked if row.get("percent") is not None and row["symbol"] not in ("SPX", "OIL")]
        leaders.sort(key=lambda item: item.get("percent", 0), reverse=True)

        winner = leaders[0] if leaders else self.quotes.get("NVDA")
        laggard = leaders[-1] if leaders else self.quotes.get("TSLA")
        spx = self.quotes.get("SPX", {})
        oil = self.quotes.get("OIL", {})
        headline = self.market_news[0] if self.market_news else OFFLINE_NEWS["market"][0]

        items = [
            {
                "title": f"{winner['symbol']} is pressing leadership with {winner.get('percent', 0):+.2f}%",
                "explanation": (
                    f"{friendly_name(winner['symbol'])} is setting the tone for risk appetite. "
                    f"When the leader tape stays green, traders usually keep leaning into momentum instead of hiding in cash."
                ),
                "topic": winner["symbol"],
            },
            {
                "title": f"Macro check: SPX {spx.get('percent', 0):+.2f}% while oil sits at {format_price(oil.get('price'))}",
                "explanation": (
                    "The index is the headline, but crude often tells you where inflation nerves are hiding. "
                    "If energy keeps climbing while breadth narrows, the market can get jumpy fast."
                ),
                "topic": "SPX",
            },
            {
                "title": clamp_text(headline["title"], 72),
                "explanation": (
                    f"{headline.get('source', 'Market Wire')} is driving part of today’s conversation. "
                    "This is the kind of headline that can shift positioning even when the price action looks calm on the surface."
                ),
                "topic": laggard["symbol"] if laggard else "AAPL",
            },
        ]
        return items

    def build_deep_dive_feed(self):
        feed = []
        seed_news = self.market_news[:4] or OFFLINE_NEWS["market"]

        for idx, story in enumerate(seed_news):
            feed.append(
                {
                    "kind": "article",
                    "title": story["title"],
                    "subtitle": story.get("subtitle") or story.get("source", "Market Wire"),
                    "link": story["link"],
                    "source": story.get("source", "News"),
                    "topic": self.top_insights[idx]["topic"] if idx < len(self.top_insights) else "MARKET",
                }
            )
            if idx < len(self.top_insights):
                insight = self.top_insights[idx]
                feed.append(self.build_x_post_item(insight["topic"]))
        return feed

    def render_home(self):
        self.render_top_insights()
        self.render_popular_list()
        self.render_watchlist()
        self.render_recent_posts()

    def render_top_insights(self):
        for widget in self.top_items_holder.winfo_children():
            widget.destroy()

        items = self.top_insights or self.build_top_insights()
        for item in items:
            card = tk.Frame(self.top_items_holder, bg=Theme.SURFACE_ALT, cursor="hand2", highlightthickness=1, highlightbackground=Theme.BORDER)
            card.pack(fill="x", pady=7)
            card.bind("<Button-1>", lambda event, topic=item["topic"]: self.open_deep_dive(topic))

            title = tk.Label(
                card,
                text=item["title"],
                bg=Theme.SURFACE_ALT,
                fg=Theme.TEXT,
                font=self.card_title_font,
                anchor="w",
                cursor="hand2",
                wraplength=1060,
                justify="left",
            )
            title.pack(fill="x", padx=18, pady=(14, 4))
            title.bind("<Button-1>", lambda event, topic=item["topic"]: self.open_deep_dive(topic))

            detail = tk.Label(
                card,
                text=item["explanation"],
                bg=Theme.SURFACE_ALT,
                fg=Theme.MUTED,
                font=self.body_font,
                anchor="w",
                justify="left",
                wraplength=1060,
                cursor="hand2",
            )
            detail.pack(fill="x", padx=18, pady=(0, 14))
            detail.bind("<Button-1>", lambda event, topic=item["topic"]: self.open_deep_dive(topic))

    def render_popular_list(self):
        for widget in self.popular_holder.winfo_children():
            widget.destroy()

        picks = []
        for symbol in DEFAULT_TRACKED:
            quote = self.quotes.get(symbol)
            if quote and symbol not in ("SPX", "OIL"):
                picks.append(quote)
        picks.sort(key=lambda item: abs(item.get("percent") or 0), reverse=True)

        for row in picks[:5]:
            self.render_quote_row(
                self.popular_holder,
                row["symbol"],
                removable=False,
                show_label=True,
            )

    def render_watchlist(self):
        for widget in self.watchlist_holder.winfo_children():
            widget.destroy()

        if not self.watchlist:
            tk.Label(
                self.watchlist_holder,
                text="Add a ticker to start tracking it.",
                bg=Theme.SURFACE,
                fg=Theme.MUTED,
                font=self.body_font,
            ).pack(anchor="w")
            return

        for symbol in self.watchlist:
            self.render_quote_row(self.watchlist_holder, symbol, removable=True, show_label=False)

    def render_quote_row(self, parent, symbol, removable, show_label):
        quote = self.quotes.get(symbol, {})
        row = tk.Frame(parent, bg=Theme.SURFACE_ALT, highlightthickness=1, highlightbackground=Theme.BORDER)
        row.pack(fill="x", pady=7)

        info = tk.Frame(row, bg=Theme.SURFACE_ALT)
        info.pack(side="left", fill="x", expand=True, padx=16, pady=14)

        title = symbol if not show_label else f"{symbol} • {friendly_name(symbol)}"
        tk.Label(info, text=title, bg=Theme.SURFACE_ALT, fg=Theme.TEXT, font=self.card_title_font).pack(anchor="w")
        secondary = f"${format_price(quote.get('price'))}   {format_change(quote.get('change'), quote.get('percent'))}"
        color = Theme.POSITIVE if (quote.get("change") or 0) >= 0 else Theme.NEGATIVE
        tk.Label(info, text=secondary, bg=Theme.SURFACE_ALT, fg=color, font=self.body_font).pack(anchor="w", pady=(4, 0))

        actions = tk.Frame(row, bg=Theme.SURFACE_ALT)
        actions.pack(side="right", padx=14, pady=10)

        self.make_button(
            actions,
            text="View Chart",
            bg="#eef2f5",
            activebackground="#e2e8ec",
            padx=16,
            pady=8,
            command=lambda sym=symbol: self.open_detail(sym),
        ).pack(side="left")

        if removable:
            self.make_button(
                actions,
                text="Remove",
                bg="#fff1ee",
                activebackground="#ffe3dd",
                padx=14,
                pady=8,
                command=lambda sym=symbol: self.remove_from_watchlist(sym),
            ).pack(side="left", padx=(8, 0))

    def render_recent_posts(self):
        for widget in self.posts_holder.winfo_children():
            widget.destroy()

        posts = self.recent_posts[:5]
        if not posts:
            empty = tk.Frame(self.posts_holder, bg=Theme.SURFACE_ALT, highlightthickness=1, highlightbackground=Theme.BORDER)
            empty.pack(fill="x", pady=8)
            tk.Label(
                empty,
                text="No posts yet. Use Generate Post to build your first sharp market take.",
                bg=Theme.SURFACE_ALT,
                fg=Theme.MUTED,
                font=self.body_font,
            ).pack(anchor="w", padx=16, pady=18)
            return

        for post in posts:
            card = tk.Frame(self.posts_holder, bg=Theme.SURFACE_ALT, highlightthickness=1, highlightbackground=Theme.BORDER)
            card.pack(fill="x", pady=7)
            top = tk.Frame(card, bg=Theme.SURFACE_ALT)
            top.pack(fill="x", padx=16, pady=(14, 4))
            tk.Label(top, text=post.get("timestamp", ""), bg=Theme.SURFACE_ALT, fg=Theme.MUTED, font=self.small_font).pack(side="left")
            tk.Label(top, text=post.get("source", "Manual"), bg=Theme.SURFACE_ALT, fg=Theme.MUTED, font=self.small_font).pack(side="right")
            tk.Label(
                card,
                text=post.get("text", ""),
                bg=Theme.SURFACE_ALT,
                fg=Theme.TEXT,
                font=self.body_font,
                wraplength=1100,
                justify="left",
            ).pack(fill="x", padx=16, pady=(0, 14))

    def add_to_watchlist(self):
        symbol = normalize_symbol(self.watchlist_entry.get())
        if not symbol:
            return
        if symbol in self.watchlist:
            self.set_status(f"{symbol} is already in your watchlist.")
            return

        self.watchlist.append(symbol)
        self.watchlist = list(dict.fromkeys(self.watchlist))
        safe_json_save(WATCHLIST_FILE, self.watchlist)
        self.watchlist_entry.delete(0, "end")
        self.refresh_market_data()
        self.set_status(f"Added {symbol} to your watchlist.")

    def remove_from_watchlist(self, symbol):
        self.watchlist = [item for item in self.watchlist if item != symbol]
        safe_json_save(WATCHLIST_FILE, self.watchlist)
        self.render_watchlist()
        self.set_status(f"Removed {symbol} from your watchlist.")

    def open_deep_dive(self, topic=None):
        topic = normalize_symbol(topic) or "MARKET"
        self.deep_dive_subtitle.configure(
            text=f"Focused on {topic} with clickable articles and live X jump-outs."
        )
        self.render_deep_dive(topic)
        self.show_deep_dive()
        if topic not in ("MARKET", "SPX"):
            thread = threading.Thread(target=self._load_deep_dive_topic_worker, args=(topic,), daemon=True)
            thread.start()

    def render_deep_dive(self, topic):
        for widget in self.deep_feed_holder.winfo_children():
            widget.destroy()

        feed = self.build_deep_dive_feed()

        for item in feed:
            if item["kind"] == "article":
                self.render_article_card(self.deep_feed_holder, item)
            else:
                self.render_post_card(self.deep_feed_holder, item)

    def _load_deep_dive_topic_worker(self, topic):
        topic_news = self.service.fetch_news(f"{topic} stock earnings guidance product launch", limit=4)
        article_cards = [
            {
                "kind": "article",
                "title": item["title"],
                "subtitle": item.get("subtitle", ""),
                "link": item["link"],
                "source": item.get("source", "Google News"),
                "topic": topic,
            }
            for item in topic_news
        ]
        social_cards = [self.build_x_post_item(topic), self.build_x_post_item("MARKET")]
        merged_feed = article_cards + social_cards + self.build_deep_dive_feed()[:4]
        self.after(0, lambda: self._apply_deep_dive_topic(topic, merged_feed))

    def _apply_deep_dive_topic(self, topic, feed):
        subtitle = f"Focused on {topic} with clickable articles and live X jump-outs."
        if self.deep_dive_subtitle.cget("text") != subtitle:
            return
        for widget in self.deep_feed_holder.winfo_children():
            widget.destroy()
        for item in feed:
            if item["kind"] == "article":
                self.render_article_card(self.deep_feed_holder, item)
            else:
                self.render_post_card(self.deep_feed_holder, item)

    def open_article_link(self, link):
        webbrowser.open(link)

    def build_x_post_item(self, topic):
        normalized_topic = normalize_symbol(topic) or "MARKET"
        post = X_POST_LIBRARY.get(normalized_topic) or X_POST_LIBRARY["MARKET"]
        return {
            "kind": "post",
            "author": post["author"],
            "handle": post["handle"],
            "text": post["text"],
            "topic": normalized_topic,
            "x_url": post["url"],
        }

    def topic_visual_key(self, item):
        title = f"{item.get('topic', '')} {item.get('title', '')} {item.get('subtitle', '')}".upper()
        if "NVDA" in title or "AI" in title or "SEMICONDUCTOR" in title:
            return "ai"
        if "TSLA" in title or "EV" in title or "TESLA" in title:
            return "ev"
        if "AAPL" in title or "APPLE" in title or "IPHONE" in title:
            return "apple"
        if "GOOGL" in title or "GOOGLE" in title or "SEARCH" in title:
            return "search"
        if "AMD" in title or "CHIP" in title:
            return "chip"
        if "OIL" in title or "CRUDE" in title or "ENERGY" in title:
            return "oil"
        if "SPX" in title or "S&P" in title or "MARKET" in title or "STOCKS" in title:
            return "market"
        return "market"

    def bind_card_click(self, widgets, command):
        for widget in widgets:
            widget.bind("<Button-1>", lambda event, action=command: action())
            widget.configure(cursor="hand2")

    def draw_topic_thumbnail(self, canvas, item):
        canvas.delete("all")
        width = 156
        height = 98
        visual = self.topic_visual_key(item)
        palettes = {
            "ai": ("#122033", "#2ce59b", "#d8fff0"),
            "ev": ("#261826", "#ff8968", "#ffe6dd"),
            "apple": ("#182235", "#88b8ff", "#e5efff"),
            "search": ("#221a34", "#b691ff", "#f1e8ff"),
            "chip": ("#102921", "#47d6ab", "#dbfff2"),
            "oil": ("#332611", "#ffc25c", "#fff1d8"),
            "market": ("#17212b", "#86e37d", "#e6f8e2"),
        }
        bg, accent, soft = palettes.get(visual, palettes["market"])
        canvas.create_rectangle(0, 0, width, height, fill=bg, outline=bg)
        canvas.create_rectangle(0, height - 18, width, height, fill=soft, outline=soft)

        if visual in ("ai", "chip"):
            for x in range(22, 135, 24):
                canvas.create_line(x, 18, x, 78, fill="#35516a", width=2)
            canvas.create_rectangle(50, 28, 108, 70, fill=accent, outline=accent, width=2)
            for x in range(58, 101, 14):
                for y in range(35, 64, 14):
                    canvas.create_oval(x, y, x + 8, y + 8, fill=bg, outline=bg)
        elif visual == "ev":
            canvas.create_polygon(25, 63, 48, 43, 98, 43, 124, 60, 122, 72, 25, 72, fill=accent, outline=accent)
            canvas.create_oval(42, 65, 64, 87, fill=soft, outline=soft)
            canvas.create_oval(88, 65, 110, 87, fill=soft, outline=soft)
            canvas.create_line(55, 38, 82, 38, fill="#ffd4c6", width=3)
        elif visual == "apple":
            points = [77, 26, 92, 34, 100, 51, 95, 72, 79, 83, 61, 81, 50, 65, 52, 44, 64, 30]
            canvas.create_polygon(points, smooth=True, fill=accent, outline=accent)
            canvas.create_oval(74, 17, 90, 31, fill=accent, outline=accent)
        elif visual == "search":
            canvas.create_oval(40, 22, 98, 80, outline=accent, width=8)
            canvas.create_line(90, 70, 120, 92, fill=accent, width=8)
            canvas.create_line(54, 52, 84, 52, fill=soft, width=4)
            canvas.create_line(69, 37, 69, 67, fill=soft, width=4)
        elif visual == "oil":
            canvas.create_rectangle(49, 20, 107, 77, fill=accent, outline=accent)
            canvas.create_rectangle(49, 20, 107, 32, fill="#f9db8d", outline="#f9db8d")
            canvas.create_text(78, 56, text="OIL", fill=bg, font=("Helvetica", 16, "bold"))
        else:
            chart_points = []
            base_x = 16
            for idx in range(8):
                x = base_x + idx * 18
                y = 60 - math.sin(idx / 1.8) * 16 - idx * 1.7
                chart_points.extend([x, y])
            canvas.create_line(chart_points, fill=accent, width=4, smooth=True)
            canvas.create_line(14, 76, 142, 76, fill="#6f8795", width=2)
            canvas.create_line(16, 18, 16, 76, fill="#6f8795", width=2)

        canvas.create_text(10, 12, text=(item.get("topic") or "MARKET"), fill="#ffffff", font=("Helvetica", 10, "bold"), anchor="w")

    def render_article_card(self, parent, item):
        card = self.make_card(parent, pady=16)
        card.pack(fill="x", pady=(0, 14))
        row = tk.Frame(card, bg=Theme.SURFACE)
        row.pack(fill="x", padx=18)

        thumb = tk.Canvas(row, width=156, height=98, bg=Theme.SURFACE, highlightthickness=0, bd=0)
        thumb.pack(side="left", padx=(0, 16))
        self.draw_topic_thumbnail(thumb, item)

        text_wrap = tk.Frame(row, bg=Theme.SURFACE)
        text_wrap.pack(side="left", fill="both", expand=True)
        title = tk.Label(
            text_wrap,
            text=item["title"],
            bg=Theme.SURFACE,
            fg=Theme.TEXT,
            font=self.card_title_font,
            wraplength=860,
            justify="left",
            anchor="w",
        )
        title.pack(anchor="w")

        subtitle = tk.Label(
            text_wrap,
            text=item["subtitle"],
            bg=Theme.SURFACE,
            fg=Theme.MUTED,
            font=self.body_font,
            wraplength=860,
            justify="left",
            anchor="w",
        )
        subtitle.pack(anchor="w", pady=(6, 12))

        footer = tk.Frame(text_wrap, bg=Theme.SURFACE)
        footer.pack(fill="x")
        tk.Label(footer, text=item.get("source", "News"), bg=Theme.SURFACE, fg=Theme.MUTED, font=self.small_font).pack(side="left")
        tk.Label(footer, text="Click anywhere to open", bg=Theme.SURFACE, fg=Theme.MUTED, font=self.small_font).pack(side="right")

        open_story = lambda: self.open_article_link(item["link"])
        self.bind_card_click([card, row, thumb, text_wrap, title, subtitle, footer], open_story)

    def render_post_card(self, parent, item):
        card = self.make_card(parent, pady=16)
        card.pack(fill="x", pady=(0, 14))

        top = tk.Frame(card, bg=Theme.SURFACE)
        top.pack(fill="x", padx=18)

        avatar_color = random.choice(Theme.AVATAR_COLORS)
        avatar = tk.Canvas(top, width=42, height=42, bg=Theme.SURFACE, highlightthickness=0, bd=0)
        avatar.pack(side="left")
        avatar.create_oval(2, 2, 40, 40, fill=avatar_color, outline=avatar_color)
        avatar.create_text(21, 21, text=item["author"][0], fill=Theme.TEXT, font=("Helvetica", 14, "bold"))

        meta = tk.Frame(top, bg=Theme.SURFACE)
        meta.pack(side="left", padx=12)
        author_label = tk.Label(meta, text=item["author"], bg=Theme.SURFACE, fg=Theme.TEXT, font=self.card_title_font)
        author_label.pack(anchor="w")
        handle_label = tk.Label(meta, text=item["handle"], bg=Theme.SURFACE, fg=Theme.MUTED, font=self.small_font)
        handle_label.pack(anchor="w")

        jump_label = tk.Label(top, text="Jump to X ↗", bg=Theme.SURFACE, fg=Theme.MUTED, font=self.small_font)
        jump_label.pack(side="right")

        text_label = tk.Label(
            card,
            text=item["text"],
            bg=Theme.SURFACE,
            fg=Theme.TEXT,
            font=self.body_font,
            wraplength=940,
            justify="left",
        )
        text_label.pack(fill="x", padx=18, pady=(14, 4))

        footer = tk.Frame(card, bg=Theme.SURFACE)
        footer.pack(fill="x", padx=18, pady=(0, 2))
        topic_text = item.get("topic") or "market"
        tk.Label(
            footer,
            text=f"Open {topic_text} post on X",
            bg=Theme.SURFACE,
            fg=Theme.MUTED,
            font=self.small_font,
        ).pack(side="left")

        jump = lambda: webbrowser.open(item.get("x_url", X_POST_LIBRARY["MARKET"]["url"]))
        self.bind_card_click([card, top, avatar, meta, author_label, handle_label, jump_label, text_label, footer], jump)

    def open_detail(self, symbol):
        symbol = normalize_symbol(symbol)
        self.current_detail_symbol = symbol
        self.detail_title.configure(text=f"{symbol} Detail")
        self.detail_subtitle.configure(text=f"Loading {friendly_name(symbol)} market structure...")
        self.chart_title_label.configure(text=f"{symbol}  $—")
        self.chart_summary.configure(text="")
        self.show_detail()

        for widget in self.catalyst_holder.winfo_children():
            widget.destroy()
        placeholder = tk.Label(
            self.catalyst_holder,
            text="Fetching catalysts and chart data...",
            bg=Theme.SURFACE,
            fg=Theme.MUTED,
            font=self.body_font,
        )
        placeholder.pack(anchor="w")

        self.loading_details = True
        thread = threading.Thread(target=self._load_detail_worker, args=(symbol,), daemon=True)
        thread.start()

    def _load_detail_worker(self, symbol):
        chart_points = self.service.fetch_chart(symbol)
        news = self.service.fetch_news(f"{symbol} stock earnings guidance analyst note", limit=5)
        quote = self.quotes.get(symbol) or self.service.fetch_quotes([symbol]).get(symbol) or self.service.offline_quotes([symbol]).get(symbol)
        self.after(0, lambda: self._apply_detail_data(symbol, quote, chart_points, news))

    def _apply_detail_data(self, symbol, quote, chart_points, news):
        if symbol != self.current_detail_symbol:
            return
        self.loading_details = False
        self.quotes[symbol] = quote

        self.detail_title.configure(text=f"{symbol} • {friendly_name(symbol)}")
        self.detail_subtitle.configure(
            text=f"${format_price(quote.get('price'))} • {format_change(quote.get('change'), quote.get('percent'))}"
        )
        self.chart_title_label.configure(text=f"{symbol}  ${format_price(quote.get('price'))}")
        self.chart_summary.configure(text=f"3M trend • {len(chart_points)} points")

        stats = [
            ("Market Cap", format_large_number(quote.get("marketCap"))),
            ("P/E", format_pe(quote.get("pe"))),
            ("52W High", f"${format_price(quote.get('high52'))}"),
            ("Volume", format_large_number(quote.get("volume"))),
        ]
        for (label_widget, value_widget), (label, value) in zip(self.stat_cards, stats):
            label_widget.configure(text=label)
            value_widget.configure(text=value)

        self.draw_chart(chart_points)
        self.render_catalysts(news)

    def draw_chart(self, points):
        canvas = self.chart_canvas
        canvas.delete("all")
        canvas.update_idletasks()
        width = max(canvas.winfo_width(), 960)
        height = max(canvas.winfo_height(), 360)
        canvas.configure(width=width, height=height)

        left_pad = 54
        right_pad = 18
        top_pad = 18
        volume_height = 84
        x_axis_y = height - volume_height - 10
        line_bottom = height - volume_height - 34

        for i in range(5):
            y = top_pad + i * ((line_bottom - top_pad) / 4)
            canvas.create_line(left_pad, y, width - right_pad, y, fill=Theme.GRID, width=1)

        prices = [point["close"] for point in points]
        volumes = [point["volume"] for point in points]
        if not prices:
            canvas.create_text(width / 2, height / 2, text="Chart unavailable", fill=Theme.MUTED, font=("Helvetica", 14))
            return

        min_price = min(prices)
        max_price = max(prices)
        price_span = (max_price - min_price) or 1
        max_volume = max(volumes) or 1
        first_timestamp = points[0]["timestamp"]
        last_timestamp = points[-1]["timestamp"]

        chart_points = []
        for idx, point in enumerate(points):
            x = left_pad + idx * ((width - left_pad - right_pad) / max(len(points) - 1, 1))
            y = line_bottom - ((point["close"] - min_price) / price_span) * (line_bottom - top_pad)
            chart_points.extend([x, y])

            bar_top = height - 12 - (point["volume"] / max_volume) * (volume_height - 14)
            canvas.create_rectangle(x - 2, bar_top, x + 2, height - 12, fill=Theme.VOLUME, outline=Theme.VOLUME)

        canvas.create_line(chart_points, fill=Theme.CHART, width=3, smooth=True)
        canvas.create_text(left_pad, top_pad - 2, text=f"${max_price:.2f}", fill=Theme.MUTED, font=self.small_font, anchor="sw")
        canvas.create_text(left_pad, line_bottom + 4, text=f"${min_price:.2f}", fill=Theme.MUTED, font=self.small_font, anchor="nw")
        canvas.create_text(width - right_pad, height - 6, text="Volume", fill=Theme.MUTED, font=self.small_font, anchor="se")

        label_indexes = sorted(set([0, len(points) // 4, len(points) // 2, (len(points) * 3) // 4, len(points) - 1]))
        for idx in label_indexes:
            point = points[idx]
            x = left_pad + idx * ((width - left_pad - right_pad) / max(len(points) - 1, 1))
            canvas.create_line(x, x_axis_y - 4, x, x_axis_y + 4, fill=Theme.GRID, width=1)
            canvas.create_text(
                x,
                x_axis_y + 14,
                text=format_axis_time(point["timestamp"], first_timestamp, last_timestamp),
                fill=Theme.MUTED,
                font=self.small_font,
                anchor="n",
            )

    def render_catalysts(self, news_items):
        for widget in self.catalyst_holder.winfo_children():
            widget.destroy()

        for item in news_items:
            row = tk.Frame(self.catalyst_holder, bg=Theme.SURFACE_ALT, highlightthickness=1, highlightbackground=Theme.BORDER)
            row.pack(fill="x", pady=7)

            tk.Label(
                row,
                text=item["title"],
                bg=Theme.SURFACE_ALT,
                fg=Theme.TEXT,
                font=self.card_title_font,
                wraplength=900,
                justify="left",
                anchor="w",
            ).pack(fill="x", padx=16, pady=(14, 4))
            tk.Label(
                row,
                text=item.get("subtitle") or item.get("source", ""),
                bg=Theme.SURFACE_ALT,
                fg=Theme.MUTED,
                font=self.body_font,
                wraplength=900,
                justify="left",
                anchor="w",
            ).pack(fill="x", padx=16, pady=(0, 10))

            footer = tk.Frame(row, bg=Theme.SURFACE_ALT)
            footer.pack(fill="x", padx=16, pady=(0, 14))
            tk.Label(footer, text=item.get("source", "News"), bg=Theme.SURFACE_ALT, fg=Theme.MUTED, font=self.small_font).pack(side="left")
            self.make_button(
                footer,
                text="Read",
                bg="#eef2f5",
                activebackground="#e2e8ec",
                padx=14,
                pady=6,
                command=lambda link=item["link"]: webbrowser.open(link),
            ).pack(side="right")

    def generate_social_comment(self, symbol, compact=True):
        symbol = normalize_symbol(symbol)
        quote = self.quotes.get(symbol) or self.quotes.get("NVDA") or {}
        spx = self.quotes.get("SPX") or {}
        oil = self.quotes.get("OIL") or {}
        news_ref = self.market_news[0]["title"] if self.market_news else "macro headlines are back in play"

        hooks = [
            f"{cashtag(symbol)} still looks like a leadership tell, not a laggard bounce.",
            f"If {cashtag(symbol)} holds this tape, dip buyers will stay loud.",
            f"{cashtag(symbol)} is where momentum tourists and real conviction are colliding.",
            f"The cleanest read on risk right now is still {cashtag(symbol)}.",
        ]
        pivots = [
            f"SPX is only {spx.get('percent', 0):+.2f}% but underneath the surface the tape feels more aggressive.",
            f"Crude at {format_price(oil.get('price'))} keeps the inflation chatter alive whether bulls like it or not.",
            f"The market is trading headlines and liquidity at the same time, which is why weak setups keep getting exposed.",
            f"Flows still care more about leadership than valuation, and that matters when everyone is chasing the same names.",
        ]
        closes = [
            f"I’m watching how traders react to {clamp_text(news_ref, 52).lower()} next.",
            "If the breakout fails, I want to know early, not after the timeline invents a narrative.",
            "This is a tape for selective aggression, not blind chasing.",
            "Positioning still matters more than hot takes.",
        ]

        text = f"{random.choice(hooks)} {random.choice(pivots)} {random.choice(closes)}"
        if compact and len(text) > 210:
            text = clamp_text(text, 210)
        return text

    def pick_post_topic(self, previous_topic=None):
        candidates = [symbol for symbol in DEFAULT_TRACKED if symbol not in ("SPX", "OIL")]
        ranked = sorted(
            [self.quotes.get(symbol) for symbol in candidates if self.quotes.get(symbol)],
            key=lambda item: abs(item.get("percent") or 0),
            reverse=True,
        )
        ordered = [item["symbol"] for item in ranked] or candidates[:]
        if previous_topic in ordered and len(ordered) > 1:
            ordered = [symbol for symbol in ordered if symbol != previous_topic]
        return random.choice(ordered or ["NVDA"])

    def generate_post_text(self, topic=None):
        tracked = [self.quotes.get(symbol) for symbol in DEFAULT_TRACKED if self.quotes.get(symbol) and symbol not in ("SPX", "OIL")]
        movers = sorted(tracked, key=lambda item: item.get("percent") or 0, reverse=True)
        topic = normalize_symbol(topic) if topic else self.pick_post_topic(self.current_post_topic)
        focus = self.quotes.get(topic) or random.choice(movers[:3] or tracked or [self.quotes.get("NVDA")])
        opposite_pool = [item for item in tracked if item and item["symbol"] != focus["symbol"]]
        counter = random.choice(opposite_pool[-3:] or opposite_pool or tracked or [self.quotes.get("TSLA")])
        macro = self.quotes.get("SPX", {})
        oil = self.quotes.get("OIL", {})
        headline = clamp_text((self.market_news[0]["title"] if self.market_news else "macro headlines are heating up"), 58)

        openers = [
            f"{cashtag(focus['symbol'])} still has the cleanest momentum profile on my screen.",
            f"Everyone is talking macro, but the real tell is still {cashtag(focus['symbol'])}.",
            f"The market keeps rewarding leadership, and today that looks like {cashtag(focus['symbol'])}.",
            f"The tape is telling a simple story: follow strength, and {cashtag(focus['symbol'])} keeps showing up.",
        ]
        middles = [
            f"SPX sitting at {macro.get('percent', 0):+.2f}% while oil trades {format_price(oil.get('price'))} says this is not a sleepy session.",
            f"{cashtag(counter['symbol'])} fading while leaders keep pressing is exactly the kind of divergence I don’t ignore.",
            f"The backdrop still feels headline-driven with '{headline}' in the mix, but price is cutting through the noise.",
            f"Index action looks fine on paper, yet underneath the tape the winners are separating hard from the tourists.",
        ]
        endings = [
            f"I’d rather stalk continuation in {cashtag(focus['symbol'])} than force hero entries in laggards. DYOR — not financial advice",
            f"If strength holds into the close, traders will keep rotating toward quality leadership. DYOR — not financial advice",
            f"I’m trading the reaction, not marrying the narrative, and that matters in this tape. DYOR — not financial advice",
            f"Chasing every candle is how you donate PnL in a headline market. DYOR — not financial advice",
        ]

        tweet = f"{random.choice(openers)} {random.choice(middles)} {random.choice(endings)}"
        tweet = " ".join(tweet.split())
        if len(tweet) > 278:
            tweet = clamp_text(tweet, 278)
            if not tweet.endswith("DYOR — not financial advice"):
                tweet = clamp_text(tweet.replace("…", ""), 248) + " DYOR — not financial advice"
        self.current_post_topic = focus["symbol"]
        return tweet

    def open_post_modal(self):
        modal = tk.Toplevel(self)
        modal.title("Generate Post")
        modal.geometry("760x560")
        modal.configure(bg=Theme.SURFACE)
        modal.transient(self)
        modal.grab_set()

        card = tk.Frame(modal, bg=Theme.SURFACE, padx=22, pady=20)
        card.pack(fill="both", expand=True)

        tk.Label(card, text="Draft X Post", bg=Theme.SURFACE, fg=Theme.TEXT, font=self.section_font).pack(anchor="w")
        tk.Label(
            card,
            text="Opinionated, human-sounding, and based on the current tape.",
            bg=Theme.SURFACE,
            fg=Theme.MUTED,
            font=self.body_font,
        ).pack(anchor="w", pady=(4, 12))

        text_wrap = tk.Frame(card, bg=Theme.SURFACE)
        text_wrap.pack(fill="both", expand=True)

        scrollbar = tk.Scrollbar(text_wrap)
        scrollbar.pack(side="right", fill="y")
        text_box = tk.Text(
            text_wrap,
            wrap="word",
            font=self.body_font,
            bg=Theme.SURFACE_ALT,
            fg=Theme.TEXT,
            relief="flat",
            highlightthickness=1,
            highlightbackground=Theme.BORDER,
            highlightcolor=Theme.BORDER,
            padx=16,
            pady=16,
            yscrollcommand=scrollbar.set,
            insertbackground=Theme.TEXT,
        )
        text_box.pack(side="left", fill="both", expand=True)
        scrollbar.configure(command=text_box.yview)

        def load_post(force_new_topic=False):
            topic = self.pick_post_topic(self.current_post_topic) if force_new_topic else self.pick_post_topic(None)
            self.current_post_text = self.generate_post_text(topic=topic)
            text_box.delete("1.0", "end")
            text_box.insert("1.0", self.current_post_text)

        load_post(force_new_topic=True)

        button_row = tk.Frame(card, bg=Theme.SURFACE)
        button_row.pack(fill="x", pady=(14, 0))

        self.make_button(
            button_row,
            text="Refresh Post",
            bg="#eef2f5",
            activebackground="#e2e8ec",
            padx=16,
            pady=10,
            command=lambda: load_post(force_new_topic=True),
        ).pack(side="left")

        self.make_button(
            button_row,
            text="Confirm & Post to X",
            bg=Theme.GREEN,
            activebackground=Theme.GREEN_DARK,
            padx=18,
            pady=10,
            command=lambda: self.confirm_post(modal, text_box.get("1.0", "end").strip(), source="Manual"),
        ).pack(side="right")

        self.make_button(
            button_row,
            text="Cancel",
            bg="#f1f3f5",
            activebackground="#e7ecef",
            padx=16,
            pady=10,
            command=modal.destroy,
        ).pack(side="right", padx=(0, 10))

    def confirm_post(self, modal, text, source="Manual"):
        if not text:
            messagebox.showwarning(APP_NAME, "Post text is empty.")
            return
        self.save_post(text, source=source)
        compose_url = "https://twitter.com/intent/tweet?text=" + parse.quote(text)
        webbrowser.open(compose_url)
        modal.destroy()
        self.set_status("Draft opened in X compose.")

    def save_post(self, text, source="Manual"):
        now = datetime.now()
        entry = {
            "text": text,
            "timestamp": f"{now.strftime('%b %d, %Y')} • {human_time(now)}",
            "source": source,
        }
        self.recent_posts.insert(0, entry)
        self.recent_posts = self.recent_posts[:5]
        safe_json_save(POSTS_FILE, self.recent_posts)
        self.render_recent_posts()

    def start_autonomous_mode(self):
        if self.autonomous_active:
            self.set_status("Autonomous mode is already running.")
            return
        self.autonomous_active = True
        self.executed_auto_keys.clear()
        self.build_autonomous_queue()
        self.update_autonomous_status()

    def stop_autonomous_mode(self):
        self.autonomous_active = False
        self.autonomous_queue = []
        self.executed_auto_keys.clear()
        self.set_status("Autonomous mode stopped.")

    def build_autonomous_queue(self):
        now = datetime.now()
        target_day = now.date()
        count = random.randint(2, 3)
        minutes = list(range(9 * 60 + 45, 18 * 60 + 5))
        picks = sorted(random.sample(minutes, count))

        queue = []
        for minute in picks:
            hour = minute // 60
            minute_part = minute % 60
            slot = datetime.combine(target_day, datetime.min.time()).replace(hour=hour, minute=minute_part)
            if slot > now:
                queue.append(slot)

        if not queue:
            next_day = now + timedelta(days=1)
            picks = sorted(random.sample(minutes, random.randint(2, 3)))
            queue = [
                datetime.combine(next_day.date(), datetime.min.time()).replace(hour=minute // 60, minute=minute % 60)
                for minute in picks
            ]

        self.autonomous_queue = queue

    def update_autonomous_status(self):
        if not self.autonomous_active:
            return
        if not self.autonomous_queue:
            self.build_autonomous_queue()
        next_run = self.autonomous_queue[0]
        self.set_status(
            f"Autonomous mode active • {len(self.autonomous_queue)} drafts queued • next {next_run.strftime('%b %d')} at {human_time(next_run)}"
        )

    def schedule_autonomous_tick(self):
        self.after(30000, self._autonomous_tick)

    def _autonomous_tick(self):
        now = datetime.now()
        if self.autonomous_active:
            if not self.autonomous_queue:
                self.build_autonomous_queue()
            ready = [slot for slot in self.autonomous_queue if slot <= now]
            for slot in ready:
                key = slot.isoformat()
                if key in self.executed_auto_keys:
                    continue
                self.executed_auto_keys.add(key)
                self.run_autonomous_post(slot)
            self.autonomous_queue = [slot for slot in self.autonomous_queue if slot > now]
            self.update_autonomous_status()
        self.schedule_autonomous_tick()

    def run_autonomous_post(self, slot):
        text = self.generate_post_text()
        self.save_post(text, source="Autonomous")
        compose_url = "https://twitter.com/intent/tweet?text=" + parse.quote(text)
        webbrowser.open(compose_url)
        self.set_status(f"Autonomous draft opened at {human_time(slot)}.")


if __name__ == "__main__":
    app = StockEchoApp()
    app.render_home()
    app.mainloop()
