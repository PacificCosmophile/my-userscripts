// ==UserScript==
// @name                Reddit Absolute Dates
// @namespace           https://github.com/PacificCosmophile/
// @description         Replaces Reddit's relative timestamps with clear, absolute dates.
// @version             1.5
// @author              PacificCosmophile+Vibecoded
// @license             MIT
// @icon                https://raw.githubusercontent.com/PacificCosmophile/my-userscripts/main/icons/reddit-absolute-dates-icon.png
// @homepageURL         https://github.com/PacificCosmophile/my-userscripts
// @supportURL          https://github.com/PacificCosmophile/my-userscripts/issues
// @downloadURL         https://update.greasyfork.org/scripts/588396/Reddit%20Absolute%20Dates.user.js
// @updateURL           https://update.greasyfork.org/scripts/588396/Reddit%20Absolute%20Dates.meta.js
// @match               https://reddit.com/*
// @require             https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js
// @grant               GM_getValue
// @grant               GM_setValue
// @grant               GM_registerMenuCommand
// @run-at              document-idle
// ==/UserScript==

(() => {
    'use strict';

    const SELECTOR = 'time[datetime]';

    const DEFAULT_FORMAT = "D MMM YYYY, h:mm a";
    const STORAGE_KEY = 'redditAbsoluteDates.format';

    function format(iso) {
        const date = dayjs(iso);

        if (!date.isValid()) return null;

        return date.format(GM_getValue(STORAGE_KEY, DEFAULT_FORMAT));
    }



    function convert(time) {
        if (!(time instanceof HTMLTimeElement)) return;
        if (!time.isConnected) return;

        const iso = time.dateTime;
        if (!iso || time.dataset.absoluteDate === iso) return;

        const text = format(iso);
        if (!text) return;

        time.textContent = text;
        time.dataset.absoluteDate = iso;
    }

    function scan(root) {
        if (!root) return;

        if (root instanceof HTMLTimeElement) {
            convert(root);
        } else {
            root.querySelectorAll?.(SELECTOR).forEach(convert);
        }
    }

    function refreshDates() {

        document.querySelectorAll(SELECTOR).forEach(time => {
            delete time.dataset.absoluteDate;
            convert(time);
        });

    }

    function injectStyles() {

        if (document.getElementById('rad-style')) return;

        const style = document.createElement('style');

        style.id = 'rad-style';

        style.textContent = ` #rad-dialog::backdrop {

background: rgba(0, 0, 0, .45);

backdrop-filter: blur(10px);

animation: radBackdropFade .22s ease forwards;

}


#rad-dialog {
border: 1px solid rgba(255, 255, 255, .08);
border-radius: 28px;
padding: 0;

margin:auto;


width:min(480px, calc(100vw - 32px));

background: linear-gradient(180deg,
rgba(255, 255, 255, .82),
rgba(255, 255, 255, .70));

opacity:0;

transform: scale(.96) translateY(10px);

animation: radDialogOpen .28s cubic-bezier(.2, .9, .2, 1) forwards;

color: #1c1c1c;

backdrop-filter: blur(32px) saturate(180%);

-webkit-backdrop-filter: blur(32px) saturate(180%);

box-shadow: 0 32px 80px rgba(0, 0, 0, .30),
0 8px 24px rgba(0, 0, 0, .18),
inset 0 1px rgba(255, 255, 255, .45);

overflow: hidden;

font-family: "Segoe UI Variable",
"Segoe UI",
system-ui,
sans-serif;

font-size:14px;

line-height:1.5;


}

@media (prefers-color-scheme: dark) {

#rad-dialog {

background: linear-gradient(180deg,
rgba(36, 36, 38, .90),
rgba(26, 26, 28, .86));

color:#f2f2f2;

border:1px solid rgba(255, 255, 255, .06);

}

}

#rad-header {

padding:20px 26px;

background: linear-gradient(180deg,
rgba(255, 255, 255, .05),
rgba(255, 255, 255, 0)),

linear-gradient(90deg,
rgba(255, 69, 0, .12),
transparent 70%);

border-bottom: 1px solid rgba(255, 255, 255, .06);

}

#rad-format {

width:100%;

padding:14px 16px;

border-radius:14px;

border:1px solid rgba(255, 255, 255, .12);

background: rgba(255, 255, 255, .42);

backdrop-filter: blur(16px);

font:inherit;

transition: border-color .2s ease,
box-shadow .2s ease,
background .2s ease;

}

#rad-format:focus {

outline:none;

border-color:#FF4500;

box-shadow: 0 0 0 4px rgba(255, 69, 0, .20),

0 0 24px rgba(255, 69, 0, .25);

}

@media (prefers-color-scheme:dark) {

#rad-format {

background: rgba(255, 255, 255, .05);

}
}

.rad-icon {

width:16px;

height:16px;

flex:none;

display:inline-block;

vertical-align:-2px;

color:inherit;

}

.rad-preview-box {

margin-top:16px;

padding:18px 20px;

border-radius:18px;

border:1px solid rgba(255, 255, 255, .08);

background: linear-gradient(180deg,
rgba(255, 255, 255, .07),
rgba(255, 255, 255, .03));

box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08),

0 8px 24px rgba(0, 0, 0, .18);

transition: transform .18s ease,
border-color .18s ease;

}

.rad-preview-box:hover {

border-color: rgba(255, 255, 255, .14);


transition: background .18s ease,
transform .18s ease,
border-color .18s ease;

}

@media (prefers-color-scheme:dark) {

.rad-preview-box {
background: rgba(255, 255, 255, .04);
}
}

.rad-button {

min-width:96px;

height:42px;

padding:0 22px;

border-radius:999px;

border:1px solid rgba(255, 255, 255, .10);

user-select:none;

background: rgba(255, 255, 255, .08);

color:inherit;

font-size:14px;

font-weight:700;

letter-spacing:.01em;

cursor:pointer;

transition: background .18s ease,
border-color .18s ease,
color .18s ease,
transform .18s ease;


display:flex;

align-items:center;

justify-content:center;

gap:8px;

}

.rad-button:hover {

background: rgba(255, 255, 255, .15);

transform: translateY(-1px);

}

.rad-primary {

border:none;

color:#FFFFFF;

font-weight:700;

animation:radGlow 3.5s ease-in-out infinite;

background: linear-gradient(180deg,
#ff7137,
#ff4500);

box-shadow: 0 8px 20px rgba(255, 69, 0, .28),

0 0 0 rgba(255, 69, 0, 0);

transition: transform .18s ease,

box-shadow .25s ease,

background .25s ease;

}

.rad-primary:hover {

background: linear-gradient(180deg,
#ff834d,
#ff5b1f);

transform: translateY(-1px) scale(1.02);

box-shadow: 0 12px 26px rgba(255, 69, 0, .36),

0 0 18px rgba(255, 69, 0, .22);

}

.rad-primary:focus-visible {

outline:none;

box-shadow: 0 0 0 3px rgba(255, 69, 0, .22),

0 12px 28px rgba(255, 69, 0, .35);

}


#rad-header h2 {

margin:0;

font-size:26px;

font-weight:700;

letter-spacing:-0.02em;

line-height:1.2;

}

#rad-body {

padding:24px 28px;

}

#rad-footer {

display:flex;

justify-content:flex-end;

align-items:center;

gap:12px;

padding:16px 24px;

border-top:1px solid rgba(255, 255, 255, .08);

background: rgba(255, 255, 255, .02);

}


.rad-preview-title {

font-size:11px;

font-weight:700;

text-transform:uppercase;

letter-spacing:.12em;

color:#A8ADB3;

margin-bottom:10px;

display:flex;

align-items:center;

gap:8px;

}

#rad-preview {

font-size:26px;

font-weight:700;

line-height:1.35;

color:inherit;

word-break:break-word;

transition: color .2s ease,
opacity .2s ease,
transform .2s ease;

}

@media (prefers-color-scheme:dark) {

#rad-preview {

color:#FFFFFF;

}

}


@media(prefers-color-scheme:dark) {

.rad-button {

color:#F2F2F2;

}

}

.rad-row {
display: flex;
justify-content: space-between;
align-items: center;
margin-bottom: 8px;
}

.rad-label {

display:flex;

align-items:center;

gap:8px;

margin-bottom:12px;

font-size:14px;

font-weight:700;

letter-spacing:.01em;

color:inherit;

user-select:none;

}

@media (prefers-color-scheme:dark) {

.rad-label {

color:#D7DADC;

}

}

.rad-label::after {

content:"";

flex:1;

height:1px;

margin-left:12px;

background: linear-gradient(90deg,
rgba(255, 255, 255, .12),
transparent);

}

.rad-guide {

padding:6px 14px;

border-radius:999px;

background: rgba(255, 255, 255, .08);

border: 1px solid rgba(255, 255, 255, .08);

color:#6EA8FF;

font-size:13px;

font-weight:700;

text-decoration:none;

transition:.18s;

}

.rad-guide:hover {

background: rgba(255, 255, 255, .14);

}

.rad-button:disabled {

opacity:.38;

cursor:default;

transform:none;

}

.rad-button:active {

transform: translateY(1px);

}

.rad-reset-active {

border-color:#2F81F7;

background: rgba(47, 129, 247, .14);

color:#DCEBFF;

box-shadow: 0 0 0 3px rgba(47, 129, 247, .18),

0 0 18px rgba(47, 129, 247, .28);

}

.rad-reset-active:hover {

background: rgba(47, 129, 247, .22);

}


@keyframes radGlow {

0%, 100% {

box-shadow: 0 8px 20px rgba(255, 69, 0, .28);

}

50% {

box-shadow: 0 10px 24px rgba(255, 69, 0, .40);

}

}

@keyframes radDialogOpen {

from {

opacity:0;

transform: scale(.96) translateY(10px);

}

to {

opacity:1;

transform: scale(1) translateY(0);

}

}

@keyframes radBackdropFade {

from {

opacity:0;

}

to {

opacity:1;

}

}

`;


        document.head.append(style);

    }



    function openSettings() {
        injectStyles();

        const currentFormat = GM_getValue(STORAGE_KEY, DEFAULT_FORMAT);
        const originalFormat = currentFormat;
        const PREVIEW_DATE = new Date(2026, 8, 4, 21, 55, 0);

        const dialog = document.createElement("dialog");
        dialog.id = "rad-dialog";
        dialog.setAttribute("aria-labelledby",
            "rad-title"
        );

        dialog.innerHTML = ` <form method="dialog">
    <div id="rad-header">
        <h2 id="rad-title"> Absolute Dates Settings </h2>
    </div>
    <div id="rad-body">
        <div class="rad-row"> <label class="rad-label" for="rad-format"> <svg class="rad-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm12 8H5v10h14V10z" />
                </svg> Format </label> <a class="rad-guide" href="https://day.js.org/docs/en/display/format" target="_blank" rel="noopener noreferrer"> Format Guide ↗ </a> </div> <input id="rad-format" type="text" autocomplete="off" spellcheck="false" value="${currentFormat}">
        <div class="rad-preview-box">
            <div class="rad-preview-title"> <svg class="rad-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M12 5c5.5 0 9.5 5 9.5 7s-4 7-9.5 7S2.5 14 2.5 12 6.5 5 12 5zm0 2c-3.7 0-6.7 3.2-7.4 5 .7 1.8 3.7 5 7.4 5s6.7-3.2 7.4-5c-.7-1.8-3.7-5-7.4-5zm0 2.5A2.5 2.5 0 1112 17a2.5 2.5 0 010-5z" />
                </svg> Live Preview </div>
            <div id="rad-preview"></div>
        </div>
    </div>
    <div id="rad-footer"> <button type="button" id="rad-reset" class="rad-button"> <svg class="rad-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M12 5V2L7 7l5 5V9a5 5 0 110 10 5 5 0 01-4.9-4H5a7 7 0 107-7z" />
            </svg> Reset </button> <button value="cancel" class="rad-button"> Cancel </button> <button type="button" id="rad-save" class="rad-button rad-primary"> Save </button> </div>
</form> `;

        document.body.append(dialog);

        const input = dialog.querySelector("#rad-format");
        const preview = dialog.querySelector("#rad-preview");
        const saveButton = dialog.querySelector("#rad-save");
        const resetButton = dialog.querySelector("#rad-reset");

        function updatePreview() {

            const value = input.value.trim();

            preview.textContent = dayjs(PREVIEW_DATE).format(value);

            saveButton.disabled = value === originalFormat;

            const canReset = value !== DEFAULT_FORMAT;

            resetButton.disabled = !canReset;

            resetButton.classList.toggle("rad-reset-active",
                canReset);

        }

        updatePreview();

        input.addEventListener("input", updatePreview);

        input.addEventListener("keydown", event => {
            if (event.key !== "Enter") return;

            event.preventDefault();

            if (!saveButton.disabled) {
                saveButton.click();
            }
        });

        resetButton.onclick = () => {
            input.value = DEFAULT_FORMAT;
            updatePreview();
            input.focus();
        }

        ;

        saveButton.onclick = () => {

            const value = input.value.trim();

            GM_setValue(STORAGE_KEY, value);

            refreshDates();

            dialog.close();

        }

        ;

        dialog.addEventListener("close", () => {
            dialog.remove();
        });

        dialog.showModal();

        input.focus();
        input.select();
    }

    GM_registerMenuCommand('Settings…', openSettings);


    scan(document);

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {

            if (mutation.type === 'attributes') {
                convert(mutation.target);
                continue;
            }

            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;

                scan(node);

                // Future-proof: process timestamps inside open Shadow DOMs
                if (node.shadowRoot) {
                    scan(node.shadowRoot);
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['datetime']
    });

})();
