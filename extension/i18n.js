import {english} from './messages.js';
export let language = 'zh-CN';
export const normalizeLanguage = value => value === 'en' ? 'en' : 'zh-CN';
export function tr(key, values = {}) {
  const template = language === 'en' ? (english[key] ?? key) : key;
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}
// The 0.2.0 helper supplies Chinese messages. Translate presentation only; never task data or diagnostics.
const legacyMessages = {
  "未能解析此页面，请先播放视频，再点击「检测页面视频」": "未能解析此页面，请尝试视频原页面或有效的媒体链接",
  "网站拒绝下载请求，可能需要登录或来源校验；请尝试「检测页面视频」": "网站拒绝下载请求，可能需要登录或来源校验，请检查原页面",
  "请打开单个视频页面，或点击「检测页面视频」": "请打开单个视频的原页面，或粘贴有效的媒体链接",
  "仅支持 HTTP 或 HTTPS 视频链接；blob 地址请使用「检测页面视频」": "仅支持 HTTP 或 HTTPS 视频链接，不能直接下载 blob 地址",
  "页面包含多个视频，请打开其中一个，或使用「检测页面视频」选择": "页面包含多个视频，请打开其中一个视频的原页面"
};
export function helperText(value = '') {
  value = legacyMessages[value] ?? value;
  if (language !== 'en') return value;
  if (Object.hasOwn(english, value)) return english[value];
  const timeout = /^启动检测超过 (\d+) 秒，请稍后重新检测$/.exec(value);
  if (timeout) return tr('启动检测超过 {seconds} 秒，请稍后重新检测', {seconds: timeout[1]});
  if (value.endsWith('，校验通过')) return tr('{version}，校验通过', {version: tr(value.slice(0, -5))});
  if (value === 'yt-dlp-ejs / 完整性') return 'yt-dlp-ejs / Integrity';
  return value;
}
export async function saveLanguage(value, storage = chrome.storage.local) {
  const next = normalizeLanguage(value);
  await storage.set({language: next});
  return next;
}
export async function initLanguage(onChange = () => {}) {
  const select = document.getElementById('language');
  const status = document.getElementById('language-status');
  const apply = value => {
    language = normalizeLanguage(value);
    document.documentElement.lang = language;
    select.value = language;
    for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = tr(element.dataset.i18n);
    for (const attribute of ['placeholder', 'aria-label', 'title']) {
      for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) element.setAttribute(attribute, tr(element.getAttribute(`data-i18n-${attribute}`)));
    }
    for (const panel of document.querySelectorAll('[data-language-panel]')) panel.hidden = panel.dataset.languagePanel !== language;
    onChange();
  };
  const initial = await chrome.storage.local.get('language').catch(() => ({}));
  apply(initial.language);
  select.addEventListener('change', async () => {
    select.disabled = true;
    status.hidden = true;
    try { apply(await saveLanguage(select.value)); }
    catch { select.value = language; status.textContent = tr('语言设置未能保存，请重试'); status.hidden = false; }
    finally { select.disabled = false; }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.language) apply(changes.language.newValue);
  });
}
