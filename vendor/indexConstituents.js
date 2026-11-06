// An index card's level: today's quote when one came back, else the index
// list's own figure and date. Two decimals, as an index is quoted: the list
// sent "7659.444".
window.IndexLevel = {
  // The newest of today's quote, the last daily close and the list's figure.
  // A quote alone was not enough: the S&P 600 has no real-time quote, and its
  // card kept the list's "1,653.50 Updated: 2026-10-16" while the close of
  // the 21st was 1,675.64. On a tie the quote wins, then
  // the close.
  pick(idx, live, eod) {
    const v = idx && idx.Value != null && idx.Value !== '' ? Number(idx.Value) : null;
    const list = { value: Number.isFinite(v) ? v : null, date: (idx && idx.LastUpdate) || null };
    let best = null;
    for (const c of [live, eod, list]) {
      if (!c || c.value == null) continue;
      if (!best || (c.date && (!best.date || c.date > best.date))) best = c;
    }
    return best ? { value: best.value, date: best.date || null } : list;
  },
  // The last daily close in an /eod answer, or null.
  lastClose(rows) {
    if (!Array.isArray(rows)) return null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      const v = r && Number(r.close);
      if (Number.isFinite(v) && v > 0 && r.date) return { value: v, date: String(r.date).slice(0, 10) };
    }
    return null;
  },
  // Codes whose /eod answered no close this session (the ILS indices answer
  // []): not asked again on every tab switch or search.
  noEod: new Set(),
  // A level is stale once more than this many weekday sessions have passed
  // since its date, today not counted. Calendar days counted the weekend:
  // on Monday morning before the US open Friday's quote and list were "2.6
  // days old" and All sent 25 requests for the same Friday closes. One missed session is allowed for a holiday, which has no
  // calendar here.
  STALE_SESSIONS: 1,
  isStale(level, nowMs) {
    if (!level || !level.date) return true;
    const t = Date.parse(String(level.date).slice(0, 10) + 'T00:00:00Z');
    if (!Number.isFinite(t)) return true;
    const today = Date.parse(new Date(nowMs).toISOString().slice(0, 10) + 'T00:00:00Z');
    let missed = 0;
    for (let d = t + 86400000; d < today && missed <= this.STALE_SESSIONS; d += 86400000) {
      const wd = new Date(d).getUTCDay();
      if (wd !== 0 && wd !== 6) missed++;
    }
    return missed > this.STALE_SESSIONS;
  },
  format(v) {
    return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  dateOf(ts) {
    const d = new Date(ts * 1000);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  },
};

// Index Constituents — S&P Global data via EODHD Marketplace
// AI Features: Sector Analysis, Smart Screener, Invest Like Index, Historical AI, Comparison

// Sector weights and membership changes, as the view and its AI prompts use
// them.
window.IndexSectors = {
  // The n largest sectors and, when more exist, the rest as one "Other":
  // the chips showed the top eight and stopped, so the Dow's summed to 97.5%
  // with Energy (CVX, 2.4%) gone, and the S&P 100 lost three sectors.
  // An "Other" the feed itself sends is merged into that remainder.
  top(sectors, n) {
    const entries = Object.entries(sectors || {}).filter(([, w]) => Number(w) > 0);
    const named = entries.filter(([s]) => s !== 'Other').sort((a, b) => b[1] - a[1]);
    const own = entries.filter(([s]) => s === 'Other').reduce((t, [, w]) => t + w, 0);
    const head = named.slice(0, own > 0 || named.length > n ? n - 1 : n);
    const rest = named.slice(head.length).reduce((t, [, w]) => t + w, 0) + own;
    return rest > 0 ? head.concat([['Other', rest]]) : head;
  },
  // Joins and departures since `since`, newest first. An exclusion is dated
  // by when it left, not when it joined: filtering everything on StartDate
  // dropped 52 of the S&P 500's 58 exclusions since 2024 from the "Why These
  // Changes?" prompt, because those companies had joined earlier.
  recentChanges(historical, since, limit) {
    const out = [];
    (historical || []).forEach((h) => {
      if (!h || !h.Code) return;
      if (h.EndDate && h.EndDate > since) out.push({ kind: 'REMOVED', code: h.Code, name: h.Name || h.Code, date: h.EndDate });
      if (h.StartDate && h.StartDate > since) out.push({ kind: 'ADDED', code: h.Code, name: h.Name || h.Code, date: h.StartDate });
    });
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return out.slice(0, limit || 20);
  },
};

// Region membership by whole words in the index name or code.
//
// The first version used two-letter regexes with no anchors: IN matched
// "Industrial" and "Index", DE matched "In-de-x", CA matched "CAC", so the Dow
// sat in APAC, the CAC 40 in Americas and the Bovespa everywhere except
// Americas. A word has to stand on its own here, and the two-
// letter country codes are gone in favour of the names people write.
const REGION_WORDS = {
  americas: ['US', 'USA', 'U.S.', 'United States', 'America', 'American', 'Americas', 'NYSE', 'NASDAQ',
    'S&P 500', 'S&P 100', 'S&P 400', 'S&P 600', 'S&P 900', 'S&P 1000', 'S&P 1500', 'S&P MidCap', 'S&P SmallCap', 'S&P Composite',
    'Select Industry', 'Select Sector', 'Russell', 'Dow Jones', 'Wilshire', 'TSX', 'Toronto', 'Canada', 'Canadian',
    'Brazil', 'Bovespa', 'IBOVESPA', 'Mexico', 'Mexican', 'IPC', 'Latin America', 'Chile', 'IPSA', 'Argentina', 'MERVAL'],
  emea: ['Europe', 'European', 'Euro', 'Eurozone', 'STOXX', 'FTSE', 'DAX', 'MDAX', 'TecDAX', 'CAC', 'SBF', 'AEX', 'AMX',
    'IBEX', 'MIB', 'SMI', 'Swiss', 'Switzerland', 'UK', 'United Kingdom', 'Britain', 'British', 'London',
    'Germany', 'German', 'France', 'French', 'Spain', 'Spanish', 'Italy', 'Italian', 'Netherlands', 'Dutch',
    'Belgium', 'BEL 20', 'Portugal', 'PSI', 'Austria', 'ATX', 'Nordic', 'OMX', 'Sweden', 'Stockholm',
    'Norway', 'Oslo', 'Denmark', 'Copenhagen', 'Finland', 'Helsinki', 'Ireland', 'ISEQ', 'Greece', 'Athens',
    'Poland', 'WIG', 'WIG20', 'WIG30', 'Warsaw', 'Czech', 'Prague', 'Hungary', 'BUX', 'Turkey', 'BIST', 'Istanbul', 'Russia', 'MOEX',
    'Africa', 'South Africa', 'JSE', 'Egypt', 'EGX', 'Israel', 'Tel Aviv', 'TA-35', 'TA-125',
    'Middle East', 'Gulf', 'GCC', 'Saudi', 'Tadawul', 'TASI', 'Dubai', 'DFM', 'Abu Dhabi', 'ADX', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'EMEA'],
  apac: ['Asia', 'Asian', 'Pacific', 'APAC', 'Japan', 'Japanese', 'Nikkei', 'TOPIX', 'Tokyo', 'China', 'Chinese',
    'Shanghai', 'Shenzhen', 'CSI', 'SSE', 'ChiNext', 'Hong Kong', 'Hang Seng', 'HSI', 'Korea', 'Korean', 'KOSPI', 'KOSDAQ',
    'Australia', 'Australian', 'ASX', 'India', 'Indian', 'Nifty', 'SENSEX', 'BSE', 'NSE', 'Singapore', 'Straits Times', 'STI',
    'Taiwan', 'TWSE', 'TAIEX', 'Indonesia', 'Jakarta', 'IDX', 'Malaysia', 'KLCI', 'Bursa', 'Thailand', 'Thai',
    'Philippines', 'PSEi', 'SET', 'JPX', 'Vietnam', 'Ho Chi Minh', 'New Zealand', 'NZX', 'Pakistan', 'KSE', 'Sri Lanka', 'Colombo', 'Bangladesh'],
};
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Words that name an index family rather than a market. They place an index
// only when nothing else does: 'S&P' is in every one of these names, and
// 'Dow Jones Sustainability Europe' is a European index by a US sponsor.
const SPONSOR_WORDS = ['S&P 500', 'S&P 100', 'S&P 400', 'S&P 600', 'S&P 900', 'S&P 1000', 'S&P 1500',
  'S&P MidCap', 'S&P SmallCap', 'S&P Composite', 'Select Industry', 'Select Sector',
  'Dow Jones', 'Russell', 'Wilshire', 'NYSE', 'NASDAQ', 'FTSE', 'STOXX', 'MSCI', 'Euro'];
const REGION_PATTERNS = Object.fromEntries(Object.entries(REGION_WORDS).map(([region, words]) => [
  region,
  words.map(w => new RegExp('(^|[^A-Za-z0-9&])' + escapeRegex(w) + '(?![A-Za-z0-9])', 'i')),
]));
/**
 * The regions an index actually covers, strongest evidence first.
 *
 * Matching the sponsor's name put "Dow Jones Sustainability Europe" in both
 * Americas and EMEA, and "S&P Global Ex-US BMI" in Americas because of the
 * market it excludes. So: a word that names a market beats a word that only
 * names an index family; a region after "Ex-" is removed rather than matched;
 * and an index that names no market at all is Global, not nowhere.
 */
const regionsOf = (idx) => {
  const name = (idx.Name || '') + ' ' + (idx.Code || '');
  const hay = ' ' + name + ' ';

  const excluded = (name.match(/\b(?:ex|excl|excluding)[-.\s]*([A-Za-z.&\s]{2,20})/gi) || [])
    .map(m => ' ' + m.replace(/^\s*\b(?:ex|excl|excluding)[-.\s]*/i, '') + ' ');

  const hit = (words) => words.some(w => {
    const re = new RegExp('(^|[^A-Za-z0-9&])' + escapeRegex(w) + '(?![A-Za-z0-9])', 'i');
    if (!re.test(hay)) return false;
    return !excluded.some(ex => re.test(ex));
  });

  const marketWords = (region) => REGION_WORDS[region].filter(w => SPONSOR_WORDS.indexOf(w) === -1);
  const byMarket = ['americas', 'emea', 'apac'].filter(r => hit(marketWords(r)));
  if (byMarket.length) return byMarket;
  // Nothing but the sponsor: an S&P 500 is American, an S&P Global is not.
  const bySponsor = ['americas', 'emea', 'apac'].filter(r => hit(REGION_WORDS[r]));
  if (bySponsor.length) return bySponsor;
  return ['global'];
};
const inRegion = (idx, region) => regionsOf(idx).indexOf(region) !== -1;
// Exposed for the test that pins the report's index tables to their regions.
window.IndexRegions = { REGION_WORDS, inRegion, regionsOf };

// The list endpoint answers a plain array today. A JSON:API envelope --
// {data:[{id, attributes}]} -- is what the neighbouring marketplace endpoint
// for options sends, and it rendered here as zero indices with no message
// Both shapes are accepted; anything else is an error, said.
const normaliseIndexList = (data) => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) {
    return data.data.map(row => (row && row.attributes)
      ? Object.assign({}, row.attributes, row.id ? { ID: row.id } : {})
      : row);
  }
  return null;
};

// An index code from a link or a card, or '' when it names nothing: upper
// case, never ".." or a trailing dot/dash,
// and ".INDX" added when it is missing. "#/constituents?index=gspc" (or Dji,
// or GSPC) was asked as comp/GSPC, EODHD answered 403 and the page said it
// "did not load", while the card itself opens GSPC.INDX.
// A caret is the index mark people type ("^GSPC"): one is dropped, more
// name nothing. Read by the one reader of codes
// (window.SymbolCode.index). A listing's exchange ("GSPC.US") is no index
// code: '' here; the page tells it apart.
window.IndexCodeFromLink = (raw) => window.SymbolCode.index(raw).code || '';

// The region tabs, as the link writes them.
window.IndexRegionTabs = ['popular', 'all', 'americas', 'emea', 'apac', 'global'];

// The index search: lower case, trimmed, inner runs of spaces as one; an
// index matches by name or code.
window.IndexSearchQuery = (raw) => String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ').toLowerCase();
window.IndexSearchMatch = (idx, query) => {
  if (!query) return true;
  const name = String((idx && idx.Name) || '').toLowerCase().replace(/\s+/g, ' ');
  const code = String((idx && idx.Code) || '').toLowerCase();
  return name.includes(query) || code.includes(query);
};

window.IndexConstituentsView = ({ apiKey, theme }) => {
  // The prices of this screen's AI actions, from the server's list.
  const useFeatureCost = (() => null);
  const indexAiCost = useFeatureCost('index_ai');
  const [indices, setIndices] = React.useState(null);
  const [indicesError, setIndicesError] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [selectedIndex, setSelectedIndex] = React.useState(null);
  const [components, setComponents] = React.useState(null);
  const [compLoading, setCompLoading] = React.useState(false);
  // After "Try again" the button leaves while the view loads, and focus fell
  // to <body>. When loading ends it goes back to a Try again that is there
  // again (still refused), else to the view's heading.
  const retryFocusRef = React.useRef(false);
  const retryHeadingRef = React.useRef(null);
  React.useEffect(() => {
    if ((loading || compLoading) || !retryFocusRef.current) return;
    retryFocusRef.current = false;
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body && document.contains(a)) return;
      const back = document.querySelector('[data-retry-focus]');
      // An opened index has its own heading; the landing <h1> is not on
      // screen then, and focus fell to <body> after a successful retry there.
      const title = rootRef.current && rootRef.current.querySelector('[data-ic-focus="title"]');
      const target = back || title || retryHeadingRef.current;
      if (target) target.focus();
    }, 0);
  }, [(loading || compLoading)]);
  // Sortable columns: one sort per table, announced with aria-sort.
  const [compSort, setCompSort] = React.useState({ key: 'Weight', dir: 'desc' });
  const [histSort, setHistSort] = React.useState({ key: 'Added', dir: 'desc' });
  // "Invest Like This Index" asked with confirm() and answered with alert();
  // both are in the page now, the answer under the button.
  const [askInPage, askElement] = (window.PTDialog && window.PTDialog.useAsk) ? window.PTDialog.useAsk() : [async () => true, null];
  const [investNote, setInvestNote] = React.useState(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  // The search box killed its outline and put nothing in its place, so it was
  // the one control on the screen a keyboard user could reach and not see.
  const [searchFocused, setSearchFocused] = React.useState(false);
  // AI & feature states
  const [sectorAnalysis, setSectorAnalysis] = React.useState(null);
  const [sectorLoading, setSectorLoading] = React.useState(false);
  const [screenerFilter, setScreenerFilter] = React.useState({ sector: '', minWeight: 0, minWeightText: '0' });
  const [historicalAI, setHistoricalAI] = React.useState(null);
  const [historicalAILoading, setHistoricalAILoading] = React.useState(false);
  const [compareMode, setCompareMode] = React.useState(false);
  const [compareIdx, setCompareIdx] = React.useState(null);
  const [compareData, setCompareData] = React.useState(null);
  const [compareAI, setCompareAI] = React.useState(null);
  const [compareLoading, setCompareLoading] = React.useState(false);
  const [category, setCategory] = React.useState('popular');

  const isDark = theme === 'dark';
  const Icon = window.Icon || (() => null);
  // The two AI buttons of an open index: neutral, bordered. The orange fill
  // is for the page's one primary action (Clone as Portfolio).
  const aiButtonStyle = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 4, border: '1px solid ' + (isDark ? C3.lineDark : C3.lineLight), background: 'transparent', color: isDark ? C3.textDark : C3.textLightTheme, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Sora',sans-serif" };

  // The open index and the region tab belong in the URL: a reload used to drop
  // both, and there was no way to send anyone a particular index.
  const bootedFromUrl = React.useRef(false);
  // A link naming a listing, not an index ("?index=GSPC.US"): asked as
  // comp/GSPC.US, refused with a 403 and read "EODHD did not answer". It opens GSPC.INDX once the list shows that index, else the
  // list says what is wrong with the code.
  const [foreignLink, setForeignLink] = React.useState(null);
  const [linkNote, setLinkNote] = React.useState(null);
  // Text in ?index= that names no index ("..", "A--B") is said, not dropped
  // in silence.
  const junkNote = (raw) => '"' + String(raw || '').trim().slice(0, 30) + '" is not an index code. Pick an index from the list.';
  // ?region= in any case: EMEA, Americas and ALL were read as nothing, the
  // page opened on Popular and the parameter was erased. { region } for a tab, { junk } for a value that names none.
  const regionOf = (raw) => {
    const v = String(raw == null ? '' : raw).trim().toLowerCase();
    if (!v) return {};
    return window.IndexRegionTabs.indexOf(v) !== -1 ? { region: v } : { junk: '"' + String(raw).trim().slice(0, 20) + '" is not a region. The tabs are Popular, All, Americas, EMEA, APAC and Global.' };
  };
  React.useEffect(() => {
    if (bootedFromUrl.current) return;
    bootedFromUrl.current = true;
    const st = window.ViewState ? window.ViewState.read('constituents') : {};
    const read = window.SymbolCode.index(st.index);
    if (read.foreign) setForeignLink(read);
    if (read.junk) setLinkNote(junkNote(st.index));
    const reg = regionOf(st.region);
    if (reg.region) setCategory(reg.region);
    if (reg.junk && !read.junk) setLinkNote(reg.junk);
    // A code has to name something: ".." passed and the browser folded it
    // into a paid request for the whole index list.
    // Codes are upper case: "gspc" or "Dji" in a link were asked as typed,
    // EODHD answered 403 and the page said the plan did not include it.
    const code = window.IndexCodeFromLink(st.index);
    if (code) {
      setSelectedIndex(code);
      loadComponents(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A link followed while the page is open: ?index=GSPC.INDX → DJI.INDX (or
  // back to #/constituents) changed the address and left the S&P 500 on
  // screen. ViewState writes with replaceState, which
  // fires no hashchange, so only a followed or typed link lands here.
  const hashNavRef = React.useRef(null);
  // A followed link and Back/Forward move the focus as a press here does: to
  // the way out while it loads, then the heading; to the card on the way
  // back. The control that was pressed went with the page and the focus
  // fell to <body>.
  hashNavRef.current = {
    selectedIndex,
    open: (id) => { movedByUserRef.current = id; setSelectedIndex(id); loadComponents(id); },
    leave: () => { movedByUserRef.current = selectedIndex; compSeqRef.current++; setCompLoading(false); setSelectedIndex(null); setComponents(null); },
    foreign: (read) => { if (selectedIndex) { movedByUserRef.current = selectedIndex; compSeqRef.current++; setCompLoading(false); setSelectedIndex(null); setComponents(null); } setForeignLink(read); },
  };
  React.useEffect(() => {
    const onHash = () => {
      if (!window.ViewState) return;
      // This page's address: #/constituents, or the open app's root, with no
      // tab ('', '#?index=DJI.INDX'), where Back from an index lands.
      const tab = window.ViewState.splitHash(window.location.hash || '').tab;
      if (tab !== 'constituents' && tab !== '') return;
      const st = window.ViewState.read('constituents') || {};
      const nav = hashNavRef.current;
      // The same reading as on arrival, upper case included: a followed
      // link to "dji.indx" asked EODHD in lower case and read as a plan
      // refusal (on the 23.10 integration).
      const read = window.SymbolCode.index(st.index);
      const want = read.code || null;
      // The region tab a followed link names: it was read only on arrival.
      const reg = regionOf(st.region);
      setCategory(reg.region || 'popular');
      setLinkNote(read.junk ? junkNote(st.index) : (reg.junk || null));
      // Every navigation ends a listing code still waiting for the list: it
      // opened GSPC.INDX over a later DJI.INDX link.
      setForeignLink(null);
      if (!want && read.foreign) { nav.foreign({ ...read, moved: true }); return; }
      if ((want || null) === (nav.selectedIndex || null)) return;
      if (want) nav.open(want); else nav.leave();
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  React.useEffect(() => {
    if (!bootedFromUrl.current || !window.ViewState) return;
    // 'popular' is the default, so it says nothing and stays out of the link.
    window.ViewState.merge({
      index: selectedIndex || '',
      region: category === 'popular' ? '' : category,
    });
  }, [selectedIndex, category]);

  React.useEffect(() => {
    if (!foreignLink || indices === null) return;
    const hit = (indices || []).find(idx => String(idx.Code || idx.ID || '').replace(/\.INDX$/i, '').toUpperCase() === foreignLink.base);
    setForeignLink(null);
    if (hit) {
      const id = window.IndexCodeFromLink(hit.ID || hit.Code) || foreignLink.base + '.INDX';
      // Followed inside the page: the focus moves as on any followed link.
      if (foreignLink.moved) movedByUserRef.current = id;
      setSelectedIndex(id);
      loadComponents(id);
      return;
    }
    setLinkNote('"' + foreignLink.foreign + '" is not an index code: the part after the dot names an exchange. Index codes end in .INDX (e.g. GSPC.INDX) — pick an index from the list.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foreignLink, indices]);

  // Format AI response — convert **bold** to real bold
  const formatAI = (text) => {
    if (!text) return null;
    if (window.AIText) return window.AIText.markdown(text);
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return React.createElement('span', null, ...parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return React.createElement('strong', { key: i, style: { color: isDark ? '#E0E3EB' : '#1e1b4b' } }, part.slice(2, -2));
      }
      return part;
    }));
  };

  // AI helper -- the model on the developer's own key (shell/ai.js).
  // A failure comes back as { error }, drawn as an error state: it used to be
  // returned as the answer's text and printed in the answer card under
  // "AI Sector Analysis" and over "Powered by AI".
  const callAI = async (prompt, tokenFeature = 'index_ai') => {
    const answer = await askModel(prompt, tokenFeature);
    return answer;
  };
  const askModel = async (prompt, tokenFeature) => {
    const aiService = window.AIService;
    if (!aiService?.getSettings()?.enabled) return { error: 'AI analysis is off. Add OPENAI_API_KEY to .env and restart to enable it.' };
    const settings = aiService.getSettings();
    try {
      // One charge, the server's: chatWithTokens names the feature. It was a
      // client consume plus a chat charged again.
      const resp = await aiService.chatWithTokens(tokenFeature, [{ role: 'user', content: prompt }]);
      const text = typeof resp === 'string' ? resp : (resp?.content || resp?.message || '');
      return text ? text : { error: 'The model returned nothing.' };
    } catch (e) {
      return { error: window.AIText ? window.AIText.error(e) : String((e && e.message) || e) };
    }
  };
  const aiEnabled = Boolean(window.AIService?.getSettings?.()?.enabled);
  // Data goes through EODHD_API like every other module: it picks the user's key
  // when there is one and our backend proxy (server key, same-origin) otherwise.
  // This file used to sign its own URLs with window.DEMO_API_KEY — now always
  // null by the keyless-bundle rule — and fall back to a cross-origin
  // https://eodhd.com/api off a hostname check.

  // Load index list on mount, and again on "Try again" (listTry).
  const [listTry, setListTry] = React.useState(0);
  // The host's own panel is already explaining a refusal (the open apps'
  // frame; the terminal has no such panel and no `explained`, so this is false
  // there). The view's own lines are silenced in that case and it stood empty
  // under the filters: it now says so in the
  // heatmap's words, with the same "Try again".
  const explainedAbove = () => Boolean(window.Entitlement && window.Entitlement.explained && window.Entitlement.explained());
  // After a 429, "Try again" inside the wait sent the request at once, into
  // the same limit the panel asked to wait out. The
  // client knows when the wait ends (EODHD_API.rateLimitedUntil, in the
  // terminal and the open apps' shell): until then a press sends nothing
  // and says how long is left.
  // The wait, its note and its countdown are the shared ones.
  // The page kept a copy of its own for a host
  // without them, and that note never counted down: "Try again in 54 s"
  // was still there after 61 s.
  const RLW = window.RateLimitWait;
  const rlWait = RLW.useWait();
  const waitNote = rlWait.note;
  // The limit is named only when it is why the list failed.
  const listLimited = RLW.useCause(components && components.error ? components : null);
  const retryUnlessLimited = (fn) => {
    if (rlWait.hold()) return;
    // A retry is a new request: one still hanging is not joined (the open
    // apps' shell joins a request already on its way; EODHD_API.fresh).
    const A = window.EODHD_API;
    if (A && typeof A.fresh === 'function') A.fresh();
    fn();
  };
  // Not a live region: the note counts every second; the press was said once
  // when it was held, by RateLimitWait. In notServed the words
  // are the live region and the counting button stays outside it.
  const waitLine = () => waitNote && React.createElement('p', { 'data-ic-wait': 'true', style: { margin: '12px 0 0', fontSize: 13, color: isDark ? '#E0E3EB' : '#1e1b4b' } }, waitNote);
  const notServed = (retry) => React.createElement('div', { style: { textAlign: 'center', padding: '32px 20px' } },
    React.createElement('p', { role: 'status', style: { color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', margin: '0 0 16px', fontSize: 14 } },
      'Nothing below is missing data — the request was not served. See the panel above.'),
    React.createElement(RLW.RetryButton, {
      wait: rlWait, isDark, 'data-retry-focus': 'true', onClick: () => retryUnlessLimited(() => { retryFocusRef.current = true; retry(); }),
      style: { padding: '12px 24px', background: C3.logoGradient, border: 'none', borderRadius: 12, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Sora',sans-serif" },
    }),
    waitLine());
  // The list that did not come back, and why (RLW.failure): at 429 it read
  // "Could not read the index list from EODHD. Reload to try again.", with
  // nothing about the limit and no button. Null when
  // the list came back, or came back in a shape this page does not read.
  const [listFail, setListFail] = React.useState(null);
  const retryList = () => { setLoading(true); setListTry(n => n + 1); };
  React.useEffect(() => {
    let cancelled = false;
    // throwErrors: a failure throws with its status, so a 500 is named as
    // one, as Macro's is; failure(null) read it as no answer.
    window.EODHD_API.getIndexList(apiKey, { throwErrors: true })
      .then(data => {
        if (cancelled) return;
        const list = normaliseIndexList(data);
        // Null is a request that did not come back; anything else that is
        // not a list is an answer this page cannot read.
        setListFail(data == null ? RLW.failure(null) : null);
        setIndicesError(list === null);
        setIndices(list || []);
        setLoading(false);
      })
      .catch(e => {
        // Said on the page with its reason; the client has logged it.
        console.warn('[IndexConstituents] The index list did not load:', e && e.message);
        if (!cancelled) { setListFail(RLW.failure(e)); setIndicesError(true); setIndices([]); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [listTry]);
  // Stopped by the limit: asked again once the wait is over, as the other
  // panels do; the button counts the wait down until then. With the focus
  // on Try again that reload is a keyboard Try again: the focus comes back
  // to Try again or to the heading, not to <body>; focus elsewhere is left.
  RLW.useReloadAfterWait(listFail, () => {
    if (RLW.focusOnRetry()) retryFocusRef.current = true;
    retryList();
  }, 'index-list');

  // Load components for selected index. The newest pick owns the screen, and
  // Back while loading abandons the load (the loader had no
  // way out for up to 25 s).
  const compSeqRef = React.useRef(0);
  const leaveIndex = () => {
    // An index opened from its card has its own history entry (openIndex):
    // the way out is that entry's Back, so the browser's Back after it does
    // not land on the same list a second time. The hashchange it fires is
    // read above and moves the focus to the card.
    const st = window.history && window.history.state;
    if (st && st.icIndex && st.icIndex === selectedIndex) {
      try { window.history.back(); return; } catch (e) { /* fall through */ }
    }
    movedByUserRef.current = selectedIndex; compSeqRef.current++; setCompLoading(false); setSelectedIndex(null); setComponents(null);
  };
  // Opening an index replaces the list with the index, and Back replaces the
  // index with the list: the control just pressed is gone either way, and
  // focus fell to <body>. It goes to what replaced
  // it: the way out while the index loads, the index's heading once it is
  // open, and on the way back the card the reader came in through. Only after
  // a press made here -- an index opened from a link moves no focus.
  const rootRef = React.useRef(null);
  const movedByUserRef = React.useRef(null);
  const screenNow = !selectedIndex ? 'list' : (components ? 'open' : 'loading');
  React.useEffect(() => {
    const from = movedByUserRef.current;
    const root = rootRef.current;
    if (!from || !root) return;
    let target = null;
    if (screenNow === 'loading') target = root.querySelector('[data-ic-focus="leave"]');
    else if (screenNow === 'open') { target = root.querySelector('[data-ic-focus="title"]'); movedByUserRef.current = null; }
    else {
      movedByUserRef.current = null;
      const cards = root.querySelectorAll('[data-ic-card]');
      for (let i = 0; i < cards.length; i++) if (cards[i].getAttribute('data-ic-card') === String(from)) target = cards[i];
      if (!target) target = root.querySelector('input');
    }
    if (target) target.focus();
  }, [screenNow]);
  // A card's code through the same reader as a link's: one without ID sent
  // its bare Code, the request the link fix is about.
  // A card opens its index as a new history entry: with replaceState the
  // browser's Back left the app instead of returning to the list. The entry is marked, so the page's own "Back to the
  // list" can take it back rather than stack another list on top.
  const pushIndexEntry = (id) => {
    try {
      const VS = window.ViewState;
      if (!VS || !window.history || typeof window.history.pushState !== 'function') return;
      const parts = VS.splitHash(window.location.hash || '');
      // The open app at its root has no tab in the address ('' or '#?region=');
      // its cards pushed nothing and Back left the app.
      if (parts.tab !== 'constituents' && parts.tab !== '') return;
      const q = VS.parseQuery(parts.query);
      q.index = id;
      window.history.pushState({ icIndex: id }, '', VS.buildHash(parts.tab, q));
    } catch (e) { /* a link is a convenience */ }
  };
  const openIndex = (raw) => { const id = window.IndexCodeFromLink(raw) || raw; setLinkNote(null); setForeignLink(null); pushIndexEntry(id); movedByUserRef.current = id; setSelectedIndex(id); loadComponents(id); };
  // The same index asked for twice (left and opened again, or Try again): an
  // older request's late answer still counts while that index is on screen,
  // and a failed newer one never takes it away. Only an
  // answer for another index than the one on screen is dropped.
  const selectedIndexRef = React.useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const apiKeyRef = React.useRef(apiKey);
  apiKeyRef.current = apiKey;
  const compServedRef = React.useRef({ symbol: null, seq: 0, at: 0 });
  const loadComponents = async (symbol) => {
    const seq = ++compSeqRef.current;
    const startedAt = Date.now();
    const latest = () => seq === compSeqRef.current;
    const askedWith = apiKey;
    const stillWanted = () => latest() || (selectedIndexRef.current === symbol && apiKeyRef.current === askedWith && !(compServedRef.current.symbol === symbol && compServedRef.current.seq > seq));
    setCompLoading(true);
    setComponents(null);
    try {
      const data = await window.EODHD_API.getIndexComponents(apiKey, symbol);
      if (!stillWanted()) return;
      // Weight arrives as a fraction — the 503 S&P components sum to 1.0, and
      // NVDA comes back as 0.0794. Everything downstream treats it as a
      // percentage: the table appends '%', the sector chips append '%', the
      // min-weight box steps by 0.1 and the table highlights anything over 2.
      // Left alone, NVDA rendered as "0.08%" and Technology as "0.4%", and the
      // highlight threshold could never be reached by anything.
      if (data && data.Components) {
        for (const key of Object.keys(data.Components)) {
          const c = data.Components[key];
          const w = parseFloat(c && c.Weight);
          if (Number.isFinite(w)) c.Weight = w * 100;
        }
      }
      // Anything without a list or a header is a failure: an offline or
      // timed-out request left the view with Back and the code and nothing
      // else.
      const usable = data && typeof data === 'object' && (data.Components || data.General);
      // A failed answer does not go over what an older request brought.
      const served = compServedRef.current;
      if (!usable && served.symbol === symbol && served.at >= startedAt) { setCompLoading(false); return; }
      if (usable) compServedRef.current = { symbol, seq, at: Date.now() };
      // An answer of another shape ({"message": ...} with 200, a page the
      // client could not parse) could not be read: said as that, not as "did
      // not answer".
      const unread = Boolean(data && typeof data === 'object' && !usable && (data.unreadable || !data.error));
      setComponents(usable ? data : { error: true, unreadable: unread });
    } catch (e) {
      if (!latest()) return;
      console.error('Failed to load components:', e);
      const served = compServedRef.current;
      if (served.symbol === symbol && served.at >= startedAt) { setCompLoading(false); return; }
      setComponents({ error: true });
    }
    setCompLoading(false);
  };

  // The search as typed, spaces at the ends dropped and runs of spaces read as
  // one: " GSPC", "GSPC " and "S&P 500 " found nothing.
  const query = window.IndexSearchQuery(searchQuery);
  const filteredIndices = (indices || []).filter(idx => window.IndexSearchMatch(idx, query));

  // Headline indices by exact code. "Popular" matched any name containing
  // "dow jones", so it listed 28 currency/return variants of the Dow next to
  // the S&P 500.
  const popularCodes = ['GSPC','DJI','NDX','RUT','OEX','MID','SML','SP1500','DJT','DJU','GDAXI','FTSE','N225','HSI','GSPTSE','STOXX50E','AXJO','BVSP','KS11','NSEI','SSEC'];
  const codeOf = (idx) => String(idx.Code || idx.ID || '').replace(/\.INDX$/i, '').toUpperCase();
  // Region tabs with members in this feed. The S&P Global list EODHD serves
  // is all US families today, so EMEA and APAC were always empty with "No
  // indices in this region match your search" and no search entered, and
  // "Global" listed everything.
  const regionCounts = React.useMemo(() => {
    const counts = { americas: 0, emea: 0, apac: 0, global: 0 };
    (indices || []).forEach(idx => regionsOf(idx).forEach(r => { if (counts[r] !== undefined) counts[r] += 1; }));
    return counts;
  }, [indices]);
  const categorized = React.useMemo(() => {
    if (!indices || indices.length === 0) return [];
    let list = indices;
    if (query) {
      list = list.filter(idx => window.IndexSearchMatch(idx, query));
    } else if (category === 'popular') {
      list = list.filter(idx => popularCodes.indexOf(codeOf(idx)) !== -1)
        .sort((a, b) => popularCodes.indexOf(codeOf(a)) - popularCodes.indexOf(codeOf(b)));
      if (list.length < 6) list = indices.slice(0, 12);
    } else if (REGION_WORDS[category] || category === 'global') {
      list = list.filter(idx => inRegion(idx, category));
    }
    return list;
  }, [indices, query, category]);

  // The level on a card: the index list's figure is days old (S&P 500
  // "7,659.444 USD Updated: 2026-10-16" on the 20th, 7,691 on the Dashboard,
  //). The shown cards take today's quote, one request;
  // the list's figure stays where no quote comes back.
  const [liveLevels, setLiveLevels] = React.useState({});
  const [eodLevels, setEodLevels] = React.useState({});
  React.useEffect(() => {
    const codes = categorized.slice(0, 30).map((idx) => codeOf(idx) + '.INDX').filter((c) => c !== '.INDX' && !(c in liveLevels));
    if (!codes.length || !window.EODHD_API || !window.EODHD_API.getBatchRealTime) return;
    let gone = false;
    Promise.resolve(window.EODHD_API.getBatchRealTime(apiKey, codes)).then((res) => {
      if (gone) return;
      const add = {};
      codes.forEach((c) => {
        const q = res && (res[c] || res[c.toUpperCase()]);
        const v = q && Number(q.close);
        const ts = q && Number(q.timestamp);
        add[c] = Number.isFinite(v) && v > 0 && Number.isFinite(ts) && ts > 0
          ? { value: v, date: window.IndexLevel.dateOf(ts) } : null;
      });
      setLiveLevels((prev) => ({ ...prev, ...add }));
      // No quote, or an old one: the last daily close, one request per such
      // card (the S&P 600 has EOD but no real-time).
      const getEod = window.EODHD_API.getHistoricalData;
      // Only where nothing fresh stands: All asked for 23 closes, the ILS ones
      // answered [] and the card took the list's figure anyway; a list figure
      // from the last days needs no close, and a code with none on record is
      // not asked again.
      const byCode = {};
      categorized.forEach((idx) => { byCode[codeOf(idx) + '.INDX'] = idx; });
      const IL = window.IndexLevel;
      const want = codes.filter((c) => {
        if (!IL.isStale(add[c], Date.now())) return false;
        // A close already found, or none on record; a failed request (null
        // from the rejection) is not counted as either.
        if (IL.noEod.has(c) || eodLevels[c]) return false;
        const idx = byCode[c];
        const listDate = idx && idx.LastUpdate ? String(idx.LastUpdate).slice(0, 10) : null;
        return IL.isStale(listDate ? { date: listDate } : null, Date.now());
      });
      if (!want.length || typeof getEod !== 'function') return;
      const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      Promise.all(want.map((c) => Promise.resolve(getEod.call(window.EODHD_API, apiKey, c, from))
        .then((rows) => {
          const close = window.IndexLevel.lastClose(rows);
          if (!close && Array.isArray(rows)) window.IndexLevel.noEod.add(c);
          return [c, close];
        }, () => [c, null])))
        .then((pairs) => { if (!gone) setEodLevels((prev) => ({ ...prev, ...Object.fromEntries(pairs) })); });
    }).catch(() => {});
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorized, apiKey]);

  // Index market cap in its own currency, at a scale that fits it: the DJI
  // reports 8661.67 and read "$0.0T" under a fixed trillions format.
  const formatIndexCap = (v, ccy) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    const a = Math.abs(n);
    const body = a >= 1e12 ? (n / 1e12).toFixed(2) + 'T' : a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n.toLocaleString('en-US');
    return (ccy ? ccy + ' ' : '') + body;
  };
  // A selected code that the loaded list does not carry.
  const isUnknownIndex = (code) => {
    if (!indices || !indices.length || !code) return false;
    const want = String(code).replace(/\.INDX$/i, '').toUpperCase();
    return !indices.some(idx => codeOf(idx) === want || String(idx.ID || '').toUpperCase() === String(code).toUpperCase());
  };
  // First column pinned while the table scrolls sideways on a phone.
  const stickyCell = { position: 'sticky', left: 0, zIndex: 1, background: isDark ? '#1C1A14' : '#ffffff' };

  // Component detail view
  if (selectedIndex && components) {
    const comps = components.Components ? Object.values(components.Components) : [];
    const historical = components.HistoricalTickerComponents ? Object.values(components.HistoricalTickerComponents) : [];
    const sortHead = (col, sort, setSort, align, extra) => {
      const active = sort.key === col;
      const next = () => setSort(active ? { key: col, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: col, dir: col === 'Weight' || col === 'Added' || col === 'Removed' ? 'desc' : 'asc' });
      return React.createElement('th', { key: col, 'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none', style: { textAlign: align, padding: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)', letterSpacing: '0.06em', ...(extra || null) } },
        React.createElement('button', { type: 'button', className: 'ic-sort', onClick: next, style: { all: 'unset', boxSizing: 'border-box', display: 'block', width: '100%', textAlign: align, padding: '8px 12px', cursor: 'pointer' } },
          col, active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''));
    };
    // Missing values sort last in BOTH directions: the direction flip used to
    // put every "—" first on ADDED descending.
    const isMissing = (v) => v == null || v === '' || v === '—' || v === 'NA';
    const cmp = (a, b, dir) => {
      const ma = isMissing(a), mb = isMissing(b);
      if (ma || mb) return ma === mb ? 0 : (ma ? 1 : -1);
      const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
      return dir === 'asc' ? r : -r;
    };
    const compVal = { Code: (c) => c.Code, Name: (c) => c.Name, Weight: (c) => c.Weight || 0, Sector: (c) => c.Sector, Industry: (c) => c.Industry, Exchange: (c) => c.Exchange };
    const histVal = { Code: (h) => h.Code, Name: (h) => h.Name, Added: (h) => h.StartDate || '', Removed: (h) => h.EndDate || '', Status: (h) => (h.IsActiveNow ? 'Active' : h.IsDelisted ? 'Delisted' : 'Removed') };

    return React.createElement('div', { ref: rootRef, style: { fontFamily: "'Sora', sans-serif", color: isDark ? '#E0E3EB' : '#1e1b4b' } },
      // all: 'unset' drops the browser's focus ring on the sort buttons.
      // all: 'unset' sits inline on the buttons and beat this rule, so the
      // ring never showed; it needs !important to win. A hover, too.
      React.createElement('style', null, '.ic-sort:focus-visible{outline:2px solid ' + (isDark ? '#f97316' : '#c2410c') + ' !important;outline-offset:-2px !important;border-radius:2px}'
        + '.ic-sort:hover{background:' + (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') + ' !important}'),
      // Header
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 } },
        React.createElement('button', {
          onClick: leaveIndex,
          style: { background: 'none', border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'), borderRadius: 4, color: isDark ? '#878B93' : '#6b7280', cursor: 'pointer', padding: '6px 12px', fontSize: 12, fontFamily: "'Sora',sans-serif", display: 'flex', alignItems: 'center', gap: 4 }
        }, React.createElement(Icon, { name: 'chevronLeft', size: 14 }), 'Back'),
        // The page's heading in this view (the landing <h1> is not rendered here).
        React.createElement('h1', { tabIndex: -1, 'data-ic-focus': 'title', style: { margin: 0, fontSize: 20, fontWeight: 800 } }, components.General?.Name || selectedIndex),
        React.createElement('span', { style: { fontSize: 12, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', fontFamily: "'Roboto Mono',monospace" } }, components.General?.Code),
      ),
      // Meta
      React.createElement('div', { style: { display: 'flex', gap: 16, marginBottom: 20, fontSize: 13 } },
        comps.length > 0 && React.createElement('span', { style: { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' } }, 'Components: ', React.createElement('span', { style: { fontWeight: 600, color: '#f97316' } }, comps.length)),
        components.General?.CurrencyCode && React.createElement('span', { style: { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' } }, 'Currency: ', React.createElement('span', { style: { fontWeight: 600 } }, components.General.CurrencyCode)),
        // General.MarketCap is not a capitalisation for a price-weighted
        // index: the Dow's read "Market Cap: USD 8,564.85",
        // which is about the index level. Below a million it is not a
        // company total of any index, so it is not shown under that name.
        Number(components.General?.MarketCap) >= 1e6 && React.createElement('span', { style: { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' } }, 'Market Cap: ', React.createElement('span', { style: { fontWeight: 600 } }, formatIndexCap(components.General.MarketCap, components.General.CurrencyCode))),
      ),
      // Action buttons row
      React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' } },
        investNote && React.createElement('div', { id: 'index-invest-note', role: investNote.error ? 'alert' : 'status', style: { flexBasis: '100%', fontSize: 13, lineHeight: 1.5, color: investNote.error ? (isDark ? C3.error : (C3.errorLight || '#c81e2c')) : (isDark ? C3.textDark : C3.textLightTheme) } }, investNote.text),
        askElement,
        // Feature 3: AI Sector Analysis (1 token) -- only when a model is
        // configured; the check used to live in the click handler. And only
        // with components: a token spent analysing an empty list buys nothing.
        comps.length > 0 && Boolean(window.AIService?.getSettings?.()?.enabled) && React.createElement('button', {
          onClick: async () => {
            setSectorLoading(true);
            const sectors = {};
            comps.forEach(c => { sectors[c.Sector || 'Other'] = (sectors[c.Sector || 'Other'] || 0) + (c.Weight || 0); });
            const topSectors = window.IndexSectors.top(sectors, 8).map(([s, w]) => s + ': ' + w.toFixed(1) + '%').join(', ');
            const top5 = comps.sort((a, b) => (b.Weight || 0) - (a.Weight || 0)).slice(0, 5).map(c => c.Code + ' (' + (c.Weight || 0).toFixed(1) + '%)').join(', ');
            const prompt = 'Analyze this index composition:\nIndex: ' + (components.General?.Name || '') + '\nComponents: ' + comps.length + '\nTop sectors: ' + topSectors + '\nTop 5 holdings: ' + top5 + '\n\nProvide:\n1. Sector concentration assessment\n2. Key risks of this composition\n3. Best use case for this index\n4. How it compares to broader market';
            const result = await callAI(prompt);
            setSectorAnalysis(result);
            setSectorLoading(false);
          },
          disabled: sectorLoading,
          style: aiButtonStyle
        }, React.createElement(Icon, { name: 'zap', size: 14, color: isDark ? C3.textMutedDark : C3.textMutedLight }), sectorLoading ? 'Analyzing...' : (indexAiCost ? `AI Sector Analysis · ${indexAiCost}` : 'AI Sector Analysis')),
        // Feature 4: AI Historical Commentary
        historical.length > 0 && Boolean(window.AIService?.getSettings?.()?.enabled) && React.createElement('button', {
          onClick: async () => {
            setHistoricalAILoading(true);
            const changes = window.IndexSectors.recentChanges(historical, '2024-01-01', 20)
              .map(c => c.kind + ' ' + c.code + ' (' + c.name + ') on ' + c.date).join('\n');
            const prompt = 'Analyze recent changes to ' + (components.General?.Name || '') + ':\n\n' + changes + '\n\nFor each change, briefly explain the likely reason (market cap change, profitability, corporate action, etc.). Keep each explanation to 1 sentence.';
            const result = await callAI(prompt);
            setHistoricalAI(result);
            setHistoricalAILoading(false);
          },
          disabled: historicalAILoading,
          style: aiButtonStyle
        }, React.createElement(Icon, { name: 'zap', size: 14, color: isDark ? C3.textMutedDark : C3.textMutedLight }), historicalAILoading ? 'Analyzing...' : (indexAiCost ? `AI: Why These Changes? · ${indexAiCost}` : 'AI: Why These Changes?')),
      ),
      // AI Analysis results
      sectorAnalysis && sectorAnalysis.error && (window.AIText
        ? window.AIText.errorBox(sectorAnalysis.error, isDark)
        : React.createElement('div', { role: 'alert', style: { marginBottom: 16, fontSize: 13, color: C3.error } }, sectorAnalysis.error)),
      historicalAI && historicalAI.error && (window.AIText
        ? window.AIText.errorBox(historicalAI.error, isDark)
        : React.createElement('div', { role: 'alert', style: { marginBottom: 16, fontSize: 13, color: C3.error } }, historicalAI.error)),
      sectorAnalysis && !sectorAnalysis.error && React.createElement('div', { style: { background: isDark ? C3.fillDark : C3.fillLight, border: '1px solid ' + (isDark ? C3.lineDark : C3.lineLight), borderRadius: 4, padding: 16, marginBottom: 16, fontSize: 13, lineHeight: 1.6, color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)' } },
        React.createElement('div', { style: { fontWeight: 700, color: isDark ? C3.textDark : C3.textLightTheme, marginBottom: 8, fontSize: 14 } }, 'AI Sector Analysis'),
        formatAI(sectorAnalysis),
        React.createElement('div', { style: { fontSize: 10, opacity: 0.7, marginTop: 10, fontStyle: 'italic' } }, 'AI-generated \u2014 not financial advice'),
      ),
      historicalAI && !historicalAI.error && React.createElement('div', { style: { background: isDark ? C3.fillDark : C3.fillLight, border: '1px solid ' + (isDark ? C3.lineDark : C3.lineLight), borderRadius: 4, padding: 16, marginBottom: 16, fontSize: 13, lineHeight: 1.6, color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)' } },
        React.createElement('div', { style: { fontWeight: 700, color: isDark ? C3.textDark : C3.textLightTheme, marginBottom: 8, fontSize: 14 } }, 'AI: Historical Changes Commentary'),
        formatAI(historicalAI),
        React.createElement('div', { style: { fontSize: 10, opacity: 0.7, marginTop: 10, fontStyle: 'italic' } }, 'AI-generated \u2014 not financial advice'),
      ),
      // Sector breakdown (quick visual)
      comps.length > 0 && (() => {
        const sectors = {};
        comps.forEach(c => { sectors[c.Sector || 'Other'] = (sectors[c.Sector || 'Other'] || 0) + (c.Weight || 0); });
        const sorted = window.IndexSectors.top(sectors, 8);
        return React.createElement('div', { style: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' } },
          sorted.map(([s, w]) => React.createElement('span', { key: s, style: { padding: '4px 10px', borderRadius: 3, fontSize: 11, background: isDark ? 'rgba(255,255,255,0.04)' : '#fff', border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'), color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' } }, s + ': ' + w.toFixed(1) + '%'))
        );
      })(),
      // Feature 2: Smart Screener (FREE)
      // Wraps: the "1,234" hint takes its own full-width line under the field.
      // In a row that could not wrap, flexBasis 100% squeezed it into a 51 px
      // column beside the field and clipped it at 320 px.
      comps.length > 0 && React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' } },
        React.createElement(window.PortalDropdown, {
          value: screenerFilter.sector,
          options: [{ value: '', label: 'All Sectors' }, ...[...new Set(comps.map(c => c.Sector).filter(Boolean))].sort().map(s => ({ value: s, label: s }))],
          onChange: (v) => setScreenerFilter(prev => ({ ...prev, sector: v })),
          isDark,
          style: { padding: '6px 26px 6px 12px', fontSize: 12, borderRadius: 4 },
          minWidth: 140,
          ariaLabel: 'Sector filter',
        }),
        React.createElement('label', { style: { fontSize: 11, color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', gap: 4 } },
          'Min weight:',
          React.createElement('input', {
            // Text read by window.NumberInput ("0,5" was 5 in a Chrome-EN number
            // field). An unreadable value filters nothing and
            // says why: "1,234" used to keep the "1,23" typed on the way to it,
            // silently, where the screener asks.
            ...(window.NumberInput ? window.NumberInput.fieldProps : { type: 'number' }),
            value: screenerFilter.minWeightText != null ? screenerFilter.minWeightText : String(screenerFilter.minWeight),
            'aria-label': 'Minimum weight, percent',
            'aria-invalid': window.NumberInput && window.NumberInput.check(screenerFilter.minWeightText).error ? 'true' : undefined,
            'aria-describedby': window.NumberInput && window.NumberInput.check(screenerFilter.minWeightText).error ? 'ic-minweight-error' : undefined,
            onChange: (e) => {
              const t = e.target.value;
              const c = window.NumberInput ? window.NumberInput.check(t) : { value: parseFloat(t), error: null, empty: t === '' };
              setScreenerFilter(prev => ({ ...prev, minWeightText: t,
                minWeight: c.empty || c.error ? 0 : (c.value >= 0 ? c.value : prev.minWeight) }));
            },
            style: { width: 60, padding: '4px 8px', borderRadius: 4, border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.45)'), background: isDark ? 'rgba(255,255,255,0.04)' : '#fff', color: isDark ? '#E0E3EB' : '#1e1b4b', fontSize: 12, fontFamily: "'Roboto Mono',monospace" }
          }), '%'
        ),
        React.createElement('span', { style: { marginLeft: 'auto', fontSize: 11, color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' } },
          comps.filter(c => (!screenerFilter.sector || c.Sector === screenerFilter.sector) && (c.Weight || 0) >= screenerFilter.minWeight).length + ' / ' + comps.length + ' shown'
        ),
        window.NumberInput && window.NumberInput.check(screenerFilter.minWeightText).error
          ? React.createElement('span', { id: 'ic-minweight-error', role: 'alert', style: { flexBasis: '100%', width: '100%', order: 1, fontSize: 11, color: isDark ? '#fca5a5' : '#b91c1c' } },
              window.NumberInput.check(screenerFilter.minWeightText).error + ' The weight filter is off until then.')
          : null,
      ),
      // Current components table
      comps.length > 0 && React.createElement('div', { style: { background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'), borderRadius: 4, overflow: 'hidden', marginBottom: 20 } },
        React.createElement('div', { style: { padding: '12px 16px', borderBottom: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'), fontWeight: 700, fontSize: 14 } }, 'Current Components'),
        React.createElement('div', { style: { overflowX: 'auto' } },
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 700 } },
            React.createElement('thead', null,
              React.createElement('tr', { style: { borderBottom: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') } },
                // Weight right after the name: it was the last of six columns
                // and off-screen on a phone. Code stays pinned.
                ['Code', 'Name', 'Weight', 'Sector', 'Industry', 'Exchange'].map(col =>
                  sortHead(col, compSort, setCompSort, col === 'Weight' ? 'right' : 'left', col === 'Code' ? stickyCell : null)
                )
              )
            ),
            React.createElement('tbody', null,
              comps.filter(c => (!screenerFilter.sector || c.Sector === screenerFilter.sector) && (c.Weight || 0) >= screenerFilter.minWeight).sort((a, b) => cmp(compVal[compSort.key](a), compVal[compSort.key](b), compSort.dir)).map((c, i) =>
                React.createElement('tr', { key: c.Code || i, style: { borderBottom: '1px solid ' + (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)') } },
                  React.createElement('td', { style: { padding: '6px 12px', fontWeight: 600, fontSize: 13, fontFamily: "'Sora',sans-serif", ...stickyCell } }, c.Code),
                  React.createElement('td', { style: { padding: '6px 12px', fontSize: 12, color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' } }, c.Name),
                  React.createElement('td', { style: { padding: '6px 12px', textAlign: 'right', fontFamily: "'Roboto Mono',monospace", fontSize: 12, color: c.Weight > 2 ? (isDark ? '#f97316' : '#c2410c') : (isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)') } }, c.Weight ? c.Weight.toFixed(2) + '%' : '—'),
                  React.createElement('td', { style: { padding: '6px 12px', fontSize: 11, color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)' } }, c.Sector),
                  React.createElement('td', { style: { padding: '6px 12px', fontSize: 11, color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)' } }, c.Industry),
                  React.createElement('td', { style: { padding: '6px 12px', fontSize: 11, color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)' } }, c.Exchange),
                )
              )
            )
          )
        ),
      ),
      // Historical changes
      historical.length > 0 && React.createElement('div', { style: { background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'), borderRadius: 4, overflow: 'hidden' } },
        React.createElement('div', { style: { padding: '12px 16px', borderBottom: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'), fontWeight: 700, fontSize: 14 } }, 'Historical Changes'),
        React.createElement('div', { style: { overflowX: 'auto', maxHeight: 400, overflowY: 'auto' } },
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            React.createElement('thead', null,
              React.createElement('tr', { style: { borderBottom: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') } },
                ['Code', 'Name', 'Added', 'Removed', 'Status'].map(col =>
                  sortHead(col, histSort, setHistSort, 'left', { position: 'sticky', top: 0, background: isDark ? '#1E222D' : '#fff' })
                )
              )
            ),
            React.createElement('tbody', null,
              historical.slice().sort((a, b) => cmp(histVal[histSort.key](a), histVal[histSort.key](b), histSort.dir)).map((h, i) =>
                React.createElement('tr', { key: h.Code + i, style: { borderBottom: '1px solid ' + (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)') } },
                  React.createElement('td', { style: { padding: '6px 12px', fontWeight: 600, fontSize: 12 } }, h.Code),
                  React.createElement('td', { style: { padding: '6px 12px', fontSize: 12, color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' } }, h.Name),
                  React.createElement('td', { style: { padding: '6px 12px', fontSize: 11, fontFamily: "'Roboto Mono',monospace", whiteSpace: 'nowrap', color: '#22c55e' } }, h.StartDate || '—'),
                  React.createElement('td', { style: { padding: '6px 12px', fontSize: 11, fontFamily: "'Roboto Mono',monospace", whiteSpace: 'nowrap', color: h.EndDate ? '#ef4444' : (isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)') } }, h.EndDate || 'Active'),
                  React.createElement('td', { style: { padding: '6px 12px' } },
                    React.createElement('span', { style: { padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: h.IsActiveNow ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: h.IsActiveNow ? '#22c55e' : '#ef4444' } }, h.IsActiveNow ? 'Active' : h.IsDelisted ? 'Delisted' : 'Removed')
                  ),
                )
              )
            )
          )
        ),
      ),
      // A code the index list does not carry is refused with a 403 too; that
      // is an unknown index, not a plan verdict (NOPE.INDX read
      // "Not included in this plan").
      components.error && isUnknownIndex(selectedIndex) && React.createElement('div', { role: 'status', style: { textAlign: 'center', padding: 40, color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)', fontSize: 14, lineHeight: 1.5 } },
        'There is no index "' + String(selectedIndex || '').replace(/\.INDX$/i, '') + '" in the S&P Global list EODHD serves. Go back and pick one from the list.'),
      // The same failure where the host's panel already explains it.
      components.error && !isUnknownIndex(selectedIndex) && explainedAbove() && notServed(() => loadComponents(selectedIndex)),
      // Error state: said in the body, with a way to ask again.
      components.error && !isUnknownIndex(selectedIndex) && !(window.Entitlement && window.Entitlement.explained()) && React.createElement('div', { role: 'alert', style: { textAlign: 'center', padding: 40, color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontSize: 14, lineHeight: 1.5 } },
        'The constituent list for ' + String(selectedIndex || 'this index').replace(/\.INDX$/i, '') + (listLimited
          ? ' did not load — ' + RLW.REACHED + ' That is not a statement that the index is empty.'
          : components.unreadable ? ' did not load — ' + RLW.UNREADABLE + ' That is not a statement that the index is empty.'
            : ' did not load — EODHD did not answer, or the connection dropped. That is not a statement that the index is empty.'),
        React.createElement('div', null,
          React.createElement(RLW.RetryButton, {
            wait: rlWait, isDark, 'data-retry-focus': 'true', onClick: () => retryUnlessLimited(() => { retryFocusRef.current = true; loadComponents(selectedIndex); }),
            style: { marginTop: 14, padding: '8px 16px', borderRadius: 6, border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'), background: 'transparent', color: isDark ? '#E0E3EB' : '#1e1b4b', cursor: 'pointer', fontSize: 13, fontFamily: "'Sora',sans-serif" },
          }),
          waitLine())),
    );
  }

  // Loading component detail
  if (selectedIndex && compLoading) {
    return React.createElement('div', { ref: rootRef, style: { fontFamily: "'Sora', sans-serif", color: isDark ? '#E0E3EB' : '#1e1b4b', textAlign: 'center', padding: 60 } },
      // Keyframes travel with the view (hosts without the global CSS).
      React.createElement('style', null, '@keyframes spin { to { transform: rotate(360deg); } }'),
      React.createElement('div', { style: { width: 24, height: 24, border: '3px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'), borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 16px' } }),
      React.createElement('div', { role: 'status' }, 'Loading index components...'),
      // A way out while it loads: back to the list, the load abandoned.
      React.createElement('button', {
        type: 'button', onClick: leaveIndex, 'data-ic-focus': 'leave',
        style: { marginTop: 18, background: 'none', border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'), borderRadius: 4, color: isDark ? '#c8cbd2' : '#4b5563', cursor: 'pointer', padding: '6px 12px', fontSize: 12, fontFamily: "'Sora',sans-serif" },
      }, '← Back to the list'),
    );
  }

  // Browse indices
  return React.createElement('div', { ref: rootRef, style: { fontFamily: "'Sora', sans-serif", color: isDark ? '#E0E3EB' : '#1e1b4b' } },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
      React.createElement('h1', { ref: retryHeadingRef, tabIndex: -1, style: { fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' } }, 'Index Constituents'),
      window.HelpTooltip && React.createElement(window.HelpTooltip, { title: 'Index Constituents', text: 'Browse S&P and Dow Jones US indices and their components. See sector breakdown, weights, and historical composition changes.', isDark }),
    ),

    // What the link named that is no index code (B10, above).
    linkNote && React.createElement('div', { role: 'status', 'data-ic-link-note': '', style: { marginBottom: 16, fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere', color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.7)' } }, linkNote),
    // What opens up once an index is picked. Written as a caption, not as
    // cards: the three used to share the index cards' background, radius and
    // near enough their border, and differed only in the cursor -- which is
    // visible only on hover. A reader clicked them and nothing happened.
    React.createElement('div', {
      'aria-label': 'What you can do once an index is open',
      style: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 18px', marginBottom: 20, fontSize: 12, lineHeight: 1.5, color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)' },
    },
      React.createElement('span', { style: { fontWeight: 700, color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.7)' } }, 'Once an index is open:'),
      ...[
        // Promised only where a model is configured: without one the open
        // index has no AI button to keep it.
        aiEnabled && { icon: 'zap', title: 'AI Analysis', desc: 'sector risks and historical commentary' },
        { icon: 'filter', title: 'Screener', desc: 'filter components by sector, weight and industry' },
      ].filter(Boolean).map(f => React.createElement('span', { key: f.title, style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
        React.createElement(Icon, { name: f.icon, size: 12, color: isDark ? C3.textMutedDark : C3.textMutedLight }),
        React.createElement('span', { style: { fontWeight: 600, color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.7)' } }, f.title),
        React.createElement('span', null, '— ' + f.desc)
      ))
    ),

    // Search + Category tabs
    React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
      React.createElement('input', { ...window.TickerFieldProps,
        value: searchQuery, onChange: (e) => setSearchQuery(e.target.value),
        placeholder: 'Search indices...',
        'aria-label': 'Search indices',
        onFocus: () => setSearchFocused(true),
        onBlur: () => setSearchFocused(false),
        style: { flex: '1 1 200px', maxWidth: 300, padding: '8px 14px', borderRadius: 4, border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.45)'), background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', color: isDark ? '#E0E3EB' : '#1e1b4b', fontSize: 13, fontFamily: "'Sora',sans-serif", outline: 'none', boxSizing: 'border-box',
          // Edge and focus ring at 3:1 or more (1.14-1.69:1 before, /#19).
          boxShadow: searchFocused ? '0 0 0 2px ' + (isDark ? '#f97316' : '#c2410c') : 'none' }
      }),
      ...['popular', 'all', 'americas', 'emea', 'apac', 'global']
        // A region this feed has no index in is not offered (once the list is in).
        .filter(cat => !indices || !indices.length || regionCounts[cat] === undefined || regionCounts[cat] > 0 || category === cat)
        .map(cat =>
        React.createElement('button', {
          key: cat,
          'aria-pressed': category === cat && !query,
          onClick: () => { setCategory(cat); setSearchQuery(''); },
          style: {
            padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)',
            ...window.ToggleStyle.value(category === cat && !query, isDark),
            fontFamily: "'Sora',sans-serif",
          }
        }, cat === 'popular' ? 'Popular' : cat === 'all' ? 'All' : cat === 'americas' ? 'Americas' : cat === 'emea' ? 'EMEA' : cat === 'apac' ? 'APAC' : 'Global')
      )
    ),

    // Loading
    loading && React.createElement('div', { style: { textAlign: 'center', padding: 40, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' } }, 'Loading indices...'),

    // Index grid
    !loading && categorized.length > 0 && React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 } },
      categorized.map(idx => React.createElement('div', {
        key: idx.ID || idx.Code,
        // The only way into an index: reachable by keyboard.
        role: 'button', tabIndex: 0,
        'aria-label': 'Open ' + (idx.Name || idx.Code),
        'data-ic-card': window.IndexCodeFromLink(idx.ID || idx.Code) || idx.ID || idx.Code,
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIndex(idx.ID || idx.Code); } },
        onClick: () => openIndex(idx.ID || idx.Code),
        style: { background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'), borderRadius: 4, padding: 14, cursor: 'pointer', transition: 'border-color 0.15s' },
        onMouseEnter: (e) => e.currentTarget.style.borderColor = 'rgba(249,115,22,0.3)',
        onMouseLeave: (e) => e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 } },
          // h2: the cards sit under the page's h1 (an h3 skipped a level).
          React.createElement('h2', { style: { margin: 0, fontSize: 14, fontWeight: 700 } }, idx.Name?.substring(0, 40)),
          React.createElement('span', { style: { fontSize: 10, color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)', fontFamily: "'Roboto Mono',monospace" } }, idx.Code),
        ),
        React.createElement('div', { style: { display: 'flex', gap: 12, fontSize: 11, color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' } },
          idx.Constituents && React.createElement('span', null, idx.Constituents + ' stocks'),
          // The level is a number, not a gain: no green.
          (() => {
            const lv = window.IndexLevel.pick(idx, liveLevels[codeOf(idx) + '.INDX'], eodLevels[codeOf(idx) + '.INDX']);
            return lv.value != null && React.createElement('span', null, React.createElement('span', { style: { color: isDark ? '#E9E6DF' : '#1a1a2e', fontFamily: "'Roboto Mono',monospace" } }, window.IndexLevel.format(lv.value)));
          })(),
          idx.CurrencyCode && React.createElement('span', null, idx.CurrencyCode),
        ),
        (() => {
          const lv = window.IndexLevel.pick(idx, liveLevels[codeOf(idx) + '.INDX'], eodLevels[codeOf(idx) + '.INDX']);
          return lv.date && React.createElement('div', { style: { fontSize: 10, color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)', marginTop: 6 } }, 'Updated: ' + lv.date);
        })(),
      ))
    ),
    // The list came back in a shape we do not read, or not at all. Said, unless
    // the frame's panel is already saying why (the limit excepted: the panel
    // does not count it down).
    !loading && indicesError && !(explainedAbove() && !(listFail && listFail.limited)) && React.createElement('div', {
      'data-ic-list-fail': listFail ? (listFail.limited ? 'limit' : 'other') : 'unread',
      style: { textAlign: 'center', padding: 30, color: listFail ? (isDark ? '#E0E3EB' : '#1e1b4b') : (isDark ? '#A39B89' : '#6b6b6b'), fontSize: 14, lineHeight: 1.5 },
    },
      // Not served: why, with Try again (counting the limit's wait down;
      // after it the list is asked again by itself).
      listFail && React.createElement('p', { role: 'status', style: { margin: '0 0 14px' } }, RLW.failText('The index list', listFail)),
      listFail && React.createElement(RLW.RetryButton, {
        wait: rlWait, isDark, 'data-retry-focus': 'true', onClick: () => retryUnlessLimited(() => { retryFocusRef.current = true; retryList(); }),
        style: { padding: '10px 22px', background: C3.logoGradient, border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'Sora',sans-serif" },
      }),
      listFail && waitLine(),
      // Answered, in a shape this page does not read: a reload will not help.
      // Read out when it appears, as the failure above is.
      !listFail && React.createElement('span', { role: 'status' }, 'EODHD answered with an index list this page cannot read.')),
    !loading && !indicesError && indices?.length === 0 && !(window.Entitlement && window.Entitlement.explained && window.Entitlement.explained()) && React.createElement('div', {
      style: { textAlign: 'center', padding: 30, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)', fontSize: 14, lineHeight: 1.5 },
    }, 'EODHD returned an empty index list for this key. The S&P Global constituents are a Marketplace add-on; a plan without it gets an empty list rather than a refusal.'),
    !loading && (indicesError || indices?.length === 0) && explainedAbove() && !(listFail && listFail.limited) && notServed(() => { setLoading(true); setListTry(n => n + 1); }),
    !loading && categorized.length === 0 && indices?.length > 0 && React.createElement('div', { style: { textAlign: 'center', padding: 30, color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' } },
      query
        ? 'No indices match "' + query + '"'
        : 'The S&P Global list EODHD serves has no ' + ({ americas: 'Americas', emea: 'EMEA', apac: 'APAC', global: 'global' }[category] || '') + ' indices for this key: all ' + indices.length + ' are in other tabs.'),
  );
};
