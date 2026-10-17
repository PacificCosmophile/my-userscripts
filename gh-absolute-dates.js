// ==UserScript==
// @name                 GitHub Absolute Dates
// @namespace            https://github.com/PacificCosmophile/
// @description          Changes relative dates to absolute dates on GitHub
// @version              1.5
// @author               PacificCosmophile+Vibecoded
// @license              MIT License
// @icon                 https://raw.githubusercontent.com/PacificCosmophile/my-userscripts/main/icons/gh-absolute-dates-icon-green.png
// @homepageURL          https://github.com/PacificCosmophile/my-userscripts
// @supportURL           https://github.com/PacificCosmophile/my-userscripts/issues
// @downloadURL          https://update.greasyfork.org/scripts/588662/GitHub%20Absolute%20Dates.user.js
// @updateURL            https://update.greasyfork.org/scripts/588662/GitHub%20Absolute%20Dates.meta.js
// @match                https://*.github.com/*
// @run-at               document-start
// @grant                GM_getValue
// @grant                GM_setValue
// @grant                GM_addStyle
// @grant                GM_registerMenuCommand
// @require              https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js
// ==/UserScript==

(()=> {
        /* global dayjs */
        'use strict';

        const hideStyle=document.createElement('style');

        hideStyle.textContent=`relative-time:not([data-ad-patched]) {
            visibility: hidden !important;
        }

        `;
        document.documentElement.appendChild(hideStyle);

        const formatDate=(datetime)=> dayjs(datetime).format(GM_getValue('format', 'YYYY/MM/DD HH:mm'));

        function getFormatted(el) {
            const datetime=el.getAttribute('datetime');
            if ( !datetime) return null;
            return formatDate(datetime);
        }

        function patchElement(el) {
            if (el.dataset.adPatched || el.dataset.adPatching) return;
            el.dataset.adPatching='true';

            const tryPatch=(attempts=0)=> {
                if ( !el.isConnected) return;

                if ( !el.shadowRoot) {
                    if (attempts > 300) return;
                    requestAnimationFrame(()=> tryPatch(attempts + 1));
                    return;
                }

                const formatted=getFormatted(el);

                if ( !formatted) {
                    if (attempts > 300) return;
                    requestAnimationFrame(()=> tryPatch(attempts + 1));
                    return;
                }

                const shadowObserver=new MutationObserver(()=> write());

                const write=()=> {
                    const f=getFormatted(el);
                    if ( !f) return;

                    shadowObserver.disconnect();
                    el.shadowRoot.textContent=f;
                    el.textContent=f;

                    shadowObserver.observe(el.shadowRoot, {
                        childList: true,
                        characterData: true,
                        subtree: true
                    });
            }

            ;

            write();
            el.dataset.adPatched='true';
            el._adWrite=write;
        }

        ;

        tryPatch();
    }

    function processAll(root=document) {
        root.querySelectorAll('relative-time').forEach(patchElement);
    }

    function reprocessAll() {
        document.querySelectorAll('relative-time').forEach((el)=> {
                if (el._adWrite) el._adWrite();
            });
    }

    function watchForNewElements() {
        const bodyObserver=new MutationObserver((mutations)=> {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !==Node.ELEMENT_NODE) continue;
                        if (node.matches?.('relative-time')) patchElement(node);
                        node.querySelectorAll?.('relative-time').forEach(patchElement);
                    }
                }
            });

        bodyObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
}

function addInitialStyle() {
    GM_addStyle(` [aria-labelledby="files"] [style="width:100px;"] {
            width: unset !important;
        }

        [aria-labelledby="folders-and-files"] thead th:last-of-type {
            width: 160px;
        }

        [aria-labelledby$="files"] relative-time {
            font-variant-numeric: var(--absolute-date-aligned);
        }

        relative-time::before {
            content: var(--absolute-date-preposition);
        }

        [aria-labelledby$="files"] relative-time::before {
            content: unset
        }

        `);
}



function setDatesAligned() {
    if (GM_getValue('aligned', true)) {
        document.documentElement.style.setProperty('--absolute-date-aligned',
            'tabular-nums'
        );
    }

    else {
        document.documentElement.style.removeProperty('--absolute-date-aligned');
    }
}

function setPreposition() {

    const preposition=GM_getValue('preposition', 'at');

    if (preposition) {

        document.documentElement.style.setProperty('--absolute-date-preposition',
            `"${preposition} " `);

    }

    else {

        document.documentElement.style.removeProperty('--absolute-date-preposition');

    }

}



function openSettings() {

    if (document.getElementById('ad-settings-overlay')) return;

    const overlay=document.createElement('div');

    overlay.id='ad-settings-overlay';

    overlay.innerHTML=` <div id="ad-settings-dialog" > <div class="ad-header" > <span> <span class="ad-prompt" >❯</span> Absolute Date Settings<span class="ad-cursor" >_</span> </span> <button id="ad-close-btn" >✕</button> </div> <div class="ad-body" > <div class="ad-field" > <label>Word before dates</label> <input id="ad-preposition"
    type="text"
    value="${GM_getValue('preposition','at')}" > </div> <div class="ad-field" > <label>Date format</label> <input id="ad-format"
    type="text"
    value="${GM_getValue('format','YYYY/MM/DD HH:mm')}" > <div id="ad-preview" ></div> <a id="ad-format-help"
    href="https://day.js.org/docs/en/display/format"
    target="_blank" > Day.js format reference </a> </div> <div class="ad-field ad-checkbox" > <input id="ad-aligned"
    type="checkbox"

    $ {
        GM_getValue('aligned', true) ? 'checked' : ''
    }

    > <label for="ad-aligned" > Align dates in repository file lists </label> </div> <div class="ad-footer" > <button id="ad-cancel" > Cancel </button> <button id="ad-save" disabled> Save </button> </div> </div> </div> `;

    document.body.appendChild(overlay);

    const closeDialog=()=> {

        document.removeEventListener('keydown', keyHandler);

        const dialog=overlay.querySelector('#ad-settings-dialog');

        dialog.style.animation='ad-dialog-out .18s cubic-bezier(.4,0,.2,1) forwards';

        overlay.style.transition='opacity .18s ease';

        overlay.style.opacity='0';

        setTimeout(()=> overlay.remove(), 180);

    }

    ;

    const keyHandler=(e)=> {

        if (e.key==='Escape') {

            e.preventDefault();

            closeDialog();

            return;

        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='s') {

            e.preventDefault();

            if ( !saveButton.disabled) {

                saveButton.click();

            }

        }

    }

    ;

    document.addEventListener('keydown', keyHandler);

    overlay.querySelector('#ad-close-btn').onclick=closeDialog;
    overlay.querySelector('#ad-cancel').onclick=closeDialog;

    const formatInput=overlay.querySelector('#ad-format');
    const prepositionInput=overlay.querySelector('#ad-preposition');
    const alignedInput=overlay.querySelector('#ad-aligned');
    const saveButton=overlay.querySelector('#ad-save');

    const initial= {
        preposition: prepositionInput.value,
        format: formatInput.value,
        aligned: alignedInput.checked
    }

    ;
    const preview=overlay.querySelector('#ad-preview');

    const updatePreview = () => {

    try {

        const prefix = prepositionInput.value.trim();
        const formatted = dayjs().format(formatInput.value);

        preview.innerHTML =
            '<span style="color:#8B949E">Example:</span> ' +
            (prefix
                ? `<span style="color:#E6EDF3">${prefix}</span> `
                : '') +
            `<span style="color:#7EE787">${formatted}</span>`;

    }

    catch {

        preview.innerHTML =
            '<span style="color:#8B949E">Example:</span> ' +
            '<span style="color:#F85149">Invalid format</span>';

    }

};

    const updateSaveState=()=> {

        const changed=prepositionInput.value !==initial.preposition || formatInput.value !==initial.format || alignedInput.checked !==initial.aligned;

        saveButton.disabled= !changed;

        saveButton.classList.toggle('ad-save-active', changed);

    }

    ;

    formatInput.addEventListener('input', ()=> {
            updatePreview();
            updateSaveState();
        });

    prepositionInput.addEventListener('input', ()=> {

            updatePreview();
            updateSaveState();

        });

    alignedInput.addEventListener('change', updateSaveState);

    updatePreview();
    updateSaveState();

    formatInput.focus();
    formatInput.select();

    overlay.querySelector('#ad-save').onclick=()=> {

        GM_setValue('preposition',
            overlay.querySelector('#ad-preposition').value);

        GM_setValue('format',
            overlay.querySelector('#ad-format').value);

        GM_setValue('aligned',
            overlay.querySelector('#ad-aligned').checked);

        closeDialog();

        setDatesAligned();
        setPreposition();
        reprocessAll();

    }

    ;



    ;

    ;

}

function addSettingsStyle() {

    GM_addStyle(` #ad-settings-overlay {

            position:fixed;
            inset:0;

            display:flex;
            align-items:center;
            justify-content:center;

            background:rgba(0, 0, 0, .45);

            backdrop-filter:blur(8px);
            -webkit-backdrop-filter:blur(8px);

            z-index:999999;

        }

        #ad-settings-dialog {

            width: 520px;
            max-width: calc(100vw - 32px);

            background: linear-gradient(180deg,
                rgba(33, 38, 45, .82) 0%,
                rgba(22, 27, 34, .88) 100%);

            backdrop-filter: blur(28px) saturate(170%);
            -webkit-backdrop-filter: blur(28px) saturate(170%);

            border: 1px solid rgba(255, 255, 255, .10);
            border-radius: 16px;

            overflow: hidden;
            min-height: 250px;

            box-shadow: 0 24px 80px rgba(0, 0, 0, .55),
            0 0 0 1px rgba(255, 255, 255, .03) inset,
            0 8px 24px rgba(15, 191, 62, .08);

            color: #e6edf3;
            font-family: ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            "Liberation Mono",
            monospace;

            animation: ad-dialog-in .22s cubic-bezier(.2, .9, .2, 1);
        }

        .ad-header {

            display:flex;
            align-items:center;
            justify-content:space-between;

            padding:14px 18px;

            background: linear-gradient(rgba(15, 191, 62, .08), rgba(15, 191, 62, 0)),
            linear-gradient(rgba(255, 255, 255, .04), rgba(255, 255, 255, .015));

            border-bottom:1px solid rgba(255, 255, 255, .06);

            position:relative;

        }

        .ad-header::after {

            content:"";

            position:absolute;

            left:18px;
            right:18px;
            bottom:-1px;

            height:2px;

            border-radius:2px;

            background: linear-gradient(90deg,
                #0FBF3E 0%,
                #0FBF3E 75%,
                rgba(15, 191, 62, 0) 100%);

            opacity:.9;

        }

        .ad-header span {

            font-size:20px;

            font-weight:600;

            font-style:italic;

            display:flex;
            align-items:center;

            letter-spacing:.4px;

            line-height:1.2;

            color:#0FBF3E;

            text-shadow: 0 0 8px rgba(15, 191, 62, .18);

            -webkit-font-smoothing:antialiased;
            -moz-osx-font-smoothing:grayscale;

        }

        .ad-prompt {

            display:inline-block;

            font-size:28px;

            font-weight:900;

            line-height:1;

            color:#0FBF3E;

            margin-right:6px;

            transform:translateY(2px);

            text-shadow: 0 0 4px rgba(15, 191, 62, .75),
            0 0 10px rgba(15, 191, 62, .60),
            0 0 18px rgba(15, 191, 62, .40);

        }

        .ad-cursor {

            display:inline-block;

            margin-left:2px;

            color:#0FBF3E;

            font-weight:700;

            animation:ad-cursor-blink 1s steps(1) infinite;

        }

        @keyframes ad-cursor-blink {

            0%, 49% {

                opacity:1;

            }

            50%, 100% {

                opacity:0;

            }

        }

        .ad-body {

            padding:16px 18px;

            display:flex;
            flex-direction:column;
            gap:10px;

        }

        #ad-close-btn {

            width:36px;
            height:36px;

            border:none;
            border-radius:8px;

            background:transparent;

            color:#8b949e;

            font-size:18px;

            cursor:pointer;

            transition:.18s;
        }

        #ad-close-btn:hover {

            background:rgba(133, 52, 243, .14);

            color:#8534F3;

            box-shadow: 0 0 10px rgba(133, 52, 243, .18);

        }

        .ad-field {

            display:flex;
            flex-direction:column;
            gap:5px;

            margin-bottom:8px;

        }

        .ad-field label {

            font-size:15px;
            font-weight:500;

            color:#c9d1d9;

        }

        .ad-field input[type=text] {

            background:#161b22;

            border:1px solid #30363d;

            border-radius:10px;

            padding:11px 14px;

            font-size:16px;

            color:#e6edf3;

            outline:none;

            font-family: ui-monospace,
            SFMono-Regular,
            Consolas,
            "Liberation Mono",
            Menlo,
            monospace;

        }

        #ad-preposition {

            font-family: system-ui,
            sans-serif;

        }

        .ad-field input[type=text]:focus {

            border-color:#0FBF3E;

            box-shadow:0 0 0 3px rgba(15, 191, 62, .18);

        }

        .ad-checkbox {

            flex-direction:row;
            align-items:center;

        }

        .ad-footer {

            display:flex;

            justify-content:flex-end;

            gap:10px;

            margin-top:16px;

        }

        .ad-footer button {

            padding:11px 20px;

            border-radius:10px;
            min-width:92px;

            border:1px solid #30363d;

            background:#21262d;

            color:#e6edf3;

            cursor:pointer;

            font-size:15px;

        }

        #ad-cancel {

            transition: background .18s ease,
            border-color .18s ease,
            color .18s ease,
            box-shadow .18s ease,
            transform .12s ease;

        }

        #ad-cancel:hover {

            background:#8534F3;

            border-color:#8534F3;

            color:#ffffff;

            transform:translateY(-1px);

            box-shadow: 0 0 14px rgba(133, 52, 243, .28);

        }

        #ad-cancel:active {

            transform:translateY(0);

            box-shadow: 0 0 8px rgba(133, 52, 243, .16);

        }

        #ad-save {

            background:#21262d;

            border:1px solid #30363d;

            color:#8b949e;

            font-weight:600;

            transition: background .18s ease,
            border-color .18s ease,
            color .18s ease,
            box-shadow .18s ease,
            transform .12s ease;

        }

        #ad-save.ad-save-active {

            background:#0FBF3E;

            border-color:#0FBF3E;

            color:#ffffff;

            box-shadow:0 0 12px rgba(15, 191, 62, .18);

        }

        #ad-save.ad-save-active:hover {

            transform:translateY(-1px);

            box-shadow: 0 0 16px rgba(15, 191, 62, .28);

        }

        #ad-save.ad-save-active:active {

            transform:translateY(0);

            box-shadow: 0 0 8px rgba(15, 191, 62, .16);

        }

        #ad-save:disabled {

            cursor:default;

        }

        @keyframes ad-dialog-in {

            from {

                opacity:0;
                transform:translateY(10px) scale(.98);

            }

            to {

                opacity:1;
                transform:none;

            }

        }

        @keyframes ad-dialog-out {

            from {

                opacity:1;
                transform:none;

            }

            to {

                opacity:0;
                transform:translateY(8px) scale(.98);

            }

        }

        #ad-preview {

            margin-top:10px;

            padding:11px 14px;

            border-radius:8px;

            background:#161b22;

            border:1px solid #30363d;

            font-size:15px;

            font-family: ui-monospace,
            SFMono-Regular,
            Consolas,
            monospace;



            user-select:text;

        }

        #ad-format-help {

            display:inline-flex;

            align-self:flex-start;

            margin-top:8px;

            padding:2px 0;

            font-size:13px;

            color:#6e7681;

            text-decoration:none;

            width:fit-content;

        }

        #ad-format-help:hover {

            color:#7ee787;

        }

        `);

}

function init() {
    GM_registerMenuCommand('Settings...', openSettings);

    addInitialStyle();
    addSettingsStyle();

    setDatesAligned();
    setPreposition();

    watchForNewElements();
    processAll();

    document.addEventListener('turbo:render', ()=> {
            setDatesAligned();
            setPreposition();
            reprocessAll();
        });
}

init();
})();
