// ツールバーのアイコンをクリックしたらサイドパネルを開く。
// 失敗した場合は catch せず、未処理の拒否として Service Worker のコンソールに出す。
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
