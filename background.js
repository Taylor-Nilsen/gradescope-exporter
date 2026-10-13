chrome.action.onClicked.addListener(tab => {
  chrome.tabs.create({ url: chrome.runtime.getURL('export.html') + '?u=' + encodeURIComponent(tab.url || '') });
});
