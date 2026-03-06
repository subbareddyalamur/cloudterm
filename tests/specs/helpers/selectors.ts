/**
 * Central selector registry for all CloudTerm UI elements.
 * Using data-attributes and IDs from the actual index.html.
 */

// Sidebar
export const SIDEBAR = {
  container: '.sidebar',
  tree: '#treeContainer',
  filterInput: '#filterInput',
  scanBtn: '#scanBtn',
  summaryBtn: '#summaryBtn',
  favoritesSection: '#favoritesSection',
  sshCount: '#sshCount',
  rdpCount: '#rdpCount',
  activeLabel: '#activeLabel',
  activeInstanceId: '#activeInstanceId',
  activeRegion: '#activeRegion',
};

// Topbar
export const TOPBAR = {
  zoomOut: '#zoomOutBtn',
  zoomLevel: '#zoomLevel',
  zoomIn: '#zoomInBtn',
  inputSync: '#inputSyncBtn',
  broadcast: '#broadcastBtn',
  history: '#historyBtn',
  snippets: '#snippetsBtn',
  recordings: '#recordingsBtn',
  settings: '#settingsBtn',
  themeToggle: '#themeToggleBtn',
};

// Tab bar
export const TABS = {
  bar: '#tabBar',
  tab: '.tab',
  activeTab: '.tab.active-ssh, .tab.active-rdp',
  tabClose: '.tab-close',
  tabExport: '.tab-export',
  tabRecBtn: '.tab-rec-btn',
  tabRec: '.tab-rec',
};

// Welcome panel
export const WELCOME = {
  panel: '#welcomePanel',
  title: '.welcome-title',
  hint: '.welcome-hint',
};

// Context menu
export const CTX_MENU = {
  container: '#ctxMenu',
  item: '.ctx-item',
  ssh: '.ctx-item[data-action="ssh"]',
  rdp: '.ctx-item[data-action="rdp"]',
  copyId: '.ctx-item[data-action="copy-id"]',
  copyIp: '.ctx-item[data-action="copy-ip"]',
  details: '.ctx-item[data-action="details"]',
  favorite: '.ctx-item[data-action="favorite"]',
  browse: '.ctx-item[data-action="browse"]',
  broadcast: '.ctx-item[data-action="broadcast"]',
  portForward: '.ctx-item[data-action="port-forward"]',
  upload: '.ctx-item[data-action="upload"]',
  download: '.ctx-item[data-action="download"]',
  expressUpload: '.ctx-item[data-action="express-upload"]',
  expressDownload: '.ctx-item[data-action="express-download"]',
  closeAll: '.ctx-item[data-action="close-all"]',
};

// Modals
export const MODALS = {
  settings: '#settingsModal',
  details: '#detailsModal',
  summary: '#summaryModal',
  upload: '#uploadModal',
  download: '#downloadModal',
  expressUpload: '#expressUploadModal',
  expressDownload: '#expressDownloadModal',
  snippets: '#snippetsModal',
  history: '#historyModal',
  fileBrowser: '#fileBrowserModal',
  broadcast: '#broadcastModal',
  recordings: '#recordingsModal',
  sshReplay: '#sshReplayModal',
  rdpReplay: '#rdpReplayModal',
  portForward: '#portForwardModal',
};

// Settings modal
export const SETTINGS = {
  tabs: '.settings-tab',
  tabGeneral: '.settings-tab[data-tab="general"]',
  tabAppearance: '.settings-tab[data-tab="appearance"]',
  tabAWSAccounts: '.settings-tab[data-tab="aws-accounts"]',
  paneGeneral: '#settingsPane-general',
  paneAppearance: '#settingsPane-appearance',
  paneAWSAccounts: '#settingsPane-aws-accounts',
  s3Bucket: '#settingsS3Bucket',
  autoRecord: '#settingsAutoRecord',
  fontDec: '#settingsFontDec',
  fontInc: '#settingsFontInc',
  fontValue: '#settingsFontValue',
  saveBtn: '#settingsSaveBtn',
  // AWS accounts
  awsAccountsList: '#awsAccountsList',
  awsAcctName: '#awsAcctName',
  awsAcctAccessKey: '#awsAcctAccessKey',
  awsAcctSecretKey: '#awsAcctSecretKey',
  awsAcctSessionToken: '#awsAcctSessionToken',
  awsAcctAddBtn: '#awsAcctAddBtn',
  awsAcctRow: '.aws-acct-row',
  awsAcctScanBtn: '.aws-acct-btn.scan',
  awsAcctDelBtn: '.aws-acct-btn.del',
};

// Broadcast bar
export const BROADCAST = {
  bar: '#broadcastBar',
  input: '#bbInput',
  sessionCount: '#bbSessionCount',
  sendBtn: '#bbSendBtn',
  scriptMode: '#bbScriptMode',
  closeBtn: '#bbCloseBtn',
};

// Terminal search
export const TERM_SEARCH = {
  bar: '#termSearchBar',
  input: '#termSearchInput',
  prev: '#termSearchPrev',
  next: '#termSearchNext',
  close: '#termSearchClose',
};

// Transfer panel
export const TRANSFER = {
  panel: '#transferPanel',
  header: '#transferHeader',
  body: '#transferBody',
  count: '#transferCount',
  collapseBtn: '#transferCollapseBtn',
  closeBtn: '#transferCloseBtn',
};

// Tunnel panel
export const TUNNEL = {
  panel: '#tunnelPanel',
  header: '#tunnelHeader',
  body: '#tunnelBody',
  count: '#tunnelCount',
  collapseBtn: '#tunnelCollapseBtn',
  closeBtn: '#tunnelCloseBtn',
};

// Port Forward modal
export const PORT_FORWARD = {
  modal: '#portForwardModal',
  remotePort: '#pfRemotePort',
  startBtn: '#pfStartBtn',
};

// Theme
export const THEME = {
  dropdown: '#themeDropdown',
  pageTheme: '.theme-opt[data-page-theme]',
  termTheme: '.theme-opt[data-term-theme]',
};

// Toast
export const TOAST = {
  container: '#toast',
  message: '#toastMsg',
};

// Snippets modal
export const SNIPPETS = {
  body: '#snippetsBody',
  exportBtn: '#snippetExportBtn',
  importBtn: '#snippetImportBtn',
};

// History modal
export const HISTORY = {
  body: '#historyBody',
  refreshBtn: '#historyRefreshBtn',
};
