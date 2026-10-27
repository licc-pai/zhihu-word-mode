// ==UserScript==
// @name         知乎 Word 文档模式
// @namespace    https://github.com/licc-pai/zhihu-word-mode
// @version      0.3.4
// @author       licc-pai
// @license      MIT
// @description  将知乎专栏、问题和回答转换为 Word 365 风格的文档阅读界面
// @homepageURL  https://github.com/licc-pai/zhihu-word-mode
// @supportURL   https://github.com/licc-pai/zhihu-word-mode/issues
// @updateURL    https://raw.githubusercontent.com/licc-pai/zhihu-word-mode/main/zhihu-word-mode.user.js
// @downloadURL  https://raw.githubusercontent.com/licc-pai/zhihu-word-mode/main/zhihu-word-mode.user.js
// @match        https://zhihu.com/*
// @match        https://www.zhihu.com/*
// @match        https://zhuanlan.zhihu.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const ID = 'zhihu-word-mode';
    const STYLE_ID = `${ID}-style`;
    const STORE_KEY = `${ID}:settings`;
    const DEFAULTS = { fontSize: 16, lineHeight: 1.9, pageWidth: 800, theme: 'light', zoom: 100, docName: '文档1.docx', includeComments: true };
    let settings = loadSettings();
    let overlay = null;
    let launcher = null;
    let isOpen = false;
    let lastRoute = location.href;
    let routeTimer = null;
    let currentSource = null;
    const commentCache = new Map();
    let commentToken = 0;

    function loadSettings() {
        try {
            return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
        } catch {
            return { ...DEFAULTS };
        }
    }

    function saveSettings() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch {}
    }

    const WORD_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
        '<rect x="1" y="1" width="22" height="22" rx="3" fill="#185abd"/>' +
        '<path d="M5.6 6.8h2.5l1.5 7.1 1.7-7.1h2.3l1.6 7.1 1.5-7.1h2.4l-2.5 10.4h-2.5l-1.5-6.6-1.5 6.6H8.1z" fill="#fff"/></svg>'
    );
    let originalTitle = null;
    let originalIcons = null;
    let injectedIcon = null;

    function getDocName() {
        return (settings.docName || '').trim() || '文档1.docx';
    }

    function applyPageIdentity(docName) {
        if (originalTitle === null) originalTitle = document.title;
        document.title = `${docName} - Word`;
        const icons = [...document.querySelectorAll('link[rel~="icon"]')];
        if (originalIcons === null) {
            originalIcons = icons.map(icon => ({ el: icon, href: icon.getAttribute('href') }));
        }
        if (icons.length) {
            icons.forEach(icon => icon.setAttribute('href', WORD_FAVICON));
            return;
        }
        if (!injectedIcon) {
            injectedIcon = document.createElement('link');
            injectedIcon.rel = 'icon';
            document.head.appendChild(injectedIcon);
        }
        injectedIcon.setAttribute('href', WORD_FAVICON);
    }

    function restorePageIdentity() {
        if (originalTitle !== null) {
            document.title = originalTitle;
            originalTitle = null;
        }
        if (originalIcons) {
            originalIcons.forEach(({ el, href }) => {
                if (href === null) el.removeAttribute('href');
                else el.setAttribute('href', href);
            });
            originalIcons = null;
        }
        if (injectedIcon) {
            injectedIcon.remove();
            injectedIcon = null;
        }
    }

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${ID}-launcher{position:fixed;right:22px;bottom:22px;z-index:2147483646;border:1px solid #2b579a;border-radius:6px;padding:9px 14px;color:#fff;background:#2b579a;box-shadow:0 3px 12px #0003;font:13px/1.2 "Segoe UI","Microsoft YaHei",sans-serif;cursor:pointer}
            #${ID}-launcher:hover{background:#244c88}

            #${ID}-overlay{
                --zwm-chrome:#f2f5ee;--zwm-line:#dfe5da;--zwm-ribbon:#fff;--zwm-page-bg:#e6e9e2;
                --zwm-page:#fff;--zwm-ink:#222;--zwm-muted:#666;--zwm-field:#fff;--zwm-field-line:#c9d0c7;
                --zwm-hover:#e7ecdf;--zwm-icon:#3d5f7f;--zwm-page-width:800px;--zwm-font-size:16px;--zwm-line-height:1.9;
                position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;
                background:var(--zwm-chrome);color:var(--zwm-ink);
                font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif;font-size:12px;
            }
            #${ID}-overlay.${ID}-visible{display:flex}
            #${ID}-overlay *{box-sizing:border-box}
            #${ID}-overlay button{border:0;background:none;padding:0;color:inherit;font-family:inherit;cursor:default}
            #${ID}-overlay input,#${ID}-overlay select{font-family:inherit}

            /* ---------- 标题栏 ---------- */
            #${ID}-overlay .zwm-titlebar{flex:0 0 32px;height:32px;display:grid;grid-template-columns:1fr 300px 1fr;align-items:center;gap:8px;padding:0 10px;font-size:11px;color:var(--zwm-ink)}
            #${ID}-overlay .zwm-tb-left{display:flex;align-items:center;gap:8px;min-width:0}
            #${ID}-overlay .zwm-wordlogo{width:20px;height:20px;flex:0 0 auto;display:block}
            #${ID}-overlay .zwm-autosave{display:flex;align-items:center;gap:5px;color:var(--zwm-muted);white-space:nowrap;font-size:11px}
            #${ID}-overlay .zwm-switch{width:26px;height:14px;border-radius:8px;background:#aeb5ac;position:relative;flex:0 0 auto;cursor:pointer;transition:background .15s}
            #${ID}-overlay .zwm-switch:after{content:"";position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#fff;transition:left .15s}
            #${ID}-overlay .zwm-switch.zwm-on{background:#3f7f6c}
            #${ID}-overlay .zwm-switch.zwm-on:after{left:14px}
            #${ID}-overlay .zwm-qat{display:flex;align-items:center;gap:1px;color:var(--zwm-icon)}
            #${ID}-overlay .zwm-qbtn{width:20px;height:20px;display:grid;place-items:center;border:1px solid transparent;border-radius:3px;background:none;cursor:default;color:var(--zwm-icon)}
            #${ID}-overlay .zwm-qbtn:hover{background:var(--zwm-hover);border-color:var(--zwm-line)}
            #${ID}-overlay .zwm-docname{margin-left:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--zwm-ink);font-size:11px}
            #${ID}-overlay .zwm-caret{font-size:7px;color:var(--zwm-muted);margin-left:4px}
            #${ID}-overlay .zwm-search{width:100%;height:22px;display:flex;align-items:center;gap:6px;padding:0 8px;background:var(--zwm-field);border:1px solid var(--zwm-field-line);border-radius:3px;color:var(--zwm-muted)}
            #${ID}-overlay .zwm-search svg{flex:0 0 auto;color:var(--zwm-muted)}
            #${ID}-overlay .zwm-search input{border:0;outline:0;background:none;font:11px "Segoe UI","Microsoft YaHei",sans-serif;color:var(--zwm-ink);width:100%}
            #${ID}-overlay .zwm-search input::placeholder{color:#8a908a}
            #${ID}-overlay .zwm-tb-right{display:flex;align-items:center;justify-content:flex-end;gap:12px;color:var(--zwm-ink)}
            #${ID}-overlay .zwm-signin{height:22px;padding:0 11px;border:0;border-radius:3px;background:#222;color:#fff;font:11px "Segoe UI","Microsoft YaHei",sans-serif;display:flex;align-items:center}
            #${ID}-overlay .zwm-winctl{display:flex;align-items:center;gap:15px;color:var(--zwm-ink);font-size:13px;line-height:1}
            #${ID}-overlay .zwm-winctl span{width:11px;text-align:center;cursor:default}
            #${ID}-overlay .zwm-winctl .zwm-close:hover{color:#c42b1c}

            /* ---------- 选项卡 ---------- */
            #${ID}-overlay .zwm-tabrow{flex:0 0 32px;height:32px;display:flex;align-items:stretch;background:var(--zwm-chrome);padding-left:8px;overflow:hidden}
            #${ID}-overlay .zwm-tab{display:flex;align-items:center;padding:0 12px;font-size:12px;color:var(--zwm-ink);white-space:nowrap;cursor:default;position:relative}
            #${ID}-overlay .zwm-tab:hover{background:var(--zwm-hover)}
            #${ID}-overlay .zwm-tab.zwm-active{font-weight:700;color:var(--zwm-ink)}
            #${ID}-overlay .zwm-tab.zwm-active:after{content:"";position:absolute;left:8px;right:8px;bottom:0;height:2px;background:#3f7f6c}
            #${ID}-overlay .zwm-tabactions{margin-left:auto;display:flex;align-items:center;gap:5px;padding:0 6px 0 12px}
            #${ID}-overlay .zwm-tabaction{display:flex;align-items:center;gap:4px;height:23px;padding:0 9px;border:1px solid var(--zwm-field-line);border-radius:3px;background:var(--zwm-field);font:11px "Segoe UI","Microsoft YaHei",sans-serif;color:var(--zwm-ink);cursor:default;white-space:nowrap}
            #${ID}-overlay .zwm-tabaction:hover{background:var(--zwm-ribbon)}
            #${ID}-overlay .zwm-tabaction.zwm-primary{background:#2b579a;border-color:#2b579a;color:#fff}
            #${ID}-overlay .zwm-tabaction .zwm-caret{font-size:7px;color:inherit;margin-left:1px}

            /* ---------- 功能区 ---------- */
            #${ID}-overlay .zwm-ribbon{flex:0 0 66px;height:66px;background:var(--zwm-ribbon);border-bottom:1px solid var(--zwm-line);display:flex;align-items:stretch;padding:1px 4px 0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
            #${ID}-overlay .zwm-ribbon::-webkit-scrollbar{display:none}
            #${ID}-overlay .zwm-rgroup{position:relative;display:flex;flex-direction:column;justify-content:space-between;padding:0 9px;flex:0 0 auto;min-width:0}
            #${ID}-overlay .zwm-rgroup:not(:last-of-type){border-right:1px solid var(--zwm-line)}
            #${ID}-overlay .zwm-ritems{flex:1;display:flex;align-items:center;gap:2px}
            #${ID}-overlay .zwm-rlabel{font-size:10px;color:var(--zwm-muted);text-align:center;padding:0 0 2px;white-space:nowrap}
            #${ID}-overlay .zwm-mini{width:21px;height:20px;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:2px;background:none;color:var(--zwm-ink);cursor:default;font:11px/1 "Segoe UI","Microsoft YaHei",sans-serif;padding:0}
            #${ID}-overlay .zwm-mini:hover{background:var(--zwm-hover);border-color:var(--zwm-line)}
            #${ID}-overlay .zwm-mini.zwm-active{background:#e8f0ec;border-color:#bcd0c7}
            #${ID}-overlay .zwm-mini svg{display:block}
            #${ID}-overlay .zwm-box{height:20px;display:flex;align-items:center;gap:3px;padding:0 4px;background:var(--zwm-field);border:1px solid var(--zwm-field-line);border-radius:2px;font-size:10.5px;color:var(--zwm-ink);white-space:nowrap}
            #${ID}-overlay .zwm-box .zwm-caret{margin-left:auto}
            #${ID}-overlay .zwm-rstack{display:flex;flex-direction:column;gap:2px}
            #${ID}-overlay .zwm-rrow{display:flex;align-items:center;gap:2px}
            #${ID}-overlay .zwm-launcher{position:absolute;right:3px;bottom:12px;color:var(--zwm-muted);font-size:8px;line-height:1;border:1px solid var(--zwm-line);border-radius:1px;width:10px;height:10px;display:grid;place-items:center;background:var(--zwm-ribbon);cursor:default}
            #${ID}-overlay .zwm-rbtn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:24px;padding:1px 2px;border:1px solid transparent;border-radius:3px;background:none;color:var(--zwm-ink);font:10px/1.1 "Segoe UI","Microsoft YaHei",sans-serif;cursor:default}
            #${ID}-overlay .zwm-rbtn:hover{background:var(--zwm-hover);border-color:var(--zwm-line)}
            #${ID}-overlay .zwm-rbtn svg{display:block}
            #${ID}-overlay .zwm-rbtn small{font-size:9.5px;color:var(--zwm-muted);white-space:nowrap}
            #${ID}-overlay .zwm-clipstack{display:flex;flex-direction:column;gap:1px}
            #${ID}-overlay .zwm-stylegal{display:flex;align-items:center;gap:0;height:42px}
            #${ID}-overlay .zwm-style{height:40px;display:flex;align-items:center;justify-content:center;padding:0 10px;color:var(--zwm-ink);font-size:11px;white-space:nowrap;border:1px solid transparent}
            #${ID}-overlay .zwm-style.zwm-sel{border-color:#b7c9c0;background:var(--zwm-ribbon)}
            #${ID}-overlay .zwm-style.zwm-big{font-size:16px;font-weight:700;padding:0 7px}
            #${ID}-overlay .zwm-stylearrow{width:14px;height:40px;display:grid;place-items:center;color:var(--zwm-muted);font-size:8px;border-left:1px solid var(--zwm-line)}
            #${ID}-overlay .zwm-editlist{display:flex;flex-direction:column;gap:1px}
            #${ID}-overlay .zwm-editrow{display:flex;align-items:center;gap:4px;height:14px;padding:0 3px;border:1px solid transparent;border-radius:2px;background:none;color:var(--zwm-ink);font:10.5px/1 "Segoe UI","Microsoft YaHei",sans-serif;cursor:default;white-space:nowrap}
            #${ID}-overlay .zwm-editrow:hover{background:var(--zwm-hover);border-color:var(--zwm-line)}
            #${ID}-overlay .zwm-editrow .zwm-caret{font-size:6px;color:var(--zwm-muted);margin-left:auto}
            #${ID}-overlay .zwm-collapse{margin-left:auto;width:16px;flex:0 0 16px;display:grid;place-items:center;border:0;background:none;color:var(--zwm-muted);font-size:10px;cursor:default}

            /* ---------- 文档 ---------- */
            #${ID}-overlay .zwm-docscroll{flex:1;overflow:auto;background:var(--zwm-page-bg);padding:18px 16px 60px}
            #${ID}-overlay .zwm-page{width:min(var(--zwm-page-width),100%);min-height:1080px;margin:0 auto;background:var(--zwm-page);box-shadow:0 1px 3px rgba(0,0,0,.16),0 0 0 1px rgba(0,0,0,.035);padding:70px 80px 90px;font-family:"等线","DengXian","Microsoft YaHei",sans-serif;font-size:var(--zwm-font-size);line-height:var(--zwm-line-height);color:var(--zwm-ink);overflow-wrap:anywhere}
            #${ID}-overlay .zwm-document-title{margin:0 0 14px;font-size:27px;line-height:1.45;font-weight:700;color:var(--zwm-ink);font-family:"等线","DengXian","Microsoft YaHei",sans-serif}
            #${ID}-overlay .zwm-document-meta{margin:0 0 27px;padding-bottom:14px;border-bottom:1px solid var(--zwm-line);font-size:11px;line-height:1.65;color:var(--zwm-muted)}
            #${ID}-overlay .zwm-article-content p{margin:0 0 .95em;text-align:justify}
            #${ID}-overlay .zwm-article-content h1,#${ID}-overlay .zwm-article-content h2,#${ID}-overlay .zwm-article-content h3,#${ID}-overlay .zwm-article-content h4{margin:1.4em 0 .65em;color:var(--zwm-ink);line-height:1.45;font-weight:650}
            #${ID}-overlay .zwm-article-content h1{font-size:1.65em}
            #${ID}-overlay .zwm-article-content h2{font-size:1.4em}
            #${ID}-overlay .zwm-article-content h3{font-size:1.18em}
            #${ID}-overlay .zwm-article-content img,#${ID}-overlay .zwm-article-content video{max-width:100%;height:auto}
            #${ID}-overlay .zwm-article-content img{display:block;margin:1.2em auto;object-fit:contain}
            #${ID}-overlay .zwm-article-content blockquote{margin:1.2em 0;padding:8px 18px;border-left:3px solid #b9cbe4;color:#555;background:#f8f9fb}
            #${ID}-overlay .zwm-article-content pre{padding:14px;overflow:auto;border-radius:4px;background:#f5f5f5;border:1px solid #e4e4e4;font:.86em/1.6 Consolas,"Courier New",monospace}
            #${ID}-overlay .zwm-article-content code{font-family:Consolas,"Courier New",monospace;overflow-wrap:anywhere}
            #${ID}-overlay .zwm-article-content table{width:100%;border-collapse:collapse;margin:1em 0;font-size:.92em}
            #${ID}-overlay .zwm-article-content th,#${ID}-overlay .zwm-article-content td{padding:7px 9px;border:1px solid #d9d9d9;text-align:left}
            #${ID}-overlay .zwm-article-content th{background:#f3f3f3}
            #${ID}-overlay .zwm-article-content a{color:#0563c1}

            /* ---------- 文末评论 ---------- */
            #${ID}-overlay .zwm-comments{margin-top:44px;padding-top:22px;border-top:1px solid var(--zwm-line);font-size:.94em;line-height:1.75}
            #${ID}-overlay .zwm-comments h2{margin:0 0 16px;font-size:1.15em!important;font-weight:650;color:var(--zwm-ink)}
            #${ID}-overlay .zwm-comments .zwm-comment{margin:0 0 16px;padding:0 0 12px;border-bottom:1px solid var(--zwm-line)}
            #${ID}-overlay .zwm-comments .zwm-comment:last-child{border-bottom:0}
            #${ID}-overlay .zwm-comments *{font-family:inherit!important;font-size:inherit!important;line-height:inherit!important;color:inherit!important;background:transparent!important}
            #${ID}-overlay .zwm-comments a{color:#0563c1!important}
            #${ID}-overlay .zwm-comments a[href*="/people/"]{font-weight:600}
            #${ID}-overlay .zwm-comments p{margin:0 0 .4em}
            #${ID}-overlay .zwm-comments img,#${ID}-overlay .zwm-comments svg,#${ID}-overlay .zwm-comments button,#${ID}-overlay .zwm-comments input,#${ID}-overlay .zwm-comments textarea{display:none!important}
            #${ID}-overlay .zwm-comment-note{color:var(--zwm-muted)!important;font-size:.92em!important}
            #${ID}-overlay .zwm-comment-head{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;font-size:.92em!important}
            #${ID}-overlay .zwm-comment-author{font-weight:600;color:var(--zwm-ink)!important}
            #${ID}-overlay .zwm-comment-meta{color:var(--zwm-muted)!important;font-size:.88em!important}
            #${ID}-overlay .zwm-comment-body{font-size:.96em!important}
            #${ID}-overlay .zwm-comment-body p{margin:0 0 .4em}
            #${ID}-overlay .zwm-comment-body a{color:#0563c1!important}
            #${ID}-overlay .zwm-comment-child{margin:8px 0 0 16px;padding:6px 0 0 10px;border-left:2px solid var(--zwm-line);border-bottom:0}
            #${ID}-overlay .zwm-comment-child .zwm-comment-head{font-size:.9em!important}
            #${ID}-overlay .zwm-load-more{display:inline-block!important;margin-top:6px;color:#2b579a!important;cursor:pointer;font-size:.92em!important}

            /* ---------- 状态栏 ---------- */
            #${ID}-overlay .zwm-statusbar{flex:0 0 24px;height:24px;display:flex;align-items:center;gap:15px;padding:0 11px;background:var(--zwm-chrome);border-top:1px solid var(--zwm-line);font-size:10px;color:var(--zwm-muted)}
            #${ID}-overlay .zwm-statusbar .zwm-right{margin-left:auto;display:flex;align-items:center;gap:13px}
            #${ID}-overlay .zwm-viewbtns{display:flex;align-items:center;gap:7px;color:var(--zwm-muted)}
            #${ID}-overlay .zwm-viewbtns .zwm-on{color:var(--zwm-ink)}
            #${ID}-overlay .zwm-zoom{display:flex;align-items:center;gap:6px}
            #${ID}-overlay .zwm-zoom input{width:80px;accent-color:#5e7f72}
            #${ID}-overlay .zwm-zoom .zwm-pct{width:32px;text-align:right;font-variant-numeric:tabular-nums}

            /* ---------- 设置对话框 ---------- */
            #${ID}-overlay .zwm-settings{position:absolute;inset:0;z-index:5;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.35)}
            #${ID}-overlay .zwm-settings.zwm-settings-open{display:flex}
            #${ID}-overlay .zwm-settings-card{width:min(430px,100%);padding:20px 22px;border-radius:6px;background:var(--zwm-page);box-shadow:0 18px 50px rgba(0,0,0,.3);color:var(--zwm-ink);font:13px/1.5 "Segoe UI","Microsoft YaHei",sans-serif}
            #${ID}-overlay .zwm-settings-card h2{margin:0 0 16px;font-size:17px;font-weight:600}
            #${ID}-overlay .zwm-setting{display:grid;grid-template-columns:88px 1fr 56px;gap:10px;align-items:center;margin:12px 0}
            #${ID}-overlay .zwm-setting input[type=range]{width:100%}
            #${ID}-overlay .zwm-setting select{height:26px;border:1px solid var(--zwm-field-line);border-radius:3px;background:var(--zwm-field);color:var(--zwm-ink);padding:0 6px;font-size:12px}
            #${ID}-overlay .zwm-setting input[type=text]{grid-column:2 / span 2;height:26px;width:100%;padding:0 7px;border:1px solid var(--zwm-field-line);border-radius:3px;background:var(--zwm-field);color:var(--zwm-ink);font-size:12px}
            #${ID}-overlay .zwm-setting input[type=checkbox]{width:16px;height:16px;justify-self:start;accent-color:#2b579a}
            #${ID}-overlay .zwm-setting output{text-align:right;color:var(--zwm-muted);font-size:12px}
            #${ID}-overlay .zwm-settings-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
            #${ID}-overlay .zwm-settings-actions button{height:28px;padding:0 13px;border:1px solid var(--zwm-field-line);border-radius:4px;background:var(--zwm-field);color:var(--zwm-ink);font-size:12px}
            #${ID}-overlay .zwm-settings-actions button.zwm-primary{background:#2b579a;border-color:#2b579a;color:#fff}
            #${ID}-overlay .zwm-signature{margin-top:14px;text-align:center;color:var(--zwm-muted);font:600 12px/1 Georgia,"Times New Roman",serif;letter-spacing:.28em;opacity:.75}

            /* ---------- 深色 ---------- */
            #${ID}-overlay.zwm-dark{--zwm-chrome:#2b2b2b;--zwm-line:#3d3d3d;--zwm-ribbon:#2f2f2f;--zwm-page-bg:#1e1e1e;--zwm-page:#262626;--zwm-ink:#e4e4e4;--zwm-muted:#9a9a9a;--zwm-field:#333;--zwm-field-line:#4a4a4a;--zwm-hover:#3a3a3a}
            #${ID}-overlay.zwm-dark .zwm-article-content blockquote{background:#2f2f2f;color:#cfcfcf;border-left-color:#4f6a83}
            #${ID}-overlay.zwm-dark .zwm-article-content pre{background:#2f2f2f;border-color:#444}
            #${ID}-overlay.zwm-dark .zwm-article-content th{background:#2f2f2f}
            #${ID}-overlay.zwm-dark .zwm-article-content th,#${ID}-overlay.zwm-dark .zwm-article-content td{border-color:#444}
            #${ID}-overlay.zwm-dark .zwm-article-content a{color:#6fa8dc}

            /* ---------- 打印 ---------- */
            @media print{
                body>*:not(#${ID}-overlay){display:none!important}
                #${ID}-launcher,#${ID}-overlay .zwm-titlebar,#${ID}-overlay .zwm-tabrow,#${ID}-overlay .zwm-ribbon,#${ID}-overlay .zwm-statusbar,#${ID}-overlay .zwm-settings{display:none!important}
                #${ID}-overlay{position:static;display:block!important;overflow:visible;background:#fff}
                #${ID}-overlay .zwm-docscroll{padding:0;background:#fff;overflow:visible}
                #${ID}-overlay .zwm-page{width:auto;min-height:0;padding:0;box-shadow:none;zoom:1!important}
            }

            /* ---------- 窄屏 ---------- */
            @media(max-width:760px){
                #${ID}-overlay .zwm-search,#${ID}-overlay .zwm-docname,#${ID}-overlay .zwm-tabactions{display:none}
                #${ID}-overlay .zwm-page{padding:30px 22px}
                #${ID}-overlay .zwm-docscroll{padding:10px 6px 40px}
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function isRelevantPage() {
        return /^https:\/\/(www\.zhihu\.com|zhihu\.com|zhuanlan\.zhihu\.com)\//.test(location.href);
    }

    function addLauncher() {
        if (!document.body || document.getElementById(`${ID}-launcher`)) return;
        launcher = document.createElement('button');
        launcher.id = `${ID}-launcher`;
        launcher.type = 'button';
        launcher.textContent = '文档模式';
        launcher.title = '切换知乎 Word 文档模式(Alt + W)';
        launcher.addEventListener('click', toggleMode);
        document.body.appendChild(launcher);
    }

    function visible(node) {
        return node instanceof HTMLElement && node.getClientRects().length > 0 &&
            getComputedStyle(node).visibility !== 'hidden' &&
            getComputedStyle(node).display !== 'none';
    }

    function textLength(node) {
        return (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim().length;
    }

    function scoreCandidate(node) {
        const text = textLength(node);
        if (text < 80 || !visible(node)) return -1;
        const rect = node.getBoundingClientRect();
        let score = Math.min(text, 12000) + Math.min(rect.width, 1200) * 0.2;
        const cls = `${node.className || ''} ${node.getAttribute('data-testid') || ''}`;
        if (/RichText|Post-RichText|ContentItem|AnswerItem|ArticleItem/i.test(cls)) score += 1800;
        if (node.matches('article')) score += 250;
        if (/comment|sidebar|recommend|related|header|footer/i.test(cls)) score -= 2500;
        const paragraphs = node.querySelectorAll('p').length;
        score += Math.min(paragraphs, 80) * 10;
        return score;
    }

    function findContent() {
        const selectors = [
            '.Post-RichTextContainer', '.Post-RichText', '.RichText.ztext',
            '.AnswerItem .RichContent-inner', '.AnswerItem .RichText',
            '.QuestionAnswer-content .RichText', '.RichContent-inner',
            '[data-testid="answer"] .RichText', 'article .RichText',
            '.QuestionHeader-content', 'article'
        ];
        const found = [];
        for (const selector of selectors) {
            document.querySelectorAll(selector).forEach(node => {
                if (node instanceof HTMLElement && !node.closest(`#${ID}-overlay`)) {
                    const score = scoreCandidate(node);
                    if (score > 0) found.push({ node, score });
                }
            });
        }
        found.sort((a, b) => b.score - a.score);
        if (found.length) {
            const best = found[0].node;
            const nested = found.filter(item => best.contains(item.node));
            if (nested.length && nested[0].score > 0) return nested[0].node;
            return best;
        }

        const main = document.querySelector('main');
        if (!main) return null;
        const candidates = [...main.querySelectorAll('div,section,article')].filter(node => {
            const len = textLength(node);
            return len >= 150 && len < 30000 && visible(node);
        });
        candidates.sort((a, b) => {
            const aScore = Math.min(textLength(a), 10000) + Math.min(a.querySelectorAll('p').length, 80) * 12;
            const bScore = Math.min(textLength(b), 10000) + Math.min(b.querySelectorAll('p').length, 80) * 12;
            return bScore - aScore;
        });
        return candidates[0] || null;
    }

    function findTitle() {
        const selectors = [
            '.Post-Title', '.QuestionHeader-title', '.QuestionHeader-main .QuestionHeader-title',
            'h1[data-testid="question-title"]', 'main h1', 'article h1', 'h1'
        ];
        for (const selector of selectors) {
            const node = [...document.querySelectorAll(selector)].find(visible);
            const text = node?.innerText?.trim();
            if (text && text.length > 2) return text;
        }
        const og = document.querySelector('meta[property="og:title"]')?.content;
        return (og || document.title || '知乎文档').replace(/\s*[-|]\s*知乎\s*$/, '').trim();
    }

    function findMeta() {
        const selectors = ['.AuthorInfo-name', '.AuthorInfo', '.Post-Author', '.QuestionHeader-detail', '.ContentItem-time', '.Post-Meta'];
        const parts = [];
        for (const selector of selectors) {
            const node = [...document.querySelectorAll(selector)].find(visible);
            const text = node?.innerText?.replace(/\s+/g, ' ').trim();
            if (text && !parts.includes(text) && text.length < 180) parts.push(text);
            if (parts.join(' · ').length > 180) break;
        }
        return parts.join(' · ') || '知乎内容';
    }

    function cleanClone(node) {
        const clone = node.cloneNode(true);
        clone.querySelectorAll('script,style,button,input,textarea,select,form,[contenteditable="true"],[aria-hidden="true"],[role="toolbar"],.ContentItem-actions,.RichContent-actions,.Comments-container,.CommentListV2').forEach(el => el.remove());
        clone.querySelectorAll('*').forEach(el => {
            [...el.attributes].forEach(attr => {
                if (attr.name.startsWith('on') || attr.name === 'srcset') el.removeAttribute(attr.name);
            });
        });
        clone.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('data-original') || img.getAttribute('data-actualsrc') || img.getAttribute('data-src') || img.getAttribute('src');
            if (src) img.setAttribute('src', src);
            img.removeAttribute('loading');
            img.style.maxWidth = '100%';
        });
        clone.querySelectorAll('a').forEach(a => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        });
        return clone;
    }

    function commentScope() {
        if (!currentSource?.isConnected) return document;
        return currentSource.closest('.AnswerItem, .ContentItem, .AnswerItemV2, [data-testid="answer"], article, .Post, .QuestionAnswer-content') || document;
    }

    function collectComments() {
        const scope = commentScope();
        for (const selector of ['.CommentItemV2', '.CommentItem', '[data-testid="comment-item"]']) {
            const items = [...scope.querySelectorAll(selector)]
                .filter(node => !node.closest(`#${ID}-overlay`) && visible(node));
            if (items.length) return { items, count: items.length };
        }
        const containers = [...scope.querySelectorAll('.Comments-container, .CommentsV2, .CommentListV2, .Post-Comments, [data-testid="comments"]')]
            .filter(node => !node.closest(`#${ID}-overlay`) && visible(node));
        if (!containers.length) return null;
        containers.sort((a, b) => textLength(b) - textLength(a));
        return { items: [containers[0]], count: 0 };
    }

    function cleanCommentClone(node) {
        const clone = node.cloneNode(true);
        clone.querySelectorAll('button,input,textarea,select,form,svg,img,[role="button"],[contenteditable="true"],[class*="Avatar"],[class*="avatar"],[class*="VoteButton"],[class*="CommentItem-actions"],[class*="CommentItemV2-actions"],[class*="ShareMenu"],[class*="CommentEditor"]').forEach(el => el.remove());
        clone.querySelectorAll('*').forEach(el => {
            [...el.attributes].forEach(attr => {
                if (attr.name.startsWith('on') || attr.name === 'srcset') el.removeAttribute(attr.name);
            });
        });
        clone.querySelectorAll('a').forEach(a => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        });
        return clone;
    }

    function renderComments() {
        if (!overlay) return;
        const page = overlay.querySelector('.zwm-page');
        if (!page) return;
        page.querySelector('.zwm-comments')?.remove();
        if (!settings.includeComments) return;
        commentToken += 1;

        const found = collectComments();
        const section = document.createElement('section');
        section.className = 'zwm-comments';
        const heading = document.createElement('h2');
        heading.textContent = found?.count ? `评论 · ${found.count}` : '评论';
        section.appendChild(heading);

        if (!found) {
            const note = document.createElement('p');
            note.className = 'zwm-comment-note';
            note.textContent = '评论还没有加载。回网页点开评论区,再点「重新识别正文」。';
            section.appendChild(note);
        } else {
            found.items.forEach(item => {
                const wrap = document.createElement('div');
                wrap.className = 'zwm-comment';
                wrap.appendChild(cleanCommentClone(item));
                section.appendChild(wrap);
            });
        }
        page.appendChild(section);

        const target = getContentTarget();
        if (!target) return;
        const key = `${target.type}:${target.id}`;
        const cached = commentCache.get(key);
        if (cached) {
            renderApiComments(section, cached);
            return;
        }
        if (!found) {
            section.querySelector('.zwm-comment-note')?.remove();
            const loading = document.createElement('p');
            loading.className = 'zwm-comment-note';
            loading.textContent = '正在加载评论…';
            section.appendChild(loading);
        }
        loadApiComments(section, target, key);
    }

    function getContentTarget() {
        const answer = location.pathname.match(/\/question\/\d+\/answer\/(\d+)/) ||
            location.pathname.match(/\/answer\/(\d+)/);
        if (answer) return { type: 'answer', id: answer[1] };
        const article = location.pathname.match(/\/p\/(\d+)/);
        if (article) return { type: 'article', id: article[1] };
        return null;
    }

    function commentsApiUrl(target, offset) {
        const base = target.type === 'article'
            ? `https://www.zhihu.com/api/v4/articles/${target.id}/comments`
            : `https://www.zhihu.com/api/v4/answers/${target.id}/comments`;
        return `${base}?limit=20&offset=${offset}`;
    }

    async function fetchCommentsPage(target, offset) {
        const response = await fetch(commentsApiUrl(target, offset), {
            credentials: 'include',
            headers: { 'x-requested-with': 'fetch', accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload.data)) throw new Error('评论数据格式异常');
        return payload;
    }

    function sanitizeCommentHtml(html) {
        const template = document.createElement('template');
        template.innerHTML = html || '';
        const holder = template.content;
        holder.querySelectorAll('img').forEach(img => {
            const alt = img.getAttribute('alt');
            if (alt) img.replaceWith(document.createTextNode(alt));
            else img.remove();
        });
        holder.querySelectorAll('script,style,iframe,object,embed,svg,button,input,textarea,select,form').forEach(el => el.remove());
        holder.querySelectorAll('*').forEach(el => {
            [...el.attributes].forEach(attr => {
                if (attr.name.startsWith('on') || ['style', 'class', 'id', 'srcset'].includes(attr.name)) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        holder.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href') || '';
            if (href && !/^(https?:\/\/|\/|#)/i.test(href)) a.removeAttribute('href');
        });
        const output = document.createElement('div');
        output.appendChild(holder);
        return output.innerHTML;
    }

    function buildComment(comment, child = false) {
        const wrap = document.createElement('div');
        wrap.className = `zwm-comment${child ? ' zwm-comment-child' : ''}`;
        const head = document.createElement('div');
        head.className = 'zwm-comment-head';
        const author = document.createElement('span');
        author.className = 'zwm-comment-author';
        author.textContent = comment.author?.name || '匿名用户';
        const meta = document.createElement('span');
        meta.className = 'zwm-comment-meta';
        const when = comment.created_time
            ? new Date(comment.created_time * 1000).toLocaleString('zh-CN', {
                year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            })
            : '';
        const likes = comment.like_count ? ` · ${comment.like_count} 赞` : '';
        meta.textContent = `${when}${likes}`.trim();
        head.append(author, meta);

        const body = document.createElement('div');
        body.className = 'zwm-comment-body';
        body.innerHTML = sanitizeCommentHtml(comment.content || '');
        body.querySelectorAll('a').forEach(a => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        });
        wrap.append(head, body);
        if (Array.isArray(comment.child_comments)) {
            comment.child_comments.forEach(item => wrap.appendChild(buildComment(item, true)));
        }
        return wrap;
    }

    function renderApiComments(section, state) {
        section.replaceChildren();
        const heading = document.createElement('h2');
        const total = state.total || state.comments.length;
        heading.textContent = total ? `评论 · ${total}` : '评论';
        section.appendChild(heading);

        if (!state.comments.length) {
            const empty = document.createElement('p');
            empty.className = 'zwm-comment-note';
            empty.textContent = '暂无评论。';
            section.appendChild(empty);
            updateStats();
            return;
        }
        state.comments.forEach(comment => section.appendChild(buildComment(comment)));
        if (!state.isEnd) {
            const more = document.createElement('span');
            more.className = 'zwm-load-more';
            more.textContent = '加载更多评论';
            more.addEventListener('click', () => loadMoreComments(section, state));
            section.appendChild(more);
        }
        updateStats();
    }

    function setCommentNote(section, text) {
        section.querySelectorAll('.zwm-comment, .zwm-load-more').forEach(el => el.remove());
        let note = section.querySelector('.zwm-comment-note');
        if (!note) {
            note = document.createElement('p');
            note.className = 'zwm-comment-note';
            section.appendChild(note);
        }
        note.textContent = text;
        updateStats();
    }

    async function loadApiComments(section, target, key) {
        const token = ++commentToken;
        try {
            const payload = await fetchCommentsPage(target, 0);
            if (!isOpen || token !== commentToken || !section.isConnected) return;
            const state = {
                key,
                target,
                comments: payload.data,
                isEnd: Boolean(payload.paging?.is_end),
                total: Number(payload.paging?.totals) || payload.data.length
            };
            commentCache.set(key, state);
            renderApiComments(section, state);
        } catch (err) {
            console.warn('[zhihu-word-mode] 评论接口不可用,使用页面已加载的评论:', err);
            if (!isOpen || token !== commentToken || !section.isConnected) return;
            if (!section.querySelector('.zwm-comment')) {
                setCommentNote(section, '评论还没有加载。回网页点开评论区,再点「重新识别正文」。');
            }
        }
    }

    async function loadMoreComments(section, state) {
        try {
            const payload = await fetchCommentsPage(state.target, state.comments.length);
            if (!isOpen || !section.isConnected) return;
            state.comments.push(...payload.data);
            state.isEnd = Boolean(payload.paging?.is_end);
            state.total = Number(payload.paging?.totals) || state.total;
            commentCache.set(state.key, state);
            renderApiComments(section, state);
        } catch (err) {
            console.warn('[zhihu-word-mode] 加载更多评论失败:', err);
        }
    }

    function createOverlay() {
        if (overlay?.isConnected) return overlay;

        const wordLogo = `
            <svg class="zwm-wordlogo" viewBox="0 0 24 24" aria-hidden="true">
                <defs><linearGradient id="zwm-word-sheet" x1="0.15" y1="0" x2="0.85" y2="1">
                    <stop offset="0" stop-color="#2fc9f2"/><stop offset=".5" stop-color="#0c7bd8"/><stop offset="1" stop-color="#044db4"/>
                </linearGradient></defs>
                <path d="M8 2h11a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8z" fill="url(#zwm-word-sheet)"/>
                <path d="M8 15h6v7H8z" fill="#39b6ea" opacity=".45"/>
                <rect x="1.5" y="10" width="13" height="13" rx="2.5" fill="#0d4a9e"/>
                <path d="M4.1 13.2h2l1.1 5.1 1.2-5.1h1.7l1.2 5.1 1.1-5.1h2l-1.9 7.3h-1.9l-1.2-4.7-1.2 4.7H5.9z" fill="#fff"/>
            </svg>`;

        overlay = document.createElement('div');
        overlay.id = `${ID}-overlay`;
        overlay.innerHTML = `
            <div class="zwm-titlebar">
                <div class="zwm-tb-left">
                    ${wordLogo}
                    <span class="zwm-autosave"><span class="zwm-switch" title="自动保存(示意)"></span>自动保存</span>
                    <span class="zwm-qat">
                        <button class="zwm-qbtn" title="保存"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h12l4 4v12H4z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/></svg></button>
                        <button class="zwm-qbtn" data-action="print" title="打印"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 8V3h10v5"/><rect x="4" y="8" width="16" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/></svg></button>
                        <button class="zwm-qbtn" title="撤销"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 7L4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6"/></svg></button>
                        <button class="zwm-qbtn" title="重做"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M15 7l5 5-5 5"/><path d="M20 12h-9a6 6 0 0 0-6 6"/></svg></button>
                    </span>
                    <span class="zwm-docname"></span><span class="zwm-caret">▾</span>
                </div>
                <div class="zwm-search">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
                    <input placeholder="搜索" aria-label="搜索">
                </div>
                <div class="zwm-tb-right">
                    <span class="zwm-signin">登录</span>
                    <span class="zwm-winctl">
                        <span>—</span><span>▢</span><span class="zwm-close" data-action="close" title="返回网页">×</span>
                    </span>
                </div>
            </div>

            <div class="zwm-tabrow">
                <span class="zwm-tab zwm-file">文件</span>
                <span class="zwm-tab zwm-active">开始</span>
                <span class="zwm-tab">插入</span>
                <span class="zwm-tab">设计</span>
                <span class="zwm-tab">布局</span>
                <span class="zwm-tab">引用</span>
                <span class="zwm-tab">邮件</span>
                <span class="zwm-tab">审阅</span>
                <span class="zwm-tab">视图</span>
                <span class="zwm-tab">帮助</span>
                <span class="zwm-tabactions">
                    <button class="zwm-tabaction">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4c6b7d" stroke-width="1.7" stroke-linejoin="round"><path d="M20 14a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M8 8h8M8 11.5h5"/></svg>
                        批注
                    </button>
                    <button class="zwm-tabaction">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4c6b7d" stroke-width="1.7"><path d="M4 20l3.6-1 11-11a2.2 2.2 0 0 0-3.1-3.1l-11 11z"/><path d="M13.5 6.5l4 4"/></svg>
                        编辑<span class="zwm-caret">▾</span>
                    </button>
                    <button class="zwm-tabaction zwm-primary">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15 15.2a4.6 4.6 0 0 1 6.5 3.8"/></svg>
                        共享<span class="zwm-caret">▾</span>
                    </button>
                </span>
            </div>

            <div class="zwm-ribbon">
                <div class="zwm-rgroup">
                    <div class="zwm-ritems">
                        <button class="zwm-rbtn" style="align-self:stretch;justify-content:center">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b6b8f" stroke-width="1.4" stroke-linejoin="round"><rect x="6" y="5" width="13" height="16" rx="1.5"/><rect x="9" y="2.8" width="7" height="3.6" rx="1"/><path d="M9 10.5h7M9 13.5h7M9 16.5h4.5"/></svg>
                            <small>粘贴</small>
                        </button>
                        <div class="zwm-clipstack">
                            <button class="zwm-mini" title="剪切"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b6b8f" stroke-width="1.5"><circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.4 7.8 20 18M8.4 16.2 20 6"/></svg></button>
                            <button class="zwm-mini" title="复制"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b6b8f" stroke-width="1.5"><rect x="8" y="8" width="12" height="13" rx="1.4"/><path d="M16 8V4.5A1.5 1.5 0 0 0 14.5 3H5.5A1.5 1.5 0 0 0 4 4.5v10A1.5 1.5 0 0 0 5.5 16H8"/></svg></button>
                            <button class="zwm-mini" title="格式刷"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b6b8f" stroke-width="1.5"><rect x="7" y="3.5" width="12" height="7" rx="1.2"/><rect x="5" y="13.5" width="12" height="7" rx="1.2"/><path d="M19 7h2.5v6.5H17"/></svg></button>
                        </div>
                    </div>
                    <div class="zwm-rlabel">剪贴板</div>
                </div>

                <div class="zwm-rgroup">
                    <div class="zwm-ritems">
                        <div class="zwm-rstack">
                            <div class="zwm-rrow">
                                <span class="zwm-box" style="width:104px">等线(西文正文) <span class="zwm-caret">▾</span></span>
                                <span class="zwm-box" style="width:34px"><span class="zwm-fontsize">16</span> <span class="zwm-caret">▾</span></span>
                                <button class="zwm-mini" data-action="font-up" title="增大字号"><span style="font-size:12px">A</span><span style="font-size:6px;margin-left:-1px">˄</span></button>
                                <button class="zwm-mini" data-action="font-down" title="减小字号"><span style="font-size:12px">A</span><span style="font-size:6px;margin-left:-1px">˅</span></button>
                                <button class="zwm-mini" title="更改大小写" style="font-size:10px;font-weight:600">Aa</button>
                                <button class="zwm-mini" title="文字效果"><span style="font-size:12px;font-weight:600;text-shadow:0 0 2px #7fb3e8">A</span></button>
                                <button class="zwm-mini" title="文本突出显示"><span style="font-size:10px;font-weight:600;border-bottom:3px solid #f2c94c;line-height:1">A</span></button>
                                <button class="zwm-mini" title="字体颜色"><span style="font-size:12px;font-weight:600;border-bottom:3px solid #c0392b;line-height:1">A</span></button>
                            </div>
                            <div class="zwm-rrow">
                                <button class="zwm-mini" title="加粗" style="font-weight:800;font-size:12px">B</button>
                                <button class="zwm-mini" title="倾斜" style="font-style:italic;font-family:Georgia,serif;font-size:13px">I</button>
                                <button class="zwm-mini" title="下划线" style="font-size:12px;text-decoration:underline;text-decoration-color:#2b579a">U<span style="font-size:6px;margin-left:1px">▾</span></button>
                                <button class="zwm-mini" title="删除线" style="text-decoration:line-through;font-size:9px">abc</button>
                                <button class="zwm-mini" title="上标" style="font-size:10px">x<sup>2</sup></button>
                                <button class="zwm-mini" title="下标" style="font-size:10px">x<sub>2</sub></button>
                                <button class="zwm-mini" title="清除所有格式"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.5" stroke-linejoin="round"><path d="M14 4l6 6-8.5 8.5H6L4 16z"/><path d="M11.5 7.5l5 5M4 21h9"/></svg></button>
                            </div>
                        </div>
                    </div>
                    <div class="zwm-rlabel">字体</div>
                    <span class="zwm-launcher" data-action="settings" title="字体与版式设置">◢</span>
                </div>

                <div class="zwm-rgroup">
                    <div class="zwm-ritems">
                        <div class="zwm-rstack">
                            <div class="zwm-rrow">
                                <button class="zwm-mini" title="项目符号"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.8"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.3" fill="#444"/><circle cx="4.5" cy="12" r="1.3" fill="#444"/><circle cx="4.5" cy="18" r="1.3" fill="#444"/></svg></button>
                                <button class="zwm-mini" title="编号"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.8"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 4.5h1.5V8M3.6 12h2.2l-2.2 3h2.2" stroke-width="1.2"/></svg></button>
                                <button class="zwm-mini" title="多级列表"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.8"><path d="M9 6h11M9 12h11M9 18h11M4 5h2v2H4zM3.5 11h2v2h-2z"/></svg></button>
                                <button class="zwm-mini" title="减少缩进"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.8"><path d="M4 6h16M11 12h9M4 18h16M9 9l-3 3 3 3"/></svg></button>
                                <button class="zwm-mini" title="增加缩进"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.8"><path d="M4 6h16M11 12h9M4 18h16M7 9l3 3-3 3"/></svg></button>
                                <button class="zwm-mini" title="排序"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.7"><path d="M4 6h9M4 12h7M4 18h9"/><path d="M19 5v14M16.5 16.5 19 19l2.5-2.5"/></svg></button>
                            </div>
                            <div class="zwm-rrow">
                                <button class="zwm-mini zwm-active" title="左对齐"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="1.9"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg></button>
                                <button class="zwm-mini" title="居中"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.9"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg></button>
                                <button class="zwm-mini" title="右对齐"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.9"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg></button>
                                <button class="zwm-mini" title="两端对齐"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.9"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg></button>
                                <button class="zwm-mini" data-action="settings" title="行距与版式"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.8"><path d="M4 5h13M4 12h13M4 19h13M20 8v8M20 8l-2 2M20 8l2 2M20 16l-2-2M20 16l2-2"/></svg></button>
                                <button class="zwm-mini" title="底纹"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.6"><path d="M5 4h14l-7 16z"/><path d="M8 9h8"/></svg></button>
                                <button class="zwm-mini" title="边框"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.6"><rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="M3.5 12h17M12 3.5v17" stroke-dasharray="2 2"/></svg></button>
                            </div>
                        </div>
                    </div>
                    <div class="zwm-rlabel">段落</div>
                    <span class="zwm-launcher" data-action="settings" title="段落与版式设置">◢</span>
                </div>

                <div class="zwm-rgroup">
                    <div class="zwm-ritems">
                        <div class="zwm-stylegal">
                            <span class="zwm-style zwm-sel">正文</span>
                            <span class="zwm-style">无间隔</span>
                            <span class="zwm-style zwm-big">标题</span>
                            <span class="zwm-stylearrow">▾</span>
                        </div>
                    </div>
                    <div class="zwm-rlabel">样式</div>
                </div>

                <div class="zwm-rgroup">
                    <div class="zwm-ritems">
                        <div class="zwm-editlist">
                            <button class="zwm-editrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b6b8f" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>查找<span class="zwm-caret">▾</span></button>
                            <button class="zwm-editrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b6b8f" stroke-width="1.7"><path d="M4 7h9M4 12h6M4 17h9"/><path d="M15 15l6 6M21 15l-6 6"/></svg>替换<span class="zwm-caret">▾</span></button>
                            <button class="zwm-editrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b6b8f" stroke-width="1.7"><path d="M5 3l6 17 2.4-7.2L21 10.4z"/></svg>选择<span class="zwm-caret">▾</span></button>
                        </div>
                    </div>
                    <div class="zwm-rlabel">编辑</div>
                </div>

                <div class="zwm-rgroup">
                    <div class="zwm-ritems">
                        <button class="zwm-rbtn" style="align-self:stretch;justify-content:center"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#3b6b8f" stroke-width="1.6"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7"/></svg><small>听写</small></button>
                    </div>
                    <div class="zwm-rlabel">语音</div>
                </div>

                <div class="zwm-rgroup">
                    <div class="zwm-ritems">
                        <button class="zwm-rbtn" style="align-self:stretch;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2b64a8" stroke-width="1.6"><path d="M4 20l3.6-1 11-11a2.2 2.2 0 0 0-3.1-3.1l-11 11z"/><path d="M13.5 6.5l4 4"/></svg><small>编辑器</small></button>
                    </div>
                    <div class="zwm-rlabel">编辑器</div>
                </div>

                <div class="zwm-rgroup">
                    <div class="zwm-ritems">
                        <button class="zwm-rbtn" style="align-self:stretch;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b4552d" stroke-width="1.6"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><path d="M17 13.5v7M13.5 17h7"/></svg><small>加载项</small></button>
                    </div>
                    <div class="zwm-rlabel">加载项</div>
                </div>

                <button class="zwm-collapse" title="折叠功能区">▾</button>
            </div>

            <div class="zwm-docscroll">
                <div class="zwm-page">
                    <h1 class="zwm-document-title"></h1>
                    <div class="zwm-document-meta"></div>
                    <div class="zwm-article-content"></div>
                </div>
            </div>

            <div class="zwm-statusbar">
                <span class="zwm-pagecount">第 1 页,共 1 页</span>
                <span class="zwm-wordcount">0 个字</span>
                <span>简体中文(中国大陆)</span>
                <span>辅助功能:一切就绪</span>
                <span class="zwm-right">
                    <span class="zwm-viewbtns">
                        <span class="zwm-on" title="页面视图"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M7 7h10M7 10h10M7 13h6"/></svg></span>
                        <span title="阅读视图"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16v14H4z"/><path d="M12 5v14"/></svg></span>
                        <span title="Web 版式"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3.5 3 12.5 0 16M12 4c-3 3.5-3 12.5 0 16"/></svg></span>
                    </span>
                    <span class="zwm-zoom">
                        <span>−</span>
                        <input type="range" min="80" max="150" value="100" class="zwm-zoom-input" aria-label="缩放">
                        <span class="zwm-pct zwm-zoomval">100%</span>
                    </span>
                </span>
            </div>

            <div class="zwm-settings">
                <div class="zwm-settings-card">
                    <h2>字体与版式</h2>
                    <label class="zwm-setting"><span>字号</span><input name="fontSize" type="range" min="13" max="22" step="1"><output></output></label>
                    <label class="zwm-setting"><span>行距</span><input name="lineHeight" type="range" min="1.4" max="2.3" step="0.1"><output></output></label>
                    <label class="zwm-setting"><span>纸张宽度</span><input name="pageWidth" type="range" min="620" max="1100" step="20"><output></output></label>
                    <label class="zwm-setting"><span>主题</span><select name="theme"><option value="light">浅色</option><option value="dark">深色</option></select><output></output></label>
                    <label class="zwm-setting"><span>文档名</span><input name="docName" type="text" placeholder="文档1.docx"></label>
                    <label class="zwm-setting"><span>文末评论</span><input name="includeComments" type="checkbox"></label>
                    <div class="zwm-settings-actions">
                        <button data-action="refresh">重新识别正文</button>
                        <button data-action="reset">恢复默认</button>
                        <button class="zwm-primary" data-action="settings-close">完成</button>
                    </div>
                    <div class="zwm-signature">ππ</div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.addEventListener('click', event => {
            const actionNode = event.target.closest('[data-action]');
            if (actionNode) handleAction(actionNode.dataset.action);
            if (event.target.classList.contains('zwm-settings')) closeSettings();
        });

        overlay.querySelectorAll('.zwm-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.classList.contains('zwm-file')) return;
                overlay.querySelectorAll('.zwm-tab').forEach(t => t.classList.remove('zwm-active'));
                tab.classList.add('zwm-active');
            });
        });

        overlay.querySelector('.zwm-switch').addEventListener('click', function () {
            this.classList.toggle('zwm-on');
        });

        overlay.querySelectorAll('.zwm-setting input').forEach(input => {
            input.addEventListener('input', () => {
                settings[input.name] = input.type === 'checkbox'
                    ? input.checked
                    : input.type === 'text'
                        ? input.value
                        : Number(input.value);
                saveSettings();
                applySettings();
                if (input.name === 'includeComments') {
                    renderComments();
                    updateStats();
                }
                syncControls();
            });
        });

        const themeSelect = overlay.querySelector('.zwm-setting select[name="theme"]');
        if (themeSelect) {
            themeSelect.addEventListener('change', () => {
                settings.theme = themeSelect.value;
                saveSettings();
                applySettings();
            });
        }

        const zoomInput = overlay.querySelector('.zwm-zoom-input');
        if (zoomInput) {
            zoomInput.addEventListener('input', () => {
                settings.zoom = Number(zoomInput.value);
                saveSettings();
                applySettings();
                syncControls();
            });
        }

        return overlay;
    }

    function renderDocument() {
        const source = findContent();
        if (!source) {
            alert('暂时没有识别到正文。请等页面内容加载完成后再点“重新识别正文”;如果仍失败,请提供页面类型和控制台错误。');
            return false;
        }
        const app = createOverlay();
        const title = findTitle();
        app.querySelector('.zwm-document-title').textContent = title;
        app.querySelector('.zwm-document-meta').textContent = findMeta();
        currentSource = source;
        app.querySelector('.zwm-article-content').replaceChildren(cleanClone(source));
        renderComments();
        app.classList.add(`${ID}-visible`);
        isOpen = true;
        applySettings();
        updateStats();
        app.querySelector('.zwm-docscroll').scrollTop = 0;
        document.documentElement.style.overflow = 'hidden';
        return true;
    }

    function applySettings() {
        if (!overlay) return;
        overlay.style.setProperty('--zwm-font-size', `${settings.fontSize}px`);
        overlay.style.setProperty('--zwm-line-height', String(settings.lineHeight));
        overlay.style.setProperty('--zwm-page-width', `${settings.pageWidth}px`);
        overlay.classList.toggle('zwm-dark', settings.theme === 'dark');
        const page = overlay.querySelector('.zwm-page');
        if (page) page.style.zoom = settings.zoom / 100;
        const docName = getDocName();
        const nameEl = overlay.querySelector('.zwm-docname');
        if (nameEl) nameEl.textContent = docName;
        if (isOpen) applyPageIdentity(docName);
        syncControls();
        updateStats();
    }

    function syncControls() {
        if (!overlay) return;
        overlay.querySelectorAll('.zwm-setting input').forEach(input => {
            if (input.type === 'checkbox') input.checked = Boolean(settings[input.name]);
            else input.value = settings[input.name] ?? '';
            const out = input.parentElement.querySelector('output');
            if (out) {
                out.textContent = (input.type === 'text' || input.type === 'checkbox')
                    ? ''
                    : input.name === 'lineHeight'
                        ? Number(settings[input.name]).toFixed(1)
                        : `${settings[input.name]} px`;
            }
        });
        const themeSelect = overlay.querySelector('.zwm-setting select[name="theme"]');
        if (themeSelect) themeSelect.value = settings.theme;
        const fontBox = overlay.querySelector('.zwm-fontsize');
        if (fontBox) fontBox.textContent = settings.fontSize;
        const zoomLabel = overlay.querySelector('.zwm-zoomval');
        if (zoomLabel) zoomLabel.textContent = `${settings.zoom}%`;
        const zoomInput = overlay.querySelector('.zwm-zoom-input');
        if (zoomInput) zoomInput.value = settings.zoom;
    }

    function updateStats() {
        if (!overlay) return;
        const content = overlay.querySelector('.zwm-article-content');
        const comments = overlay.querySelector('.zwm-comments');
        const wordCount = overlay.querySelector('.zwm-wordcount');
        if (content && wordCount) {
            const chars = ((content.innerText || '') + (comments?.innerText || '')).replace(/\s+/g, '').length;
            wordCount.textContent = `${chars} 个字`;
        }
        const page = overlay.querySelector('.zwm-page');
        const pageCount = overlay.querySelector('.zwm-pagecount');
        if (page && pageCount) {
            const pages = Math.max(1, Math.ceil(page.offsetHeight / 1080));
            pageCount.textContent = `第 1 页,共 ${pages} 页`;
        }
    }

    function openSettings() {
        if (!overlay) return;
        overlay.querySelector('.zwm-settings').classList.add('zwm-settings-open');
        syncControls();
    }

    function closeSettings() {
        if (!overlay) return;
        overlay.querySelector('.zwm-settings').classList.remove('zwm-settings-open');
    }

    function closeMode() {
        commentToken += 1;
        restorePageIdentity();
        if (overlay) overlay.classList.remove(`${ID}-visible`);
        isOpen = false;
        document.documentElement.style.overflow = '';
    }

    function toggleMode() {
        if (isOpen) closeMode();
        else renderDocument();
    }

    function bumpFont(delta) {
        settings.fontSize = Math.min(22, Math.max(13, settings.fontSize + delta));
        saveSettings();
        applySettings();
    }

    function handleAction(action) {
        switch (action) {
            case 'close': closeMode(); break;
            case 'print': window.print(); break;
            case 'settings': openSettings(); break;
            case 'settings-close': closeSettings(); break;
            case 'font-up': bumpFont(1); break;
            case 'font-down': bumpFont(-1); break;
            case 'refresh': closeSettings(); renderDocument(); break;
            case 'reset': settings = { ...DEFAULTS }; saveSettings(); applySettings(); break;
        }
    }

    function onKeydown(event) {
        if (event.altKey && event.key.toLowerCase() === 'w') {
            event.preventDefault();
            toggleMode();
        } else if (event.key === 'Escape' && isOpen) {
            closeMode();
        }
    }

    function ensureInitialized() {
        if (!isRelevantPage() || !document.body) return;
        injectStyle();
        addLauncher();
        if (!overlay?.isConnected && isOpen) isOpen = false;
    }

    function onRouteChange() {
        if (location.href === lastRoute) return;
        lastRoute = location.href;
        closeMode();
        ensureInitialized();
    }

    function init() {
        ensureInitialized();
        document.addEventListener('keydown', onKeydown, true);
        const originalPushState = history.pushState;
        history.pushState = function (...args) {
            const result = originalPushState.apply(this, args);
            queueRouteCheck();
            return result;
        };
        window.addEventListener('popstate', queueRouteCheck);
        window.addEventListener('hashchange', queueRouteCheck);
        const observer = new MutationObserver(() => {
            if (!document.getElementById(`${ID}-launcher`) && document.body) ensureInitialized();
            queueRouteCheck();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function queueRouteCheck() {
        clearTimeout(routeTimer);
        routeTimer = setTimeout(onRouteChange, 120);
    }

    init();
})();
