// ==UserScript==
// @name             YT Playlist Numbers
// @namespace        https://github.com/PacificCosmophile
// @description      Displays playlist video numbers on YouTube's new playlist page.
// @version          1.5
// @author           PacificCosmophile+Vibecoded
// @license          MIT
// @match            https://www.youtube.com/playlist?*
// @homepageURL      https://github.com/PacificCosmophile/my-userscripts
// @supportURL       https://github.com/PacificCosmophile/my-userscripts/issues
// @downloadURL      https://update.greasyfork.org/scripts/588001/YouTube%20Playlist%20Numbers.user.js
// @updateURL        https://update.greasyfork.org/scripts/588001/YouTube%20Playlist%20Numbers.meta.js
// @icon             https://raw.githubusercontent.com/PacificCosmophile/my-userscripts/main/icons/yt-playlist-numbers-icon.png
// @run-at           document-idle
// @grant            none
// ==/UserScript==

// Icon credit:
// YouTube playlist icons created by kawalanicon
// https://www.flaticon.com/free-icons/youtube-playlist

(() => {
    'use strict';

    const STYLE_ID = 'yt-playlist-number-style';

    const NEW_ITEM_SELECTOR = 'yt-lockup-view-model';
    const OLD_ITEM_SELECTOR = 'ytd-playlist-video-renderer';

    const NEW_THUMB_SELECTOR = '.ytLockupViewModelContentImage';
    const OLD_THUMB_SELECTOR = 'ytd-thumbnail';

    const ITEM_SELECTOR =
        `${NEW_ITEM_SELECTOR},${OLD_ITEM_SELECTOR}`;

    let playlistObserver = null;
    let retryObserver = null;
    let nextNumber = 1;

    // Keeps the assigned playlist position without modifying
    // the YouTube DOM or preventing unused elements from being
    // garbage-collected.
    const itemNumbers = new WeakMap();

    function injectStyle() {
        if (document.getElementById(STYLE_ID))
            return;

        const style = document.createElement('style');
        style.id = STYLE_ID;

        style.textContent = `
.ytpn-index{
    position:absolute;
    top:6px;
    left:6px;

    min-width:16px;
    height:16px;

    padding:1px 4px;

    box-sizing:border-box;

    display:flex;
    align-items:center;
    justify-content:center;

    background:rgba(0,0,0,.80);

    color:#fff;

    border-radius:3px;

    font-family:Roboto,Arial,sans-serif;
    font-size:11px;
    font-weight:500;
    line-height:1;

    user-select:none;
    pointer-events:none;

    z-index:2;

    opacity:.90;
    transition:opacity .15s ease;
}

.ytLockupViewModelContentImage:hover .ytpn-index,
ytd-thumbnail:hover .ytpn-index{
    opacity:1;
}
`;

        document.head.appendChild(style);
    }

    function isPlaylistItem(node) {
        return node?.matches?.(ITEM_SELECTOR) || false;
    }

    function assignNumber(item) {
        let number = itemNumbers.get(item);

        if (number === undefined) {
            number = nextNumber++;
            itemNumbers.set(item, number);
        }

        return number;
    }

    function processItem(item) {
        if (!isPlaylistItem(item))
            return;

        if (item.dataset.ytpnProcessed)
            return;

        const isNewRenderer = item.matches(NEW_ITEM_SELECTOR);

        const thumb = item.querySelector(
            isNewRenderer
                ? NEW_THUMB_SELECTOR
                : OLD_THUMB_SELECTOR
        );

        if (!thumb)
            return;

        const href = thumb.href || thumb.getAttribute('href');

        // Prefer YouTube's own playlist index when available.
        const match = href?.match(/[?&]index=(\d+)/);

        // Fall back to the item's assigned DOM-order number.
        const index = match
            ? match[1]
            : String(assignNumber(item));

        if (!thumb.style.position) {
            thumb.style.position = 'relative';
        }

        // Prevent duplicate badges even if YouTube reconstructs
        // parts of the item's DOM.
        if (thumb.querySelector('.ytpn-index'))
            return;

        const badge = document.createElement('span');
        badge.className = 'ytpn-index';
        badge.textContent = index;

        thumb.appendChild(badge);

        item.dataset.ytpnProcessed = '1';
    }

    function reserveAndProcess(item) {
        if (!isPlaylistItem(item))
            return;

        // Reserve the item's position as soon as the item appears.
        // This keeps numbering stable if the thumbnail is created later.
        assignNumber(item);

        processItem(item);
    }

    function scan(container) {
        const items = container.querySelectorAll(ITEM_SELECTOR);

        for (const item of items) {
            reserveAndProcess(item);
        }
    }

    function processAddedNode(node) {
        if (node.nodeType !== 1)
            return;

        // The added node itself is a playlist item.
        if (isPlaylistItem(node)) {
            reserveAndProcess(node);
            return;
        }

        // The node may have been inserted inside an existing
        // playlist item whose thumbnail is being constructed.
        const parentItem = node.closest?.(ITEM_SELECTOR);

        if (parentItem) {
            reserveAndProcess(parentItem);
        }

        // The added subtree may contain one or more playlist items.
        node.querySelectorAll?.(ITEM_SELECTOR)
            .forEach(reserveAndProcess);
    }

    function observePlaylist() {
        const container = document.querySelector('#contents');

        if (!container)
            return false;

        scan(container);

        if (playlistObserver) {
            playlistObserver.disconnect();
        }

        playlistObserver = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    processAddedNode(node);
                }
            }
        });

        playlistObserver.observe(container, {
            childList: true,
            subtree: true
        });

        return true;
    }

    function init() {
        injectStyle();

        if (playlistObserver) {
            playlistObserver.disconnect();
            playlistObserver = null;
        }

        if (retryObserver) {
            retryObserver.disconnect();
            retryObserver = null;
        }

        nextNumber = 1;

        if (observePlaylist())
            return;

        retryObserver = new MutationObserver(() => {
            if (observePlaylist()) {
                retryObserver.disconnect();
                retryObserver = null;
            }
        });

        retryObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    document.addEventListener('yt-navigate-finish', init);

    init();

})();
