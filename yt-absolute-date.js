// ==UserScript==
// @name             YT Absolute Date
// @namespace        https://github.com/PacificCosmophile
// @description      Replaces relative upload dates ("2 years ago") with absolute dates across YouTube.
// @version          2.1
// @author           PacificCosmophile+Vibecoded
// @license          MIT
// @match            https://www.youtube.com/*
// @homepageURL      https://github.com/PacificCosmophile/my-userscripts
// @supportURL       https://github.com/PacificCosmophile/my-userscripts/issues
// @downloadURL      https://update.greasyfork.org/scripts/588066/YouTube%20Show%20Absolute%20Date.user.js
// @updateURL        https://update.greasyfork.org/scripts/588066/YouTube%20Show%20Absolute%20Date.meta.js
// @icon             https://raw.githubusercontent.com/PacificCosmophile/my-userscripts/main/icons/yt-absolute-date-icon.png
// @grant            none
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // Config
    // =========================================================================

    // Set to true for 12-hour time (3:06 pm), false for 24-hour time (15:06).
    const USE_12_HOUR = true;

    // Invisible characters added to the date text. YouTube removes attributes
    // from its elements, but it keeps the text, so the text carries the state.
    const PROCESSED_MARKER = '\u200B'; // Zero-width space, marks a rendered date
    const PENDING_MARKER = '\u2060';   // Word joiner, marks an in-flight fetch

    // Shorts get their own label element. It shows "…" until the date arrives.
    const LABEL_CLASS = 'abs-date-label';
    const PLACEHOLDER = '\u2026';

    // Keywords for finding the relative date ("2 years ago") on the watch page.
    // Both lists must match, so a span like "2 years" alone is not picked.
    const DATE_TIME_KEYWORDS = 'second minute hour day week month year hr wk mo yr'.split(' ');
    const AGO_KEYWORDS = ['ago'];

    // Keywords that mark metadata as belonging to a playlist instead of a
    // single video. A playlist header shows e.g. "Playlist • 17 videos •
    // 92,534 views"; without this filter it would be mistaken for a date.
    const PLAYLIST_KEYWORDS = ['playlist'];

    // Recommendations beside the video (watch page only) get the short date
    // without time, e.g. "10 Oct 2026". Everything else gets date and time.
    const COMPACT_DATE_AREAS = 'ytd-watch-next-secondary-results-renderer, #secondary, ytd-compact-video-renderer';

    // Maximum number of levels to walk up when locating a video card.
    const MAX_CARD_LEVELS = 10;

    // Maximum number of video cards to update in a single run. When reached the
    // run stops early and schedules a continuation, so a page showing many
    // videos at once (e.g. History) is processed in slices instead of
    // blocking the main thread with one long task.
    const MAX_CARDS_PER_RUN = 40;

    // Timing constants (milliseconds).
    const DEBOUNCE_DELAY = 50;
    const TIMER_INTERVAL = 1000;
    const IDLE_TIMEOUT = 500;

    // How long the login headers of a request are reused. They contain a hash
    // with a timestamp, so they are rebuilt now and then (milliseconds).
    const AUTH_HEADERS_TTL = 5 * 60 * 1000;

    // =========================================================================
    // Utils
    // =========================================================================

    const Utils = {
        error(...msgs) { console.error('[YTAD]', ...msgs); },

        /**
         * Limit how often a function runs. Only the last call in a burst runs.
         */
        debounce(func, delay = DEBOUNCE_DELAY) {
            let timeout;
            return function (...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), delay);
            };
        }
    };

    // =========================================================================
    // Helpers
    // =========================================================================

    const Helpers = {
        /**
         * Extract the video id from a link or path. Works for both
         * "/watch?v=ID&list=..." and "/shorts/ID?feature=...".
         *
         * @param {string} url - The href value of a video link.
         * @returns {string} The video id, or an empty string when missing.
         */
        urlToVideoId(url) {
            const match = url?.match(/(?:[?&]v=|\/shorts\/)([\w-]{11})/);
            return match ? match[1] : '';
        },

        /**
         * Safely replace the text of an element's first child text node.
         * Using textContent or innerText may cause issues. For example, on a
         * channel's video page, switching between sorting methods might not
         * update the dates.
         */
        setFirstChildText(element, text) {
            const node = element?.firstChild;
            if (node) {
                node.nodeValue = text;
            }
        }
    };

    // =========================================================================
    // Date formatting (follows the language of your browser and YouTube)
    // =========================================================================

    const DateFormatter = {
        // Created on first use, because YouTube's language is not known yet
        // when the script starts.
        _full: null,    // 10 Oct 2026, 3:06 pm
        _compact: null, // 10 Oct 2026

        _getLocales() {
            const languages = navigator.languages?.length ?
                [...navigator.languages] : [navigator.language || 'en-US'];
            const hl = window.ytcfg?.get?.('HL');
            return hl ? [hl, ...languages] : languages;
        },

        _create(compact) {
            const options = { day: 'numeric', month: 'short', year: 'numeric' };
            if (!compact) {
                Object.assign(options, { hour: 'numeric', minute: '2-digit', hour12: USE_12_HOUR });
            }
            return new Intl.DateTimeFormat(this._getLocales(), options);
        },

        /**
         * @param {string|number|Date} dateLike - e.g. "2024-05-01T10:00:00-07:00"
         * @param {boolean} [compact=false] - true for date only, no time.
         * @returns {string} The formatted date, or "" if the date is invalid.
         */
        format(dateLike, compact = false) {
            const date = new Date(dateLike);
            if (isNaN(date.getTime())) {
                return '';
            }

            const key = compact ? '_compact' : '_full';
            this[key] ??= this._create(compact);

            return this[key].format(date)
                .replace(/\bAM\b/, 'am')
                .replace(/\bPM\b/, 'pm');
        }
    };

    // =========================================================================
    // Date lookup and update
    // =========================================================================

    /**
     * Fetches upload dates and writes them into elements.
     */
    const DateUpdater = {
        // videoId -> Promise of the upload date. A finished request stays here
        // as a cache, and a running request is shared, so the same video is
        // never requested twice at the same time. A failed request is removed
        // so it can be retried on a later run.
        _requests: new Map(),

        // Login headers, shared by all requests until they get too old. This is
        // a Promise, so videos requested at the same moment build them only once.
        _authHeaders: null,
        _authHeadersTime: 0,

        /**
         * Read the settings YouTube's own page uses for its requests, so the
         * client version never gets outdated.
         *
         * @returns {Object|null} The settings, or null when the page has none yet.
         */
        _getPageConfig() {
            const cfg = window.ytcfg;
            if (typeof cfg?.get !== 'function') {
                return null;
            }

            const clientVersion = cfg.get('INNERTUBE_CLIENT_VERSION');
            return {
                apiKey: cfg.get('INNERTUBE_API_KEY'),
                context: cfg.get('INNERTUBE_CONTEXT') ?? { client: { clientName: 'WEB', clientVersion } },
                clientName: cfg.get('INNERTUBE_CLIENT_NAME'),
                clientVersion: clientVersion,
                visitorData: cfg.get('VISITOR_DATA')
            };
        },

        _getCookie(name) {
            const prefix = name + '=';
            const entry = document.cookie.split('; ').find(cookie => cookie.startsWith(prefix));
            return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
        },

        async _sha1Hex(text) {
            const buffer = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
            return Array.from(new Uint8Array(buffer))
                .map(byte => byte.toString(16).padStart(2, '0'))
                .join('');
        },

        /**
         * YouTube's own page proves who you are with a hash made from the
         * SAPISID cookies. Without it the request counts as anonymous and can
         * be rejected with LOGIN_REQUIRED. When you are logged out there are no
         * such cookies, and the request is sent without them.
         */
        async _buildAuthHeaders(config) {
            const headers = { 'Content-Type': 'application/json' };
            const origin = location.origin;
            const timestamp = Math.floor(Date.now() / 1000);

            const authorizations = [];
            for (const [cookieName, headerName] of [
                ['SAPISID', 'SAPISIDHASH'],
                ['__Secure-1PAPISID', 'SAPISID1PHASH'],
                ['__Secure-3PAPISID', 'SAPISID3PHASH']
            ]) {
                const sid = this._getCookie(cookieName);
                if (sid) {
                    const hash = await this._sha1Hex(`${timestamp} ${sid} ${origin}`);
                    authorizations.push(`${headerName} ${timestamp}_${hash}`);
                }
            }

            if (authorizations.length > 0) {
                headers['Authorization'] = authorizations.join(' ');
                headers['X-Origin'] = origin;
            }
            if (config.visitorData) {
                headers['X-Goog-Visitor-Id'] = config.visitorData;
            }
            return headers;
        },

        _getAuthHeaders(config) {
            if (!this._authHeaders || Date.now() - this._authHeadersTime > AUTH_HEADERS_TTL) {
                this._authHeadersTime = Date.now();
                this._authHeaders = this._buildAuthHeaders(config).catch(error => {
                    this._authHeaders = null; // Do not keep a failure for the whole TTL.
                    throw error;
                });
            }
            return this._authHeaders;
        },

        async _fetch(videoId) {
            // The page has not set up its config yet. This is retried on a later run.
            const config = this._getPageConfig();
            if (!config) {
                return undefined;
            }

            try {
                const headers = { ...await this._getAuthHeaders(config) };
                if (config.clientName !== undefined && config.clientName !== null) {
                    headers['X-Youtube-Client-Name'] = String(config.clientName);
                }
                if (config.clientVersion) {
                    headers['X-Youtube-Client-Version'] = config.clientVersion;
                }

                const url = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'
                    + (config.apiKey ? `&key=${config.apiKey}` : '');
                const response = await fetch(url, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ context: config.context, videoId: videoId })
                });
                if (!response.ok) {
                    return undefined;
                }

                const info = (await response.json()).microformat?.playerMicroformatRenderer;
                if (!info) {
                    return undefined;
                }

                // A stream that is live right now uses its start time. Anything
                // else (including finished streams) uses its publish date.
                if (info.liveBroadcastDetails?.isLiveNow) {
                    return info.liveBroadcastDetails.startTimestamp;
                }
                return info.publishDate || info.uploadDate;
            }
            catch (error) {
                return undefined;
            }
        },

        /**
         * @param {string} videoId - YouTube video ID.
         * @returns {Promise<string|undefined>} The upload date string.
         */
        getUploadDate(videoId) {
            if (!this._requests.has(videoId)) {
                const request = this._fetch(videoId).then(date => {
                    if (!date) {
                        this._requests.delete(videoId);
                    }
                    return date;
                });
                this._requests.set(videoId, request);
            }
            return this._requests.get(videoId);
        },

        /**
         * Start replacing the relative date in an element.
         *
         * The returned status separates the pending claim from the finished
         * state so callers can avoid duplicate work without losing retries:
         * - 'notReady': the element has no text yet, retry on a later run.
         * - 'pending':  a fetch for this element is in flight, skip.
         * - 'done':     the absolute date is already rendered, skip.
         * - 'updated':  the element was just claimed, the fetch has started.
         *
         * @param {string} videoId - YouTube video ID.
         * @param {HTMLElement} elem - The element that holds the date text.
         * @param {string} [separator] - Use when the date is only the end of
         *     the text, like "Channel • 2 years ago". Everything before the
         *     last separator is kept.
         * @returns {'notReady'|'pending'|'done'|'updated'} The status.
         */
        start(videoId, elem, separator) {
            const node = elem.firstChild;
            const text = node?.nodeValue;
            if (!text) {
                return 'notReady';
            }
            if (text.includes(PROCESSED_MARKER)) {
                return 'done';
            }
            if (text.includes(PENDING_MARKER)) {
                return 'pending';
            }

            let prefix = '';
            if (separator) {
                const cut = text.lastIndexOf(separator);
                if (cut === -1) {
                    return 'notReady';
                }
                prefix = text.slice(0, cut + separator.length);
            }

            // Claim the element. The marker becomes PROCESSED_MARKER once the
            // date is rendered, or the original text comes back if it fails.
            node.nodeValue = text + PENDING_MARKER;

            this._render(videoId, elem, text, prefix);
            return 'updated';
        },

        async _render(videoId, elem, originalText, prefix) {
            const uploadDate = await this.getUploadDate(videoId);
            const formatted = DateFormatter.format(uploadDate, this._isCompact(elem));

            // YouTube may have reused the element for another video while we
            // waited. Then our marker is gone and the element is left alone.
            const node = elem.firstChild;
            if (!node || !node.nodeValue?.includes(PENDING_MARKER)) {
                return;
            }

            // On failure the original text returns without any marker, so the
            // element is picked up again on a later run.
            node.nodeValue = formatted ? prefix + formatted + PROCESSED_MARKER : originalText;
        },

        _isCompact(elem) {
            return location.pathname === '/watch' && !!elem.closest(COMPACT_DATE_AREAS);
        }
    };

    // =========================================================================
    // Watch page: date under the video title
    // =========================================================================

    function processDescription() {
        // Read the upload date embedded in the current watch page.
        function parseUploadDate() {
            const el = document.body.querySelector('player-microformat-renderer script');
            if (!el) {
                return null;
            }

            try {
                const data = JSON.parse(el.textContent);
                return data.startDate || data.uploadDate || null;
            }
            catch (error) {
                // The script tag can be empty while YouTube is still filling in
                // the page. This runs again on the next page change.
                return null;
            }
        }

        const uploadDate = parseUploadDate();
        const infoContainer = document.querySelector('#info-container > #info');
        if (!uploadDate || !infoContainer) {
            return;
        }

        // Non-date spans may also contain these keywords, so two separate
        // keyword lists must both match.
        const dateSpan = Array.from(infoContainer.querySelectorAll('span')).find(span => {
            const text = span.textContent;
            return AGO_KEYWORDS.some(ago => text.includes(ago)) &&
                DATE_TIME_KEYWORDS.some(keyword => text.includes(keyword));
        });
        if (!dateSpan || dateSpan.textContent.includes(PROCESSED_MARKER)) {
            return;
        }

        const formatted = DateFormatter.format(uploadDate);
        if (formatted) {
            Helpers.setFirstChildText(dateSpan, formatted + PROCESSED_MARKER);
        }
    }

    // =========================================================================
    // Search page: topic card with a list of videos on the side
    // =========================================================================

    function processTopicSidebar() {
        const selector = '#contents > ytd-universal-watch-card-renderer > #sections > ytd-watch-card-section-sequence-renderer > #lists > ytd-vertical-watch-card-list-renderer > #items > ytd-watch-card-compact-video-renderer';

        document.querySelectorAll(selector).forEach(el => {
            const holder = el.querySelector('div.text-wrapper > yt-formatted-string.subtitle');
            const videoId = Helpers.urlToVideoId(el.querySelector('a#thumbnail')?.getAttribute('href'));
            if (holder && videoId) {
                DateUpdater.start(videoId, holder, ' • ');
            }
        });
    }

    // =========================================================================
    // Video cards (home, search, channel, playlist, recommendations, history)
    // =========================================================================

    /**
     * The date element is located by walking up from one of a card's video
     * links until the enclosing element holds the links of that video only and
     * yields a date element.
     */
    const VideoCard = {
        // Links that have been processed, mapped to the video id they were
        // processed for. YouTube may keep the same <a> and only change its href,
        // so a link is processed again when its video id changes. A WeakMap
        // releases entries automatically when the link is removed.
        _processedLinks: new WeakMap(),

        // True while a continuation run is queued, so that several runs
        // reaching the limit do not schedule duplicates.
        _continuationScheduled: false,

        /**
         * Collect all video links with a valid video id. Links are not
         * deduplicated by id: a playlist may show the same video in
         * neighboring cards, and each card needs its own date.
         */
        _getVideoLinks() {
            const links = [];
            const ids = [];
            for (const link of document.querySelectorAll('a[href^="/watch?v="]')) {
                const id = Helpers.urlToVideoId(link.getAttribute('href'));
                if (id) {
                    links.push(link);
                    ids.push(id);
                }
            }
            return { links, ids };
        },

        /**
         * Walk up from a link. The lowest ancestor that holds the links of this
         * video only (see _isValidCard) and yields a date element (see
         * _findDateElement) is used.
         */
        _locateDateElement(link, videoId) {
            let node = link;
            for (let level = 0; level < MAX_CARD_LEVELS && node !== null; level++) {
                if (this._isValidCard(node, videoId)) {
                    const dateElem = this._findDateElement(node);
                    if (dateElem) {
                        return dateElem;
                    }
                }
                node = node.parentElement;
            }
            return null;
        },

        /**
         * A real card holds links to one video only (thumbnail and title).
         * Bigger containers, like a whole shelf, hold links to many videos and
         * are rejected.
         */
        _isValidCard(card, videoId) {
            const anchors = card.querySelectorAll('a[href^="/watch?v="]');
            if (anchors.length === 0) {
                return false;
            }
            for (const anchor of anchors) {
                if (Helpers.urlToVideoId(anchor.getAttribute('href')) !== videoId) {
                    return false;
                }
            }
            return true;
        },

        /**
         * The uploader, view count and date are `[role="group"] [role="text"]`
         * elements; the date is the last one of the group that holds the view
         * count. A group with a single text (the uploader) is skipped, and so is
         * a group whose first text has a playlist keyword.
         */
        _findDateElement(node) {
            let dateElem = null;

            for (const group of node.querySelectorAll('[role="group"]')) {
                const texts = group.querySelectorAll('[role="text"]');
                if (texts.length <= 1) {
                    continue;
                }

                const firstText = texts[0].textContent.toLowerCase();
                if (PLAYLIST_KEYWORDS.some(keyword => firstText.includes(keyword.toLowerCase()))) {
                    continue;
                }

                dateElem = texts[texts.length - 1];
            }

            // Older card layout, used by search results. It has no `role`
            // attributes: the line "18 lakh views • 3 hr ago" is two plain
            // `inline-metadata-item` spans, and the date is the last one.
            // Two spans are needed, so a single "watching" span is skipped.
            if (!dateElem) {
                const spans = node.querySelectorAll('span.inline-metadata-item');
                if (spans.length >= 2) {
                    dateElem = spans[spans.length - 1];
                }
            }

            return dateElem;
        },

        /**
         * Run again when idle, so cards skipped after reaching
         * MAX_CARDS_PER_RUN are not missed when the page stops changing.
         */
        _scheduleContinuation() {
            if (this._continuationScheduled) {
                return;
            }
            this._continuationScheduled = true;

            const run = () => {
                this._continuationScheduled = false;
                this.process();
            };

            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(run, { timeout: IDLE_TIMEOUT });
            }
            else {
                setTimeout(run, 0);
            }
        },

        /**
         * Process all video cards on the page. At most MAX_CARDS_PER_RUN cards
         * are updated per run; the rest continues in a later run.
         */
        process() {
            const { links, ids } = this._getVideoLinks();
            let updated = 0;

            for (let index = 0; index < links.length; index++) {
                const link = links[index];
                const videoId = ids[index];

                // Skip links already processed for the same video.
                if (this._processedLinks.get(link) === videoId) {
                    continue;
                }

                const dateElem = this._locateDateElement(link, videoId);
                if (!dateElem) {
                    continue;
                }

                const status = DateUpdater.start(videoId, dateElem);

                // Remember the link only once the absolute date is rendered. A
                // failed fetch removes the marker, so the card is retried later.
                if (status === 'done') {
                    this._processedLinks.set(link, videoId);
                    continue;
                }

                // Count a card only when it was newly claimed.
                if (status === 'updated' && ++updated >= MAX_CARDS_PER_RUN) {
                    this._scheduleContinuation();
                    return;
                }
            }
        }
    };

    // =========================================================================
    // Shorts
    // =========================================================================

    /**
     * Shorts have no relative date to replace in the page, so a new line with
     * the date is added: under the title in the Shorts player, and under the
     * view count in Shorts grids and shelves.
     */
    const Shorts = {
        _PLAYER_CSS: 'margin-top:4px;font:inherit;font-size:14px;color:inherit;opacity:0.9;white-space:nowrap;',
        _GRID_CSS: 'font-size:1.2rem;line-height:1.8rem;font-weight:400;color:var(--yt-spec-text-secondary,#aaa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
        _SHELF_CSS: 'font-size:1.2rem;line-height:1.8rem;font-weight:400;color:var(--yt-spec-text-secondary,#aaa);',

        _isDone(label, videoId) {
            return label.dataset.ytadVid === videoId && label.textContent !== PLACEHOLDER;
        },

        async _fill(label, videoId) {
            // A label reused for another Short must not keep the old date.
            if (label.dataset.ytadVid !== videoId) {
                label.dataset.ytadVid = videoId;
                label.textContent = PLACEHOLDER;
            }

            const text = DateFormatter.format(await DateUpdater.getUploadDate(videoId));

            // Skip if the label was removed or reused meanwhile. The text is
            // only written when it differs, so no needless page change fires.
            if (!text || !label.isConnected || label.dataset.ytadVid !== videoId) {
                return;
            }
            if (label.textContent !== text) {
                label.textContent = text;
            }
        },

        /**
         * Find the date label inside `root`, or create it next to `anchor`,
         * then fill it when it is not done yet.
         *
         * @param {Element} root - Where an existing label is searched.
         * @param {Element} anchor - Where a new label is inserted.
         * @param {'afterend'|'beforeend'} position - Position next to anchor.
         */
        _upsert(root, anchor, position, videoId, css) {
            let label = root.querySelector('.' + LABEL_CLASS);
            if (!label) {
                label = document.createElement('div');
                label.className = LABEL_CLASS;
                label.style.cssText = css;
                anchor.insertAdjacentElement(position, label);
            }
            if (!this._isDone(label, videoId)) {
                this._fill(label, videoId);
            }
        },

        // Shorts player: the id is in the address bar while a Short is open.
        _processPlayer(overlay) {
            const link = overlay.querySelector("a[href*='watch?v=']");
            const videoId = Helpers.urlToVideoId(location.pathname) ||
                Helpers.urlToVideoId(link?.getAttribute('href'));
            const titleBox = overlay.querySelector('yt-shorts-video-title-view-model');
            const title = titleBox?.querySelector('h2');
            if (videoId && title) {
                this._upsert(titleBox, title, 'afterend', videoId, this._PLAYER_CSS);
            }
        },

        // Shorts grid, for example on a channel's Shorts tab.
        _processGridItem(item) {
            const videoId = Helpers.urlToVideoId(item.querySelector("a[href*='/shorts/']")?.getAttribute('href'));
            const subhead = item.querySelector('.shortsLockupViewModelHostOutsideMetadataSubhead');
            if (videoId && subhead?.parentElement) {
                this._upsert(subhead.parentElement, subhead, 'afterend', videoId, this._GRID_CSS);
            }
        },

        // Older Shorts shelf layout.
        _processShelfItem(item) {
            const videoId = Helpers.urlToVideoId(item.querySelector("a[href*='/shorts/']")?.getAttribute('href'));
            const overlayText = item.querySelector('#overlay-text');
            if (videoId && overlayText) {
                this._upsert(item, overlayText, 'beforeend', videoId, this._SHELF_CSS);
            }
        },

        process() {
            document.querySelectorAll('.metadata-container.ytd-reel-player-overlay-renderer')
                .forEach(overlay => this._processPlayer(overlay));
            document.querySelectorAll('ytm-shorts-lockup-view-model')
                .forEach(item => this._processGridItem(item));
            document.querySelectorAll('ytd-reel-item-renderer')
                .forEach(item => this._processShelfItem(item));
        }
    };

    // =========================================================================
    // Page Handler
    // =========================================================================

    /**
     * Decides when to run: it observes page changes and runs a timer on the
     * subscriptions page.
     */
    const PageHandler = {
        _SUBSCRIPTIONS_PATTERN: /subscriptions/,

        _formatters: [
            processDescription,
            processTopicSidebar,
            () => VideoCard.process(),
            () => Shorts.process()
        ],

        _debouncedRun: null,
        _subscriptionsTimer: null,

        start() {
            this._debouncedRun = Utils.debounce(() => this.runAllFormatters());

            window.addEventListener('yt-navigate-finish', () => {
                this._syncSubscriptionsTimer();
                this.runAllFormatters();
            });

            this._startObserver();
            this._syncSubscriptionsTimer();
            this.runAllFormatters();
        },

        /**
         * Run all formatters. One failing formatter does not stop the others.
         */
        runAllFormatters() {
            for (const formatter of this._formatters) {
                try {
                    formatter();
                }
                catch (error) {
                    Utils.error('Error running formatter:', error);
                }
            }
        },

        /**
         * Run (debounced) when elements are added or removed, or when a link
         * gets a new href because YouTube reused it for another video.
         */
        _startObserver() {
            new MutationObserver(() => {
                // The subscriptions page is handled by a timer instead.
                if (this._SUBSCRIPTIONS_PATTERN.test(location.href)) {
                    return;
                }
                this._debouncedRun();
            }).observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['href']
            });
        },

        /**
         * Dates on the subscriptions page aren't updated properly using the
         * observer, so a dedicated timer is used there.
         */
        _syncSubscriptionsTimer() {
            if (this._SUBSCRIPTIONS_PATTERN.test(location.href)) {
                if (this._subscriptionsTimer === null) {
                    this._subscriptionsTimer = setInterval(() => this.runAllFormatters(), TIMER_INTERVAL);
                }
            }
            else if (this._subscriptionsTimer !== null) {
                clearInterval(this._subscriptionsTimer);
                this._subscriptionsTimer = null;
            }
        }
    };

    PageHandler.start();
})();
